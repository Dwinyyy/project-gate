import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMyProfile,
  updateMyProfile,
  issueMyProfileInvitation,
  revokeMyProfileInvitation,
  withdrawMyProfileDisclosure,
  ProfileActionError,
} from '@hunter-world/client';
import type {
  ProfileDraft,
  OwnerProfileResponse,
  ProfileMutationResponse,
  IssueProfileInvitationResponse,
} from '@hunter-world/contracts';
import { useAccountAuth } from '../auth/AuthProvider';
import { useProfileInvitation } from './ProfileInvitationProvider';
import {
  readProfileAttempt,
  storeProfileAttempt,
  quarantineProfileAttempts,
  confirmProfileAttempt,
  subscribeProfileAttempts,
  profileAttemptsVersion,
  profileRequestIsCurrent,
  prepareProfileAttempt,
  assertProfileRequestReady,
  settleProfileAttemptFailure,
  clearProfileAttempts,
  isProfileSessionIneligible,
  profileDraftMatches,
  settleProfileAttemptSuccess,
  beginProfileAttempt,
  setProfileAttemptDraft,
  profileDraftChangedSinceSubmission,
  type ProfilePendingAttempt,
  type ProfilePendingTerms,
} from './profileAttempts';

export type ProfileIssuedCode =
  | { status: 'none' }
  | { status: 'available'; owner: string; invitationId: string; token: string; expiresAt: string }
  | { status: 'unavailable'; invitationId: string; expiresAt: string };
export type ProfileSessionState = {
  attemptKey: string | null;
  owner: string | null;
  accessToken: string | null;
  data: OwnerProfileResponse | undefined;
  readState: 'loading' | 'ready' | 'unavailable' | 'offline' | 'unauthenticated';
  draft: ProfileDraft | null;
  draftState: 'clean' | 'edited' | 'stale';
  setDraft(draft: ProfileDraft): void;
  pending: ProfilePendingAttempt | null;
  error: ProfileActionError | null;
  retryReady: boolean;
  issuedCode: ProfileIssuedCode;
  refresh(): Promise<{ data: OwnerProfileResponse | undefined }>;
  save(draft: ProfileDraft): Promise<ProfileMutationResponse | null>;
  issue(mode: 'generate' | 'replace'): Promise<IssueProfileInvitationResponse | null>;
  revoke(): Promise<ProfileMutationResponse | null>;
  withdraw(): Promise<ProfileMutationResponse | null>;
  retryPending(): Promise<ProfileMutationResponse | IssueProfileInvitationResponse | null>;
};
// Receipt metadata belongs to the historical operation. This projection is
// solely the current QR state, including when another issue won afterward.
export function profileIssuedCodeFromResponse(
  response: IssueProfileInvitationResponse,
  owner: string,
): ProfileIssuedCode {
  const profile = response.current.profile;
  const invitation = profile?.invitation;
  if (
    !profile ||
    profile.visibility === 'private' ||
    !response.current.controls.sharingAvailable ||
    !invitation ||
    invitation.status !== 'valid'
  )
    return { status: 'none' };
  if (
    !response.replayed &&
    response.tokenDelivery.status === 'delivered' &&
    response.receipt.invitation?.invitationId === invitation.invitationId
  ) {
    return {
      status: 'available',
      owner,
      invitationId: invitation.invitationId,
      token: response.tokenDelivery.token,
      expiresAt: invitation.expiresAt,
    };
  }
  return {
    status: 'unavailable',
    invitationId: invitation.invitationId,
    expiresAt: invitation.expiresAt,
  };
}
const safeCopy = 'Profile information is unavailable. Try again shortly.';
function onlineSnapshot() {
  return typeof navigator === 'undefined' || navigator.onLine;
}
function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}
function draftOf(data: OwnerProfileResponse): ProfileDraft | null {
  return data.profile
    ? {
        visibility: data.profile.visibility,
        showFictionalAvatar: data.profile.showFictionalAvatar,
        showRegistrationDate: data.profile.showRegistrationDate,
      }
    : null;
}
function transportRetryable(error: ProfileActionError) {
  return (
    error.status === null ||
    error.status === 429 ||
    (error.status !== null && error.status >= 500) ||
    error.code === 'INVALID_RESPONSE'
  );
}

export function useProfileSession(): ProfileSessionState {
  const { auth, validation, session, validationGeneration, controller } = useAccountAuth();
  const { clear: clearInvitation } = useProfileInvitation();
  const online = useSyncExternalStore(subscribeOnline, onlineSnapshot, () => true);
  useSyncExternalStore(subscribeProfileAttempts, profileAttemptsVersion, profileAttemptsVersion);
  const queryClient = useQueryClient();
  const attemptKey =
    auth.phase === 'authenticated' &&
    validation === 'valid' &&
    session?.applicationRole === 'player' &&
    session.emailVerified &&
    session.sessionId &&
    session.authUserId === auth.user?.id &&
    auth.accessToken
      ? `${session.authUserId}:${session.sessionId}`
      : null;
  const owner = attemptKey ? `${attemptKey}:${validationGeneration}` : null;
  const accessToken = owner ? auth.accessToken : null;
  const current = useRef({ owner, accessToken, online });
  current.current = { owner, accessToken, online };
  const readyOwner = useRef<string | null>(null);
  const issued = useRef<{
    owner: string | null;
    accessToken: string | null;
    value: ProfileIssuedCode;
  }>({ owner, accessToken, value: { status: 'none' } });
  const [, render] = useState(0);
  const [failure, setFailure] = useState<{ owner: string; value: ProfileActionError } | null>(null);
  const request = useRef<{ owner: string; abort: AbortController } | null>(null);
  const mounted = useRef(true);
  if (issued.current.owner !== owner || issued.current.accessToken !== accessToken || !online) {
    issued.current = { owner, accessToken, value: { status: 'none' } };
    readyOwner.current = null;
  }
  function isCurrent(requestOwner: string, token: string) {
    const provider = controller?.getSnapshot();
    return (
      mounted.current &&
      profileRequestIsCurrent(requestOwner, token, current.current) &&
      onlineSnapshot() &&
      provider?.phase === 'authenticated' &&
      provider.accessToken === token &&
      provider.user?.id === session?.authUserId
    );
  }
  function clearIssued() {
    issued.current = {
      owner: current.current.owner,
      accessToken: current.current.accessToken,
      value: { status: 'none' },
    };
    render((value) => value + 1);
  }

  const query = useQuery({
    queryKey: ['profile', 'private', owner],
    queryFn: async ({ signal }) => {
      const requestOwner = owner!;
      const token = accessToken!;
      try {
        const value = await getMyProfile(token, signal);
        if (!isCurrent(requestOwner, token)) return { owner: requestOwner, value: undefined };
        const code = issued.current.value;
        if (
          code.status === 'available' &&
          (!value.controls.sharingAvailable ||
            value.profile?.invitation?.invitationId !== code.invitationId ||
            value.profile.invitation.status !== 'valid')
        )
          clearIssued();
        readyOwner.current = requestOwner;
        confirmProfileAttempt(attemptKey!);
        const existing = readProfileAttempt(attemptKey!);
        if (!existing)
          storeProfileAttempt(attemptKey!, {
            draft: draftOf(value),
            draftState: 'clean',
            pending: null,
          });
        else if (existing.draftState === 'clean' && !existing.pending)
          storeProfileAttempt(attemptKey!, { ...existing, draft: draftOf(value) });
        else if (
          existing.draftState === 'clean' &&
          !profileDraftMatches(existing.draft, draftOf(value))
        )
          storeProfileAttempt(attemptKey!, { ...existing, draftState: 'edited' });
        return { owner: requestOwner, value };
      } catch (error) {
        if (!signal.aborted && isCurrent(requestOwner, token)) {
          readyOwner.current = null;
          if (
            error instanceof ProfileActionError &&
            isProfileSessionIneligible(error.code, error.status)
          )
            clearProfileAttempts();
          else quarantineProfileAttempts();
          clearIssued();
          clearInvitation();
        }
        throw error;
      }
    },
    enabled: !!owner && online && !request.current,
    retry: false,
    refetchOnReconnect: true,
    staleTime: 0,
  });
  const data =
    owner &&
    readyOwner.current === owner &&
    online &&
    query.data?.owner === owner &&
    !query.isPaused &&
    !query.isError
      ? query.data.value
      : undefined;
  const refetch = query.refetch;

  useEffect(() => {
    mounted.current = true;
    // Cleanup destroys the old raw value. Re-establish only the nonsecret
    // generation stamp before a new read can confirm authority; otherwise a
    // render after that read would mistake this fresh generation for old data.
    issued.current = { owner, accessToken, value: { status: 'none' } };
    if (!online) {
      readyOwner.current = null;
      clearInvitation();
      quarantineProfileAttempts();
      void queryClient.cancelQueries({ queryKey: ['profile'] });
      queryClient.removeQueries({ queryKey: ['profile'] });
    }
    return () => {
      mounted.current = false;
      request.current?.abort.abort();
      request.current = null;
      issued.current = { owner: null, accessToken: null, value: { status: 'none' } };
      readyOwner.current = null;
      quarantineProfileAttempts();
    };
  }, [owner, accessToken, online, queryClient, clearInvitation]);

  async function refresh(): Promise<{ data: OwnerProfileResponse | undefined }> {
    if (!owner || !accessToken || !isCurrent(owner, accessToken)) return { data: undefined };
    const result = await refetch();
    return {
      data:
        isCurrent(owner, accessToken) && result.isSuccess && result.data?.owner === owner
          ? result.data.value
          : undefined,
    };
  }
  const stored = attemptKey ? readProfileAttempt(attemptKey) : null;
  // Temporary validation loss keeps memory quarantined but never exposes it to
  // rendering or transport before this generation's confirmed read.
  const visible = data && readyOwner.current === owner ? stored : null;
  const retryReady =
    !!owner &&
    !!data &&
    readyOwner.current === owner &&
    online &&
    visible?.pending?.phase === 'retryable' &&
    !request.current;
  function notReady(): never {
    throw new ProfileActionError('CLIENT_NOT_READY', safeCopy);
  }
  function authority() {
    assertProfileRequestReady({
      current: !!owner && !!accessToken && isCurrent(owner, accessToken),
      confirmed: !!data && readyOwner.current === owner,
      submitting:
        !!request.current ||
        (!!attemptKey && readProfileAttempt(attemptKey)?.pending?.phase === 'submitting'),
    });
    if (
      !owner ||
      !accessToken ||
      !attemptKey ||
      !data ||
      readyOwner.current !== owner ||
      !isCurrent(owner, accessToken) ||
      request.current ||
      readProfileAttempt(attemptKey)?.pending?.phase === 'submitting'
    )
      return notReady();
    return { owner, accessToken, attemptKey, data };
  }
  function setDraft(draft: ProfileDraft) {
    if (
      !attemptKey ||
      !owner ||
      !accessToken ||
      !data ||
      readyOwner.current !== owner ||
      !isCurrent(owner, accessToken)
    )
      return;
    setProfileAttemptDraft(attemptKey, draft, draftOf(data));
  }

  async function execute(
    terms: ProfilePendingTerms,
    retry?: ProfilePendingAttempt,
  ): Promise<ProfileMutationResponse | IssueProfileInvitationResponse | null> {
    const bound = authority();
    const existing = readProfileAttempt(bound.attemptKey);
    const exact =
      retry ??
      (existing?.pending?.kind === terms.kind &&
      JSON.stringify(existing.pending.input) === JSON.stringify(terms.input)
        ? existing.pending
        : null);
    if (exact?.phase === 'quarantined') return notReady();
    const pending = prepareProfileAttempt(bound.attemptKey, terms, exact);
    beginProfileAttempt(pending);
    const abort = new AbortController();
    const active = { owner: bound.owner, abort };
    request.current = active;
    setFailure(null);
    clearIssued();
    storeProfileAttempt(bound.attemptKey, {
      draft: existing?.draft ?? draftOf(bound.data),
      draftState: existing?.draftState ?? 'clean',
      pending,
    });
    try {
      await queryClient.cancelQueries({ queryKey: ['profile', 'private', bound.owner] });
      if (!isCurrent(bound.owner, bound.accessToken) || request.current !== active) return null;
      let result: ProfileMutationResponse | IssueProfileInvitationResponse;
      switch (pending.kind) {
        case 'save':
          result = await updateMyProfile(
            bound.accessToken,
            pending.input,
            pending.operationId,
            abort.signal,
          );
          break;
        case 'issue':
          result = await issueMyProfileInvitation(
            bound.accessToken,
            pending.input,
            pending.operationId,
            abort.signal,
          );
          break;
        case 'revoke':
          result = await revokeMyProfileInvitation(
            bound.accessToken,
            pending.input,
            pending.operationId,
            abort.signal,
          );
          break;
        case 'withdraw':
          result = await withdrawMyProfileDisclosure(
            bound.accessToken,
            pending.input,
            pending.operationId,
            abort.signal,
          );
          break;
      }
      if (!isCurrent(bound.owner, bound.accessToken) || request.current !== active) return null;
      await queryClient.cancelQueries({ queryKey: ['profile', 'private', bound.owner] });
      if (!isCurrent(bound.owner, bound.accessToken) || request.current !== active) return null;
      const latest = readProfileAttempt(bound.attemptKey);
      const committedDraft = pending.kind === 'save' ? pending.input : null;
      storeProfileAttempt(
        bound.attemptKey,
        settleProfileAttemptSuccess(
          latest ?? { draft: null, draftState: 'clean', pending },
          draftOf(result.current),
          committedDraft,
          result.replayed,
          profileDraftChangedSinceSubmission(bound.attemptKey, pending.operationId),
        ),
      );
      queryClient.setQueryData(['profile', 'private', bound.owner], {
        owner: bound.owner,
        value: result.current,
      });
      readyOwner.current = bound.owner;
      if ('tokenDelivery' in result) {
        issued.current = {
          owner: bound.owner,
          accessToken: bound.accessToken,
          value: profileIssuedCodeFromResponse(result, bound.owner),
        };
      }
      render((value) => value + 1);
      return result;
    } catch (error) {
      if (!isCurrent(bound.owner, bound.accessToken) || request.current !== active) return null;
      const safe =
        error instanceof ProfileActionError
          ? error
          : new ProfileActionError('UNAVAILABLE', safeCopy);
      const latest = readProfileAttempt(bound.attemptKey);
      const retryable = transportRetryable(safe);
      storeProfileAttempt(
        bound.attemptKey,
        settleProfileAttemptFailure(
          {
            draft: latest?.draft ?? null,
            draftState: latest?.draftState ?? 'clean',
            pending,
          },
          safe.code,
          retryable,
          profileDraftChangedSinceSubmission(bound.attemptKey, pending.operationId),
        ),
      );
      if (isProfileSessionIneligible(safe.code, safe.status)) {
        clearProfileAttempts();
        clearInvitation();
      }
      readyOwner.current = null;
      setFailure({ owner: bound.owner, value: safe });
      // Only confirmed reads occur automatically. The original write is never
      // replayed here, including after reconnect or a lost issue response.
      await refresh();
      if (!isCurrent(bound.owner, bound.accessToken)) return null;
      throw safe;
    } finally {
      if (request.current === active) {
        request.current = null;
        render((value) => value + 1);
      }
    }
  }

  async function save(draft: ProfileDraft) {
    const bound = authority();
    if (!bound.data.controls.canUpdate || !bound.data.profile) return notReady();
    setDraft(draft);
    return execute({
      kind: 'save',
      input: {
        visibility: draft.visibility,
        showFictionalAvatar: draft.showFictionalAvatar,
        showRegistrationDate: draft.showRegistrationDate,
        characterId: bound.data.profile.characterId,
        expectedRevision: bound.data.profile.characterRevision,
      },
    });
  }
  async function issue(
    mode: 'generate' | 'replace',
  ): Promise<IssueProfileInvitationResponse | null> {
    const bound = authority();
    if (!bound.data.controls.canIssue || !bound.data.profile) return notReady();
    const result = await execute({
      kind: 'issue',
      input: {
        characterId: bound.data.profile.characterId,
        expectedRevision: bound.data.profile.characterRevision,
        scope: 'profile.view',
        mode,
      },
    });
    return result && 'tokenDelivery' in result ? result : null;
  }
  async function revoke() {
    const bound = authority();
    if (!bound.data.controls.canRevoke || !bound.data.profile) return notReady();
    return execute({
      kind: 'revoke',
      input: {
        characterId: bound.data.profile.characterId,
        expectedRevision: bound.data.profile.characterRevision,
      },
    });
  }
  async function withdraw() {
    const bound = authority();
    if (!bound.data.controls.canWithdraw) return notReady();
    return execute({ kind: 'withdraw', input: { scope: 'all-owned-profiles' } });
  }
  async function retryPending() {
    const bound = authority();
    const pending = readProfileAttempt(bound.attemptKey)?.pending;
    if (!retryReady || !pending || pending.phase !== 'retryable') return notReady();
    // A receipt replay can be read even after new-write controls are disabled.
    return execute(pending, pending);
  }
  return {
    attemptKey,
    owner,
    accessToken,
    data,
    readState: !owner
      ? validation === 'checking'
        ? 'loading'
        : 'unauthenticated'
      : !online
        ? 'offline'
        : query.isError
          ? 'unavailable'
          : data
            ? 'ready'
            : 'loading',
    draft: visible?.draft ?? null,
    draftState: visible?.draftState ?? 'clean',
    setDraft,
    pending: visible?.pending ?? null,
    error: failure?.owner === owner ? failure.value : null,
    retryReady,
    issuedCode: data && issued.current.owner === owner ? issued.current.value : { status: 'none' },
    refresh,
    save,
    issue,
    revoke,
    withdraw,
    retryPending,
  };
}
