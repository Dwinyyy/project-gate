import type {
  ProfileDraft,
  UpdateMyProfileInput,
  IssueProfileInvitationInput,
  RevokeProfileInvitationInput,
  WithdrawProfileDisclosureInput,
} from '@hunter-world/contracts';
import { ProfileActionError } from '@hunter-world/client';

export type ProfilePendingTerms =
  | { kind: 'save'; input: UpdateMyProfileInput }
  | { kind: 'issue'; input: IssueProfileInvitationInput }
  | { kind: 'revoke'; input: RevokeProfileInvitationInput }
  | { kind: 'withdraw'; input: WithdrawProfileDisclosureInput };
export type ProfilePendingAttempt = ProfilePendingTerms & {
  attemptKey: string;
  operationId: string;
  phase: 'submitting' | 'retryable' | 'quarantined';
};
export type ProfileAttemptState = {
  draft: ProfileDraft | null;
  draftState: 'clean' | 'edited' | 'stale';
  pending: ProfilePendingAttempt | null;
};
const attempts = new Map<string, ProfileAttemptState>();
// Local edits are independent of whether their values equal the old server
// projection. Keep this marker with the exact unresolved operation, not a read.
const submittedDrafts = new Map<string, { operationId: string; edited: boolean }>();
const listeners = new Set<() => void>();
let version = 0;
function notify() {
  version++;
  for (const listener of listeners) listener();
}
export function subscribeProfileAttempts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function profileAttemptsVersion(): number {
  return version;
}
export function readProfileAttempt(attemptKey: string): ProfileAttemptState | null {
  const value = attempts.get(attemptKey);
  return value ? structuredClone(value) : null;
}
export function storeProfileAttempt(attemptKey: string, state: ProfileAttemptState | null): void {
  if (state) attempts.set(attemptKey, structuredClone(state));
  else attempts.delete(attemptKey);
  if (!state?.pending) submittedDrafts.delete(attemptKey);
  notify();
}
export function clearProfileAttempts(retainAttemptKey?: string): void {
  let changed = false;
  for (const key of attempts.keys()) {
    if (key !== retainAttemptKey) {
      attempts.delete(key);
      changed = true;
    }
  }
  for (const key of submittedDrafts.keys()) {
    if (key !== retainAttemptKey) submittedDrafts.delete(key);
  }
  if (changed) notify();
}
export function quarantineProfileAttempts(): void {
  let changed = false;
  for (const state of attempts.values()) {
    if (state.pending && state.pending.phase !== 'quarantined') {
      state.pending.phase = 'quarantined';
      changed = true;
    }
  }
  if (changed) notify();
}
export function confirmProfileAttempt(attemptKey: string): void {
  const state = attempts.get(attemptKey);
  if (state?.pending?.phase === 'quarantined') {
    state.pending.phase = 'retryable';
    notify();
  }
}
export function profileRequestIsCurrent(
  owner: string,
  accessToken: string,
  current: {
    owner: string | null;
    accessToken: string | null;
    online: boolean;
  },
): boolean {
  return current.online && current.owner === owner && current.accessToken === accessToken;
}
export function assertProfileRequestReady(gate: {
  current: boolean;
  confirmed: boolean;
  submitting: boolean;
}): void {
  if (!gate.current || !gate.confirmed || gate.submitting)
    throw new ProfileActionError(
      'CLIENT_NOT_READY',
      'Profile information is unavailable. Try again shortly.',
    );
}
export function prepareProfileAttempt(
  attemptKey: string,
  terms: ProfilePendingTerms,
  previous: ProfilePendingAttempt | null,
): ProfilePendingAttempt {
  const exact =
    previous?.attemptKey === attemptKey &&
    previous.kind === terms.kind &&
    JSON.stringify(previous.input) === JSON.stringify(terms.input)
      ? previous
      : null;
  return structuredClone({
    ...terms,
    attemptKey,
    operationId: exact?.operationId ?? crypto.randomUUID(),
    phase: 'submitting',
  });
}
export function beginProfileAttempt(pending: ProfilePendingAttempt): void {
  if (submittedDrafts.get(pending.attemptKey)?.operationId !== pending.operationId)
    submittedDrafts.set(pending.attemptKey, { operationId: pending.operationId, edited: false });
}
export function profileDraftChangedSinceSubmission(
  attemptKey: string,
  operationId: string,
): boolean {
  const submitted = submittedDrafts.get(attemptKey);
  return submitted?.operationId === operationId && submitted.edited;
}
export function setProfileAttemptDraft(
  attemptKey: string,
  draft: ProfileDraft,
  confirmedDraft: ProfileDraft | null,
): void {
  const existing = readProfileAttempt(attemptKey);
  const submitted = submittedDrafts.get(attemptKey);
  if (submitted && existing?.pending?.operationId === submitted.operationId)
    submitted.edited = true;
  storeProfileAttempt(attemptKey, {
    draft: {
      visibility: draft.visibility,
      showFictionalAvatar: draft.showFictionalAvatar,
      showRegistrationDate: draft.showRegistrationDate,
    },
    draftState: profileDraftMatches(draft, confirmedDraft) ? 'clean' : 'edited',
    pending: existing?.pending ?? null,
  });
}
export function settleProfileAttemptFailure(
  state: ProfileAttemptState,
  code: string,
  retryable: boolean,
  draftChangedSinceSubmission = false,
): ProfileAttemptState {
  return structuredClone({
    draft: state.draft,
    draftState:
      code === 'STALE_REVISION'
        ? 'stale'
        : draftChangedSinceSubmission && state.draftState === 'clean'
          ? 'edited'
          : state.draftState,
    pending: retryable && state.pending ? { ...state.pending, phase: 'retryable' } : null,
  });
}
export function isProfileSessionIneligible(code: string, status: number | null): boolean {
  return (
    status === 401 ||
    [
      'AUTH_REQUIRED',
      'PASSWORD_UPDATE_REQUIRED',
      'PASSWORD_SIGN_IN_REQUIRED',
      'EMAIL_VERIFICATION_REQUIRED',
      'OPERATOR_ONLY',
      'AUTH_INELIGIBLE',
    ].includes(code)
  );
}
export function profileDraftMatches(a: ProfileDraft | null, b: ProfileDraft | null): boolean {
  return (
    a?.visibility === b?.visibility &&
    a?.showFictionalAvatar === b?.showFictionalAvatar &&
    a?.showRegistrationDate === b?.showRegistrationDate
  );
}
export function settleProfileAttemptSuccess(
  state: ProfileAttemptState,
  confirmedDraft: ProfileDraft | null,
  submittedDraft: ProfileDraft | null,
  replayed: boolean,
  draftChangedSinceSubmission = false,
): ProfileAttemptState {
  const confirmedSubmission =
    !replayed &&
    !draftChangedSinceSubmission &&
    submittedDraft !== null &&
    profileDraftMatches(state.draft, submittedDraft) &&
    profileDraftMatches(confirmedDraft, submittedDraft);
  const synchronize =
    !replayed &&
    !draftChangedSinceSubmission &&
    ((state.draftState === 'clean' &&
      (submittedDraft === null || profileDraftMatches(state.draft, submittedDraft))) ||
      confirmedSubmission);
  const draft = synchronize ? confirmedDraft : state.draft;
  return structuredClone({
    draft,
    draftState: synchronize
      ? 'clean'
      : state.draftState === 'stale'
        ? 'stale'
        : profileDraftMatches(draft, confirmedDraft)
          ? 'clean'
          : 'edited',
    pending: null,
  });
}
