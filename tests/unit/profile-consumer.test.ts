import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type {
  ProfileDraft,
  UpdateMyProfileInput,
  RevokeProfileInvitationInput,
  WithdrawProfileDisclosureInput,
} from '@hunter-world/contracts';
import { ProfileActionError } from '@hunter-world/client';
import {
  useProfileSession,
  type ProfileSessionState,
  type ProfileIssuedCode,
  profileIssuedCodeFromResponse,
} from '../../apps/player/src/profile/useProfileSession';
import {
  useProfileInvitation,
  type ProfileInvitationContext,
} from '../../apps/player/src/profile/ProfileInvitationProvider';
import { ProfileQr } from '../../apps/player/src/profile/ProfileQr';
import type { ProfilePendingAttempt } from '../../apps/player/src/profile/profileAttempts';
import type { IssueProfileInvitationResponse } from '@hunter-world/contracts';

// Compiled as a Task 5 consumer; no hook is called outside React.
export function useTaskFiveConsumer(draft: ProfileDraft): ReactNode {
  const session: ProfileSessionState = useProfileSession();
  const invitation: ProfileInvitationContext = useProfileInvitation();
  const pending: ProfilePendingAttempt | null = session.pending;
  const issued: ProfileIssuedCode = session.issuedCode;
  const { attemptKey, owner, accessToken, data, readState, draftState, error, retryReady } =
    session;
  const save: ProfileSessionState['save'] = session.save;
  const issue: ProfileSessionState['issue'] = session.issue;
  const revoke: ProfileSessionState['revoke'] = session.revoke;
  const withdraw: ProfileSessionState['withdraw'] = session.withdraw;
  const retry: ProfileSessionState['retryPending'] = session.retryPending;
  const refresh: ProfileSessionState['refresh'] = session.refresh;
  const setDraft: (value: ProfileDraft) => void = session.setDraft;
  const capture: (value: string) => boolean = invitation.captureLink;
  const bind: (key: string) => boolean = invitation.bindReader;
  const clear: () => void = invitation.clear;
  if (pending?.kind === 'save') {
    const input: UpdateMyProfileInput = pending.input;
    void input;
  }
  if (pending?.kind === 'revoke') {
    const input: RevokeProfileInvitationInput = pending.input;
    void input;
  }
  if (pending?.kind === 'withdraw') {
    const input: WithdrawProfileDisclosureInput = pending.input;
    void input;
  }
  if (pending?.kind === 'issue') {
    const scope: 'profile.view' = pending.input.scope;
    void scope;
  }
  void [
    attemptKey,
    owner,
    accessToken,
    data,
    readState,
    draftState,
    retryReady,
    save,
    issue,
    revoke,
    withdraw,
    retry,
    refresh,
    setDraft,
    capture,
    bind,
    clear,
    draft,
  ];
  if (error) {
    const typed: ProfileActionError = error;
    void typed;
  }
  if (issued.status === 'unavailable') {
    void issued.invitationId;
    void issued.expiresAt;
  }
  return issued.status === 'available'
    ? createElement(ProfileQr, { value: issued.token, label: issued.owner })
    : null;
}
it('provides the declared consumer entry points', () => {
  expect(typeof useProfileSession).toBe('function');
  expect(typeof useProfileInvitation).toBe('function');
  expect(typeof ProfileQr).toBe('function');
});
it('renders a local accessible QR with square black modules and a four-module white quiet zone', () => {
  const svg = renderToStaticMarkup(
    createElement(ProfileQr, { value: 'synthetic', label: 'Synthetic invitation QR' }),
  );
  expect(svg).toContain('aria-label="Synthetic invitation QR"');
  expect(svg).toContain('shape-rendering="crispEdges"');
  expect(svg).toContain('viewBox="0 0 29 29"');
  expect(svg).toContain('<rect width="29" height="29" fill="#fff"');
  expect(svg).toContain('fill="#000"');
  const modules = [...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)];
  expect(modules.length).toBeGreaterThan(0);
  for (const [, column, row] of modules) {
    expect(Number(column)).toBeGreaterThanOrEqual(4);
    expect(Number(row)).toBeGreaterThanOrEqual(4);
    expect(Number(column)).toBeLessThan(25);
    expect(Number(row)).toBeLessThan(25);
  }
  expect(svg).not.toMatch(/(?:href=|<image|<script|synthetic<)/);
});
it('old issuance replay never reinstalls historical QR ID or expiry over current sharing state', () => {
  const oldId = '11111111-1111-4111-8111-111111111111';
  const currentId = '22222222-2222-4222-8222-222222222222';
  const response: IssueProfileInvitationResponse = {
    schemaVersion: 1,
    replayed: true,
    tokenDelivery: { status: 'unavailable' },
    receipt: {
      operationId: oldId,
      operation: 'profile.invitation.generate',
      ruleVersion: 'civilian-profile-v1',
      committedAt: '2026-10-02T12:00:00.000Z',
      subject: 'character',
      affectedProfileCount: 1,
      character: { characterId: oldId, characterRevision: '1', disclosureRevision: '1' },
      invitation: {
        invitationId: oldId,
        scope: 'profile.view',
        issuedAt: '2026-10-02T12:00:00.000Z',
        expiresAt: '2026-10-02T12:10:00.000Z',
      },
    },
    current: {
      schemaVersion: 1,
      ruleVersion: 'civilian-profile-v1',
      mode: 'active',
      status: 'available',
      profile: {
        characterId: oldId,
        characterRevision: '3',
        disclosureRevision: '3',
        visibility: 'limited',
        showFictionalAvatar: false,
        showRegistrationDate: false,
        publicReference: null,
        preview: { schemaVersion: 1, displayAlias: 'Synthetic', identityLabel: 'Civilian' },
        invitation: {
          invitationId: currentId,
          scope: 'profile.view',
          issuedAt: '2026-10-02T12:05:00.000Z',
          expiresAt: '2026-10-02T12:15:00.000Z',
          status: 'valid',
        },
      },
      controls: {
        canUpdate: true,
        canIssue: true,
        canRevoke: true,
        canWithdraw: true,
        sharingAvailable: true,
      },
    },
  };
  expect(profileIssuedCodeFromResponse(response, 'reader:session:3')).toEqual({
    status: 'unavailable',
    invitationId: currentId,
    expiresAt: '2026-10-02T12:15:00.000Z',
  });
  expect(response.receipt.invitation?.invitationId).toBe(oldId);
  if (!response.current.profile?.invitation) throw new Error('Expected current fixture');
  response.current.profile.invitation.status = 'revoked';
  expect(profileIssuedCodeFromResponse(response, 'reader:session:3')).toEqual({ status: 'none' });
  response.current.profile.invitation.status = 'valid';
  response.current.profile.visibility = 'private';
  expect(profileIssuedCodeFromResponse(response, 'reader:session:3')).toEqual({ status: 'none' });
});
