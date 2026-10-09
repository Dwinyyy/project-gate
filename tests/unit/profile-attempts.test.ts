import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearProfileAttempts,
  confirmProfileAttempt,
  quarantineProfileAttempts,
  readProfileAttempt,
  storeProfileAttempt,
  profileRequestIsCurrent,
  prepareProfileAttempt,
  assertProfileRequestReady,
  settleProfileAttemptFailure,
  isProfileSessionIneligible,
  settleProfileAttemptSuccess,
  beginProfileAttempt,
  setProfileAttemptDraft,
  profileDraftChangedSinceSubmission,
  type ProfileAttemptState,
} from '../../apps/player/src/profile/profileAttempts';

const key = 'A:session';
const draft = {
  visibility: 'limited' as const,
  showFictionalAvatar: true,
  showRegistrationDate: false,
};
function state(): ProfileAttemptState {
  return {
    draft: { ...draft },
    draftState: 'edited',
    pending: {
      attemptKey: key,
      operationId: 'b24639e1-7d9b-4d10-838d-4d37244b5c00',
      kind: 'save',
      phase: 'submitting',
      input: {
        ...draft,
        characterId: 'f99142b9-1161-4c8b-8c50-f6b599096361',
        expectedRevision: '9007199254740993',
      },
    },
  };
}
beforeEach(() => clearProfileAttempts());
describe('transient profile attempts', () => {
  it('quarantines the full body, UUID and unsent draft until a fresh same-session read', () => {
    storeProfileAttempt(key, state());
    quarantineProfileAttempts();
    expect(readProfileAttempt(key)).toEqual({
      ...state(),
      pending: { ...state().pending!, phase: 'quarantined' },
    });
    confirmProfileAttempt(key);
    expect(readProfileAttempt(key)?.pending).toEqual({ ...state().pending!, phase: 'retryable' });
  });
  it('copies terms and draft so callers cannot alter an unresolved exact request', () => {
    const initial = state();
    storeProfileAttempt(key, initial);
    if (initial.pending?.kind !== 'save') throw new Error('Expected save fixture');
    initial.pending.input.expectedRevision = '0';
    initial.draft!.visibility = 'public';
    const read = readProfileAttempt(key)!;
    if (read.pending?.kind !== 'save') throw new Error('Expected save fixture');
    expect(read.pending.input.expectedRevision).toBe('9007199254740993');
    expect(read.draft!.visibility).toBe('limited');
    read.pending.input.expectedRevision = '1';
    const stored = readProfileAttempt(key);
    expect(stored?.pending?.kind === 'save' ? stored.pending.input.expectedRevision : null).toBe(
      '9007199254740993',
    );
  });
  it('retains only the confirmed session and clears on replacement or signout', () => {
    storeProfileAttempt(key, state());
    storeProfileAttempt('B:replacement', { ...state(), pending: null });
    clearProfileAttempts(key);
    expect(readProfileAttempt('B:replacement')).toBeNull();
    expect(readProfileAttempt(key)?.pending?.operationId).toBe(state().pending?.operationId);
    clearProfileAttempts();
    expect(readProfileAttempt(key)).toBeNull();
  });
  it('a terminal stale attempt can be cleared while its unsent draft stays deliberate', () => {
    storeProfileAttempt(key, { ...state(), pending: null, draftState: 'stale' });
    expect(readProfileAttempt(key)).toEqual({ draft, draftState: 'stale', pending: null });
  });
  it('old validation generations and bearers never own new requests or offline controls', () => {
    expect(
      profileRequestIsCurrent('A:session:1', 'old', {
        owner: 'A:session:2',
        accessToken: 'new',
        online: true,
      }),
    ).toBe(false);
    expect(
      profileRequestIsCurrent('A:session:2', 'new', {
        owner: 'B:replacement:2',
        accessToken: 'new',
        online: true,
      }),
    ).toBe(false);
    expect(
      profileRequestIsCurrent('A:session:2', 'new', {
        owner: 'A:session:2',
        accessToken: 'new',
        online: false,
      }),
    ).toBe(false);
    expect(
      profileRequestIsCurrent('A:session:2', 'new', {
        owner: 'A:session:2',
        accessToken: 'new',
        online: true,
      }),
    ).toBe(true);
  });
  it('changed terms create a new UUID while exact explicit retries retain their full body', () => {
    const previous = state().pending!;
    const exact = prepareProfileAttempt(key, previous, previous);
    expect(exact.operationId).toBe('b24639e1-7d9b-4d10-838d-4d37244b5c00');
    expect(exact.input).toEqual(previous.input);
    if (previous.kind !== 'save') throw new Error('Expected save fixture');
    const changed = prepareProfileAttempt(
      key,
      { kind: 'save', input: { ...previous.input, visibility: 'public' } },
      previous,
    );
    expect(changed.operationId).not.toBe(previous.operationId);
    expect(changed.operationId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('refuses offline, unconfirmed and already-submitting writes before transport', () => {
    for (const gate of [
      { current: false, confirmed: true, submitting: false },
      { current: true, confirmed: false, submitting: false },
      { current: true, confirmed: true, submitting: true },
    ])
      expect(() => assertProfileRequestReady(gate)).toThrow(
        expect.objectContaining({ code: 'CLIENT_NOT_READY' }),
      );
    expect(() =>
      assertProfileRequestReady({ current: true, confirmed: true, submitting: false }),
    ).not.toThrow();
  });
  it('transport uncertainty retains exact terms and stale conflicts preserve the unsent draft', () => {
    const uncertain = settleProfileAttemptFailure(state(), 'UNAVAILABLE', true);
    expect(uncertain.pending).toEqual({ ...state().pending!, phase: 'retryable' });
    expect(uncertain.draft).toEqual(draft);
    expect(settleProfileAttemptFailure(state(), 'STALE_REVISION', false)).toEqual({
      draft,
      draftState: 'stale',
      pending: null,
    });
    expect(settleProfileAttemptFailure(state(), 'OPERATION_CONFLICT', false)).toEqual({
      draft,
      draftState: 'edited',
      pending: null,
    });
  });
  it('distinguishes definitive session denial from temporary service or new-action denial', () => {
    for (const code of [
      'AUTH_REQUIRED',
      'PASSWORD_UPDATE_REQUIRED',
      'PASSWORD_SIGN_IN_REQUIRED',
      'EMAIL_VERIFICATION_REQUIRED',
      'OPERATOR_ONLY',
      'AUTH_INELIGIBLE',
    ])
      expect(isProfileSessionIneligible(code, code === 'AUTH_REQUIRED' ? 401 : 403)).toBe(true);
    for (const code of [
      'PROFILE_SERVICE_UNAVAILABLE',
      'PROFILE_SHARING_UNAVAILABLE',
      'ACCOUNT_RESTRICTED',
      'CHARACTER_ACTION_UNAVAILABLE',
      'STALE_REVISION',
      'OPERATION_CONFLICT',
    ])
      expect(isProfileSessionIneligible(code, 503)).toBe(false);
  });
  it('receipt replay clears only the attempt and never overwrites an unsent draft with current settings', () => {
    const current = {
      visibility: 'private' as const,
      showFictionalAvatar: false,
      showRegistrationDate: false,
    };
    expect(settleProfileAttemptSuccess(state(), current, draft, true)).toEqual({
      draft,
      draftState: 'edited',
      pending: null,
    });
    expect(settleProfileAttemptSuccess(state(), draft, draft, false)).toEqual({
      draft,
      draftState: 'clean',
      pending: null,
    });
    const unsent = { ...draft, visibility: 'public' as const };
    expect(settleProfileAttemptSuccess({ ...state(), draft: unsent }, draft, draft, false)).toEqual(
      { draft: unsent, draftState: 'edited', pending: null },
    );
  });
  it('preserves a newer clean revert when an earlier save confirms different settings', () => {
    const privateDraft = {
      visibility: 'private' as const,
      showFictionalAvatar: false,
      showRegistrationDate: false,
    };
    const limitedDraft = { ...privateDraft, visibility: 'limited' as const };
    const laterDraft: ProfileAttemptState = {
      ...state(),
      draft: privateDraft,
      draftState: 'clean',
    };
    expect(settleProfileAttemptSuccess(laterDraft, limitedDraft, limitedDraft, false)).toEqual({
      draft: privateDraft,
      draftState: 'edited',
      pending: null,
    });
  });
  it('keeps later revert intent through response loss, quarantine and the exact original retry', () => {
    const privateDraft = {
      visibility: 'private' as const,
      showFictionalAvatar: false,
      showRegistrationDate: false,
    };
    const limitedDraft = { ...privateDraft, visibility: 'limited' as const };
    const initial = state();
    if (initial.pending?.kind !== 'save') throw new Error('Expected save fixture');
    const terms = { kind: 'save' as const, input: { ...initial.pending.input, ...limitedDraft } };
    storeProfileAttempt(key, { draft: limitedDraft, draftState: 'edited', pending: null });
    const original = prepareProfileAttempt(key, terms, null);
    beginProfileAttempt(original);
    storeProfileAttempt(key, { draft: limitedDraft, draftState: 'edited', pending: original });
    setProfileAttemptDraft(key, privateDraft, privateDraft);
    expect(readProfileAttempt(key)?.draftState).toBe('clean');
    storeProfileAttempt(
      key,
      settleProfileAttemptFailure(readProfileAttempt(key)!, 'UNAVAILABLE', true),
    );
    quarantineProfileAttempts();
    confirmProfileAttempt(key);
    const retained = readProfileAttempt(key)!;
    const retried = prepareProfileAttempt(key, terms, retained.pending);
    beginProfileAttempt(retried);
    expect(retried.operationId).toBe(original.operationId);
    expect(retried.input).toEqual(original.input);
    expect(profileDraftChangedSinceSubmission(key, retried.operationId)).toBe(true);
    expect(
      settleProfileAttemptSuccess(
        retained,
        limitedDraft,
        limitedDraft,
        true,
        profileDraftChangedSinceSubmission(key, retried.operationId),
      ),
    ).toEqual({
      draft: privateDraft,
      draftState: 'edited',
      pending: null,
    });
  });
  it('tracks local edits separately from clean values for reduction-only settlement', () => {
    const limitedDraft = {
      visibility: 'limited' as const,
      showFictionalAvatar: false,
      showRegistrationDate: false,
    };
    const privateDraft = { ...limitedDraft, visibility: 'private' as const };
    const pending = prepareProfileAttempt(
      key,
      { kind: 'withdraw', input: { scope: 'all-owned-profiles' } },
      null,
    );
    storeProfileAttempt(key, { draft: limitedDraft, draftState: 'clean', pending: null });
    beginProfileAttempt(pending);
    storeProfileAttempt(key, { draft: limitedDraft, draftState: 'clean', pending });
    setProfileAttemptDraft(key, privateDraft, limitedDraft);
    setProfileAttemptDraft(key, limitedDraft, limitedDraft);
    const local = readProfileAttempt(key)!;
    expect(local.draftState).toBe('clean');
    expect(
      settleProfileAttemptSuccess(
        local,
        privateDraft,
        null,
        false,
        profileDraftChangedSinceSubmission(key, pending.operationId),
      ),
    ).toEqual({
      draft: limitedDraft,
      draftState: 'edited',
      pending: null,
    });
  });
  it('synchronizes unmodified clean drafts and resets edit tracking for a new operation or clear', () => {
    const pending = prepareProfileAttempt(
      key,
      { kind: 'withdraw', input: { scope: 'all-owned-profiles' } },
      null,
    );
    storeProfileAttempt(key, { draft, draftState: 'clean', pending });
    beginProfileAttempt(pending);
    const current = { ...draft, visibility: 'private' as const };
    expect(
      settleProfileAttemptSuccess(
        readProfileAttempt(key)!,
        current,
        null,
        false,
        profileDraftChangedSinceSubmission(key, pending.operationId),
      ),
    ).toEqual({
      draft: current,
      draftState: 'clean',
      pending: null,
    });
    setProfileAttemptDraft(key, current, draft);
    expect(profileDraftChangedSinceSubmission(key, pending.operationId)).toBe(true);
    const replacement = prepareProfileAttempt(
      key,
      {
        kind: 'issue',
        input: {
          characterId: 'f99142b9-1161-4c8b-8c50-f6b599096361',
          expectedRevision: '9007199254740993',
          scope: 'profile.view',
          mode: 'generate',
        },
      },
      pending,
    );
    beginProfileAttempt(replacement);
    expect(profileDraftChangedSinceSubmission(key, replacement.operationId)).toBe(false);
    clearProfileAttempts();
    beginProfileAttempt(pending);
    expect(profileDraftChangedSinceSubmission(key, pending.operationId)).toBe(false);
  });
  it('settlement and terminal failure destroy local-edit markers and ordinary reads cannot recreate them', () => {
    const initial = state();
    const pending = initial.pending!;
    storeProfileAttempt(key, initial);
    beginProfileAttempt(pending);
    setProfileAttemptDraft(key, { ...draft, visibility: 'private' }, draft);
    expect(profileDraftChangedSinceSubmission(key, pending.operationId)).toBe(true);
    storeProfileAttempt(
      key,
      settleProfileAttemptFailure(readProfileAttempt(key)!, 'STALE_REVISION', false),
    );
    expect(readProfileAttempt(key)?.draftState).toBe('stale');
    expect(profileDraftChangedSinceSubmission(key, pending.operationId)).toBe(false);
    storeProfileAttempt(key, { draft, draftState: 'clean', pending: null });
    expect(profileDraftChangedSinceSubmission(key, pending.operationId)).toBe(false);
    beginProfileAttempt(pending);
    storeProfileAttempt(key, { ...initial, pending });
    setProfileAttemptDraft(key, { ...draft, visibility: 'private' }, draft);
    storeProfileAttempt(
      key,
      settleProfileAttemptSuccess(readProfileAttempt(key)!, draft, draft, false, true),
    );
    expect(profileDraftChangedSinceSubmission(key, pending.operationId)).toBe(false);
    storeProfileAttempt(key, null);
    expect(profileDraftChangedSinceSubmission(key, pending.operationId)).toBe(false);
  });
  it.each(['OPERATION_CONFLICT', 'INVALID_REQUEST', 'CHARACTER_ACTION_UNAVAILABLE'])(
    'preserves clean revert intent before terminal %s cleanup and the following current read',
    (code) => {
      const privateDraft = {
        visibility: 'private' as const,
        showFictionalAvatar: false,
        showRegistrationDate: false,
      };
      const initial = state();
      const pending = initial.pending!;
      storeProfileAttempt(key, initial);
      beginProfileAttempt(pending);
      setProfileAttemptDraft(key, privateDraft, privateDraft);
      const failed = settleProfileAttemptFailure(
        readProfileAttempt(key)!,
        code,
        false,
        profileDraftChangedSinceSubmission(key, pending.operationId),
      );
      expect(failed).toEqual({ draft: privateDraft, draftState: 'edited', pending: null });
      storeProfileAttempt(key, failed);
      expect(profileDraftChangedSinceSubmission(key, pending.operationId)).toBe(false);
    },
  );
});
