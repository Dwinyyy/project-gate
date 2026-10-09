import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  getPublicProfile,
  ProfileActionError,
  resolveProfileInvitation,
} from '@hunter-world/client';
import type { CivilianProfileResponse } from '@hunter-world/contracts';
import { Icon } from '@hunter-world/ui';
import { useAccountAuth } from '../auth/AuthProvider';
import { CharacterPortrait } from '../character/CharacterPortrait';
import { useProfileInvitation, useProfileInvitationMemory } from './ProfileInvitationProvider';
import styles from './Profile.module.css';

type RequestStamp = {
  owner: string;
  accessToken: string;
  kind: 'invitation' | 'public';
  publicReference: string | null;
};
type SharedState =
  | { phase: 'idle' }
  | ({ phase: 'loading' | 'unavailable' | 'service' | 'session' } & RequestStamp)
  | ({ phase: 'ready'; profile: CivilianProfileResponse; expiresAt: string | null } & RequestStamp);
type ActiveRequest = RequestStamp & {
  invitationToken: string | null;
  controller: AbortController;
  consumers: number;
};

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

export function SharedProfile({
  kind,
  publicReference,
}: {
  kind: 'invitation' | 'public';
  publicReference?: string;
}) {
  const { controller, auth, validation, session, validationGeneration } = useAccountAuth();
  const invitation = useProfileInvitation();
  const invitationMemory = useProfileInvitationMemory();
  const {
    token: invitationTokenSnapshot,
    boundReader,
    captureLink,
    bindReader,
    clear: clearInvitation,
  } = invitation;
  const online = useSyncExternalStore(subscribeOnline, onlineSnapshot, onlineSnapshot);
  const [state, setState] = useState<SharedState>({ phase: 'idle' });
  const [retry, setRetry] = useState(0);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const activeRequest = useRef<ActiveRequest | null>(null);
  const previousOwner = useRef<string | null>(null);
  const attemptKey =
    auth.phase === 'authenticated' &&
    validation === 'valid' &&
    session?.applicationRole === 'player' &&
    session.emailVerified &&
    session.authUserId === auth.user?.id
      ? `${session.authUserId}:${session.sessionId}`
      : null;
  const owner = attemptKey ? `${attemptKey}:${validationGeneration}` : null;
  const accessToken = owner ? auth.accessToken : null;
  const reference = kind === 'public' ? (publicReference ?? '') : null;
  const current = useRef({ owner, accessToken, online, kind, reference });
  current.current = { owner, accessToken, online, kind, reference };

  function releaseRequest(active: ActiveRequest) {
    active.consumers -= 1;
    queueMicrotask(() => {
      if (active.consumers === 0 && activeRequest.current === active) {
        active.invitationToken = null;
        active.controller.abort();
        activeRequest.current = null;
      }
    });
  }

  useEffect(() => {
    const prior = previousOwner.current;
    if ((prior && prior !== owner) || !online) {
      setPasted('');
      setPasteError(null);
      setState({ phase: 'idle' });
      if (!online || boundReader) clearInvitation();
    }
    previousOwner.current = owner;
  }, [owner, online, boundReader, clearInvitation]);

  useEffect(() => {
    if (!owner || !accessToken || !online) return;
    const invitationToken = kind === 'invitation' ? invitationTokenSnapshot : null;
    if (kind === 'invitation' && !invitationToken) return;
    if (kind === 'invitation' && !bindReader(attemptKey!)) {
      setState({
        phase: 'unavailable',
        owner,
        accessToken,
        kind,
        publicReference: reference,
      });
      return;
    }
    const existing = activeRequest.current;
    if (
      existing &&
      existing.owner === owner &&
      existing.accessToken === accessToken &&
      existing.kind === kind &&
      existing.publicReference === reference &&
      existing.invitationToken === invitationToken
    ) {
      existing.consumers += 1;
      return () => releaseRequest(existing);
    }
    if (existing) {
      existing.invitationToken = null;
      existing.controller.abort();
    }
    const active: ActiveRequest = {
      owner,
      accessToken,
      kind,
      publicReference: reference,
      invitationToken,
      controller: new AbortController(),
      consumers: 1,
    };
    activeRequest.current = active;
    const stamp: RequestStamp = {
      owner,
      accessToken,
      kind,
      publicReference: reference,
    };
    const requestIsCurrent = () => {
      const provider = controller?.getSnapshot();
      const liveInvitation = invitationMemory.getSnapshot();
      return (
        activeRequest.current === active &&
        current.current.owner === stamp.owner &&
        current.current.accessToken === stamp.accessToken &&
        current.current.online &&
        current.current.kind === stamp.kind &&
        current.current.reference === stamp.publicReference &&
        provider?.phase === 'authenticated' &&
        provider.accessToken === stamp.accessToken &&
        provider.user?.id === session?.authUserId &&
        (kind !== 'invitation' ||
          (liveInvitation.token === active.invitationToken &&
            liveInvitation.boundReader === attemptKey))
      );
    };
    setState({ phase: 'loading', ...stamp });

    const finish = () => {
      active.invitationToken = null;
      if (activeRequest.current === active) activeRequest.current = null;
    };
    const fail = (error: unknown) => {
      if (active.controller.signal.aborted || !requestIsCurrent()) {
        finish();
        return;
      }
      const terminalClientDenial =
        error instanceof ProfileActionError &&
        error.status !== null &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429;
      if (kind === 'invitation' && terminalClientDenial) clearInvitation();
      if (error instanceof ProfileActionError && error.status === 401)
        setState({ phase: 'session', ...stamp });
      else if (
        error instanceof ProfileActionError &&
        (error.code === 'UNAVAILABLE' ||
          error.code === 'INVALID_RESPONSE' ||
          error.status === 429 ||
          (error.status !== null && error.status >= 500))
      )
        setState({ phase: 'service', ...stamp });
      else setState({ phase: 'unavailable', ...stamp });
      finish();
    };
    if (kind === 'invitation') {
      void resolveProfileInvitation(
        accessToken,
        { token: invitationToken! },
        active.controller.signal,
      ).then((result) => {
        if (active.controller.signal.aborted || !requestIsCurrent()) {
          finish();
          return;
        }
        clearInvitation();
        setState({
          phase: 'ready',
          ...stamp,
          profile: result.profile,
          expiresAt: result.invitation.expiresAt,
        });
        finish();
      }, fail);
    } else {
      void getPublicProfile(accessToken, reference ?? '', active.controller.signal).then(
        (result) => {
          if (active.controller.signal.aborted || !requestIsCurrent()) {
            finish();
            return;
          }
          setState({ phase: 'ready', ...stamp, profile: result, expiresAt: null });
          finish();
        },
        fail,
      );
    }
    return () => releaseRequest(active);
  }, [
    owner,
    accessToken,
    online,
    invitationTokenSnapshot,
    kind,
    reference,
    retry,
    attemptKey,
    bindReader,
    clearInvitation,
    controller,
    invitationMemory,
    session?.authUserId,
  ]);

  function acceptPaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasteError(null);
    if (!captureLink(pasted.trim())) {
      setPasteError('Paste a complete Hunter World profile link.');
      return;
    }
    setPasted('');
    setState({ phase: 'idle' });
    setRetry((value) => value + 1);
  }

  const signedOut = auth.phase !== 'authenticated';
  const checking = auth.phase === 'authenticated' && validation !== 'valid';
  const stateIsCurrent =
    state.phase !== 'idle' &&
    owner !== null &&
    accessToken !== null &&
    online &&
    state.owner === owner &&
    state.accessToken === accessToken &&
    state.kind === kind &&
    state.publicReference === reference;
  const visibleState = stateIsCurrent ? state : null;
  const hasNewInvitation = kind === 'invitation' && invitationTokenSnapshot !== null;
  const showReady = visibleState?.phase === 'ready' && !hasNewInvitation;
  const missingInvitation =
    kind === 'invitation' &&
    invitationTokenSnapshot === null &&
    visibleState === null &&
    owner !== null &&
    accessToken !== null;

  return (
    <section className={styles.sharedPage}>
      <div className={styles.pageHeading}>
        <div className={styles.headingIcon} aria-hidden="true">
          <Icon name="identity" />
        </div>
        <div>
          <p className={styles.eyebrow}>SHARED CIVILIAN PROFILE</p>
          <h1>Identity check</h1>
          <p>Current profile information for eligible signed-in players.</p>
        </div>
      </div>

      {!online ? (
        <section className={styles.statePanel} role="status">
          <h2>Connection unavailable</h2>
          <p>Reconnect, then rescan or paste the profile link. Cached profile content is hidden.</p>
        </section>
      ) : signedOut ? (
        <section className={styles.statePanel}>
          <h2>Sign in to view this shared profile.</h2>
          <p>
            The link does not grant access by itself. The System must validate an eligible player
            session.
          </p>
          <Link className={styles.primaryLink} to="/account/sign-in">
            Sign in to continue
          </Link>
        </section>
      ) : checking || visibleState?.phase === 'loading' ? (
        <section className={styles.statePanel} role="status" aria-busy="true">
          <h2>Checking shared profile…</h2>
          <p>Confirming your session and retrieving current disclosure.</p>
        </section>
      ) : missingInvitation ? (
        <section className={styles.statePanel} role="status">
          <h2>Rescan or paste a profile link.</h2>
          <p>This browser no longer has the temporary code. Use a fresh scan or paste the link.</p>
        </section>
      ) : !visibleState ? (
        <section className={styles.statePanel} role="status" aria-busy="true">
          <h2>Checking shared profile…</h2>
          <p>Confirming your session and retrieving current disclosure.</p>
        </section>
      ) : showReady ? (
        <SharedCard profile={visibleState.profile} expiresAt={visibleState.expiresAt} />
      ) : visibleState.phase === 'session' ? (
        <section className={styles.statePanel} role="alert">
          <h2>Shared profile unavailable</h2>
          <p>Your session could not be confirmed. Sign in again, then rescan or paste the link.</p>
          <Link className={styles.primaryLink} to="/account/sign-in">
            Sign in again
          </Link>
        </section>
      ) : visibleState.phase === 'unavailable' || visibleState.phase === 'service' ? (
        <section className={styles.statePanel} role="alert">
          <h2>Shared profile unavailable</h2>
          <p>
            {visibleState.phase === 'service'
              ? 'The profile service could not be reached. Your link was not treated as a confirmed profile.'
              : 'This profile is private, expired, revoked, or otherwise unavailable. Rescan or paste a new link.'}
          </p>
          {visibleState.phase === 'service' &&
          (kind === 'public' || invitationTokenSnapshot !== null) ? (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          ) : null}
        </section>
      ) : null}

      {kind === 'invitation' && !showReady ? (
        <form className={styles.pastePanel} onSubmit={acceptPaste}>
          <label htmlFor="profile-link">Paste profile link</label>
          <input
            id="profile-link"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
          />
          {pasteError ? <p className={styles.errorMessage}>{pasteError}</p> : null}
          <button className={styles.secondaryButton} type="submit">
            Open pasted link
          </button>
        </form>
      ) : null}
    </section>
  );
}

function SharedCard({
  profile,
  expiresAt,
}: {
  profile: CivilianProfileResponse;
  expiresAt: string | null;
}) {
  return (
    <article className={styles.sharedCard} aria-label="Shared civilian profile">
      <p className={styles.eyebrow}>CURRENT SERVER RESPONSE</p>
      <div className={styles.sharedIdentity}>
        {profile.appearance ? <CharacterPortrait appearance={profile.appearance} compact /> : null}
        <div>
          <h2>{profile.displayAlias}</h2>
          <strong>{profile.identityLabel}</strong>
        </div>
      </div>
      {profile.registrationDate ? (
        <p>
          Registered <time dateTime={profile.registrationDate}>{profile.registrationDate}</time>
        </p>
      ) : null}
      {expiresAt ? (
        <p className={styles.sharedExpiry}>
          Temporary access expires at{' '}
          <time dateTime={expiresAt}>{new Date(expiresAt).toLocaleTimeString()}</time>.
        </p>
      ) : null}
      <p className={styles.boundaryMessage}>
        This disclosure grants no trade, party, friendship, proximity, or gameplay authority.
      </p>
    </article>
  );
}
