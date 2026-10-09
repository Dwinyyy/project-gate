import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProfileDraft, ProfileVisibility } from '@hunter-world/contracts';
import { Icon } from '@hunter-world/ui';
import { buildProfileInvitationLink } from './profileInvitation';
import { CivilianIdPresentation } from './CivilianIdPresentation';
import { useProfileSession } from './useProfileSession';
import styles from './Profile.module.css';

const visibilityLabels: Record<ProfileVisibility, string> = {
  private: 'Private',
  limited: 'Limited',
  public: 'Public',
};
type FeedbackArea = 'settings' | 'sharing' | 'withdrawal';
type Notice = { area: FeedbackArea; message: string; tone: 'status' | 'error' };

function areaForOperation(kind: string | undefined): FeedbackArea | null {
  if (kind === 'save') return 'settings';
  if (kind === 'withdraw') return 'withdrawal';
  if (kind === 'issue' || kind === 'revoke') return 'sharing';
  return null;
}

export function CivilianId() {
  const session = useProfileSession();
  const showButton = useRef<HTMLButtonElement>(null);
  const openRef = useRef(false);
  const historyEntry = useRef(false);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [feedbackArea, setFeedbackArea] = useState<FeedbackArea | null>(null);
  const [showSessionError, setShowSessionError] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  openRef.current = open;

  const profile = session.data?.profile ?? null;
  const controls = session.data?.controls;
  const invitation = profile?.invitation ?? null;
  const code = session.issuedCode;
  const qrUrl = useMemo(() => {
    if (
      !profile ||
      !controls?.sharingAvailable ||
      !invitation ||
      invitation.status !== 'valid' ||
      code.status !== 'available' ||
      code.invitationId !== invitation.invitationId ||
      Date.parse(code.expiresAt) <= clock
    )
      return null;
    try {
      return buildProfileInvitationLink(window.location.origin, code.token);
    } catch {
      return null;
    }
  }, [clock, code, controls?.sharingAvailable, invitation, profile]);

  useEffect(() => {
    if (code.status !== 'available') return;
    const delay = Math.max(0, Date.parse(code.expiresAt) - Date.now());
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.min(delay + 25, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [code]);

  useEffect(() => {
    const closeFromBack = () => {
      if (!openRef.current) return;
      historyEntry.current = false;
      setOpen(false);
    };
    window.addEventListener('popstate', closeFromBack);
    return () => window.removeEventListener('popstate', closeFromBack);
  }, []);

  useEffect(() => {
    if (session.readState === 'ready') return;
    historyEntry.current = false;
    setOpen(false);
  }, [session.readState]);

  function showId() {
    setNotice(null);
    window.history.pushState({ hunterWorldCivilianId: true }, '', window.location.href);
    historyEntry.current = true;
    setOpen(true);
  }

  function concealId() {
    setOpen(false);
    if (historyEntry.current) {
      historyEntry.current = false;
      window.history.back();
    }
  }

  function updateDraft(change: Partial<ProfileDraft>) {
    if (!session.draft) return;
    setNotice(null);
    session.setDraft({ ...session.draft, ...change });
  }

  async function run(action: () => Promise<unknown>, success: string, area: FeedbackArea) {
    setFeedbackArea(area);
    setShowSessionError(false);
    setNotice(null);
    try {
      const result = await action();
      if (result) setNotice({ area, message: success, tone: 'status' });
    } catch {
      setShowSessionError(true);
      // useProfileSession exposes the sanitized current failure below.
    }
  }

  const pendingArea = areaForOperation(session.pending?.kind);
  function feedback(area: FeedbackArea) {
    const showError =
      !!session.error &&
      (pendingArea === area || (!pendingArea && feedbackArea === area && showSessionError));
    const showRetry = session.retryReady && pendingArea === area;
    const areaNotice = notice?.area === area ? notice : null;
    if (!showError && !showRetry && !areaNotice) return null;
    return (
      <>
        {showError ? (
          <p className={styles.errorMessage} role="alert">
            {session.error!.message}
          </p>
        ) : null}
        {showRetry ? (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={session.pending?.phase === 'submitting'}
            onClick={() => void run(session.retryPending, 'The exact request was confirmed.', area)}
          >
            Retry exact request
          </button>
        ) : null}
        {areaNotice ? (
          <p
            className={areaNotice.tone === 'error' ? styles.errorMessage : styles.successMessage}
            role={areaNotice.tone === 'error' ? 'alert' : 'status'}
            aria-live={areaNotice.tone === 'status' ? 'polite' : undefined}
          >
            {areaNotice.message}
          </p>
        ) : null}
      </>
    );
  }

  if (session.readState === 'loading') {
    return (
      <ProfileState
        title="Checking your System ID…"
        detail="Retrieving confirmed profile settings."
      />
    );
  }
  if (session.readState === 'unauthenticated') {
    return (
      <ProfileState
        title="Sign in to open your System ID."
        detail="A validated player session is required."
      />
    );
  }
  if (session.readState === 'offline') {
    return (
      <ProfileState
        title="Connection unavailable"
        detail="Reconnect to retrieve confirmed profile state. No changes will be sent automatically."
        action="Check current profile"
        onAction={() => void session.refresh()}
      />
    );
  }
  if (session.readState === 'unavailable' || !session.data) {
    return (
      <ProfileState
        title="Profile service unavailable"
        detail="Your ID and sharing settings are hidden until current state can be confirmed."
        action="Retry profile check"
        onAction={() => void session.refresh()}
      />
    );
  }

  const currentControls = session.data.controls;
  const busy = session.pending?.phase === 'submitting';
  const status = session.data.status;
  const canWithdraw = currentControls.canWithdraw;
  if (!profile || status !== 'available') {
    return (
      <section className={styles.profilePage}>
        <ProfileHeading />
        <section className={styles.statePanel} role="status">
          <Icon name="identity" width="34" height="34" />
          <h2>
            {status === 'unsupported_official_id'
              ? 'Official ID registration is not available yet.'
              : 'No living civilian profile is available.'}
          </h2>
          <p>
            {status === 'unsupported_official_id'
              ? 'This feature does not invent a Hunter rank, class, credential, or awakened ID.'
              : 'A current living civilian identity is required to present a System ID.'}
          </p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void session.refresh()}
          >
            Check current profile
          </button>
          {canWithdraw ? (
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busy}
              onClick={() =>
                void run(
                  session.withdraw,
                  'Sharing is off for every profile on this account.',
                  'withdrawal',
                )
              }
            >
              Stop sharing
            </button>
          ) : null}
          {feedback('settings')}
          {feedback('sharing')}
          {feedback('withdrawal')}
        </section>
      </section>
    );
  }

  const draft = session.draft;
  const invitationExpiredByClock =
    invitation?.status === 'valid' && Date.parse(invitation.expiresAt) <= clock;
  const codeMatchesInvitation =
    code.status === 'available' &&
    invitation?.status === 'valid' &&
    code.invitationId === invitation.invitationId &&
    code.expiresAt === invitation.expiresAt;
  const lostCode =
    invitation?.status === 'valid' &&
    !codeMatchesInvitation &&
    !(session.pending?.phase === 'submitting' && session.pending.kind === 'issue');
  const showReplace = invitation?.status === 'valid' || invitation?.status === 'expired';
  const showGenerate =
    !invitation || invitation.status === 'revoked' || invitation.status === 'expired';

  return (
    <section className={styles.profilePage}>
      <ProfileHeading />
      <section className={styles.ownerSummary} aria-labelledby="profile-summary-title">
        <div>
          <p className={styles.eyebrow}>CONFIRMED CIVILIAN ID</p>
          <h2 id="profile-summary-title">{profile.preview.displayAlias}</h2>
          <p>
            {profile.preview.identityLabel} · Saved setting: {visibilityLabels[profile.visibility]}
          </p>
        </div>
        <button ref={showButton} className={styles.primaryButton} type="button" onClick={showId}>
          Show ID
        </button>
      </section>

      <section className={styles.settingsPanel} aria-labelledby="disclosure-title">
        <div className={styles.sectionTitle}>
          <div>
            <p className={styles.eyebrow}>VOLUNTARY DISCLOSURE</p>
            <h2 id="disclosure-title">Profile settings</h2>
          </div>
          <span className={styles.draftBadge} data-state={session.draftState}>
            {session.draftState === 'clean'
              ? 'Saved'
              : session.draftState === 'stale'
                ? 'Review draft'
                : 'Unsaved draft'}
          </span>
        </div>
        <p className={styles.explanation}>
          Opening or concealing your ID does not publish, generate, replace, or revoke sharing.
        </p>
        {draft ? (
          <fieldset className={styles.settings} disabled={!currentControls.canUpdate}>
            <label htmlFor="profile-visibility">Who can view this profile?</label>
            <select
              id="profile-visibility"
              value={draft.visibility}
              onChange={(event) =>
                updateDraft({ visibility: event.target.value as ProfileVisibility })
              }
            >
              <option value="private">Private — only your in-person ID</option>
              <option value="limited">Limited — current temporary code only</option>
              <option value="public">Public — known link or temporary code</option>
            </select>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={draft.showFictionalAvatar}
                onChange={(event) => updateDraft({ showFictionalAvatar: event.target.checked })}
              />
              <span>Show fictional avatar</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={draft.showRegistrationDate}
                onChange={(event) => updateDraft({ showRegistrationDate: event.target.checked })}
              />
              <span>Show registration date</span>
            </label>
          </fieldset>
        ) : null}
        <p className={styles.savedContext}>Saved setting: {visibilityLabels[profile.visibility]}</p>
        {session.draftState === 'stale' ? (
          <p className={styles.warningMessage}>
            Confirmed profile settings changed since this draft. Review it, then save deliberately.
          </p>
        ) : null}
        {!currentControls.canUpdate ? (
          <p className={styles.boundaryMessage}>
            Current server policy allows private viewing only. Disclosure settings cannot be
            changed.
          </p>
        ) : null}
        {currentControls.canUpdate && draft && session.draftState !== 'clean' ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy}
            onClick={() =>
              void run(() => session.save(draft), 'Disclosure settings saved.', 'settings')
            }
          >
            Save disclosure settings
          </button>
        ) : null}
        {feedback('settings')}
      </section>

      <section className={styles.sharingPanel} aria-labelledby="sharing-title">
        <div className={styles.sectionTitle}>
          <div>
            <p className={styles.eyebrow}>CURRENT SHARING</p>
            <h2 id="sharing-title">Link and QR</h2>
          </div>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => void session.refresh()}
          >
            Check current profile
          </button>
        </div>
        {!currentControls.sharingAvailable ? (
          <p className={styles.boundaryMessage}>
            Online sharing is currently unavailable. Your private in-person ID remains available.
          </p>
        ) : null}
        {currentControls.sharingAvailable &&
        profile.visibility === 'public' &&
        profile.publicReference ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={async () => {
              const value = `${window.location.origin}/profiles/${profile.publicReference}`;
              setNotice(null);
              try {
                await navigator.clipboard.writeText(value);
                setCopyFallback(null);
                setNotice({ area: 'sharing', message: 'Profile link copied.', tone: 'status' });
              } catch {
                setCopyFallback(value);
                setNotice({
                  area: 'sharing',
                  message: 'Clipboard unavailable. Select the current profile URL or open it.',
                  tone: 'error',
                });
              }
            }}
          >
            Copy profile link
          </button>
        ) : null}
        {copyFallback &&
        currentControls.sharingAvailable &&
        profile.visibility === 'public' &&
        profile.publicReference &&
        copyFallback === `${window.location.origin}/profiles/${profile.publicReference}` ? (
          <div className={styles.copyFallback}>
            <label htmlFor="current-public-profile-url">Current public profile URL</label>
            <input
              id="current-public-profile-url"
              readOnly
              value={copyFallback}
              onFocus={(event) => event.currentTarget.select()}
            />
            <a href={copyFallback} target="_blank" rel="noreferrer">
              Open current public profile
            </a>
          </div>
        ) : null}
        {currentControls.canIssue && currentControls.sharingAvailable ? (
          <div className={styles.actionRow}>
            {showGenerate ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy}
                onClick={() =>
                  void run(() => session.issue('generate'), 'Temporary QR generated.', 'sharing')
                }
              >
                Generate QR
              </button>
            ) : null}
            {showReplace ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() =>
                  void run(() => session.issue('replace'), 'Temporary QR replaced.', 'sharing')
                }
              >
                Replace QR
              </button>
            ) : null}
          </div>
        ) : null}
        {currentControls.canRevoke && invitation?.status === 'valid' ? (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() => void run(session.revoke, 'Temporary QR revoked.', 'sharing')}
          >
            Revoke QR
          </button>
        ) : null}
        {lostCode ? (
          <p className={styles.warningMessage}>QR issued; code unavailable on this device</p>
        ) : null}
        {invitation?.status === 'expired' ? (
          <p className={styles.boundaryMessage}>The server-confirmed invitation is expired.</p>
        ) : invitationExpiredByClock ? (
          <p className={styles.boundaryMessage}>
            This device stopped displaying the QR at its advisory expiry. Check current profile for
            confirmed status.
          </p>
        ) : null}
        {feedback('sharing')}
        {currentControls.canWithdraw ? (
          <div className={styles.withdrawal}>
            <div>
              <h3>Stop sharing everywhere</h3>
              <p>
                Turns every owned profile private, disables optional fields, and revokes
                invitations.
              </p>
            </div>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busy}
              onClick={() =>
                void run(
                  session.withdraw,
                  'Sharing is off for every profile on this account.',
                  'withdrawal',
                )
              }
            >
              Stop sharing
            </button>
          </div>
        ) : null}
        {feedback('withdrawal')}
      </section>

      <CivilianIdPresentation
        profile={profile.preview}
        invitation={invitation}
        qrUrl={qrUrl}
        open={open}
        onConceal={concealId}
        returnFocus={() => showButton.current?.focus()}
      />
    </section>
  );
}

function ProfileHeading() {
  return (
    <div className={styles.pageHeading}>
      <div className={styles.headingIcon} aria-hidden="true">
        <Icon name="identity" />
      </div>
      <div>
        <p className={styles.eyebrow}>PERSONAL SYSTEM · PRIVATE</p>
        <h1>System ID</h1>
        <p>Your confirmed civilian identity and voluntary disclosure controls.</p>
      </div>
    </div>
  );
}

function ProfileState({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <section className={styles.profilePage}>
      <ProfileHeading />
      <section className={styles.statePanel} role="status">
        <Icon name="identity" width="34" height="34" />
        <h2>{title}</h2>
        <p>{detail}</p>
        {action && onAction ? (
          <button type="button" className={styles.secondaryButton} onClick={onAction}>
            {action}
          </button>
        ) : null}
      </section>
    </section>
  );
}
