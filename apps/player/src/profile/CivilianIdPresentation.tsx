import { useLayoutEffect, useRef } from 'react';
import type { CivilianProfileResponse, ProfileInvitationMetadata } from '@hunter-world/contracts';
import { CharacterPortrait } from '../character/CharacterPortrait';
import { ProfileQr } from './ProfileQr';
import styles from './Profile.module.css';

function registrationLabel(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function CivilianIdPresentation({
  profile,
  invitation,
  qrUrl,
  open,
  onConceal,
  returnFocus,
}: {
  profile: CivilianProfileResponse;
  invitation: ProfileInvitationMetadata | null;
  qrUrl: string | null;
  open: boolean;
  onConceal: () => void;
  returnFocus: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const focusReturn = useRef(returnFocus);
  focusReturn.current = returnFocus;

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      wasOpen.current = true;
      if (!element.open) element.showModal();
      close.current?.focus({ preventScroll: true });
      return;
    }
    if (element.open) element.close();
    if (wasOpen.current) {
      wasOpen.current = false;
      focusReturn.current();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.idDialog}
      aria-label="Civilian System ID"
      onCancel={(event) => {
        event.preventDefault();
        onConceal();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex="0"]',
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {open ? (
        <div className={styles.idViewport}>
          <header className={styles.idTopbar}>
            <div>
              <p className={styles.eyebrow}>PERSONAL SYSTEM · PRESENTATION</p>
              <p className={styles.idTopline}>Civilian System ID</p>
            </div>
            <button ref={close} type="button" className={styles.concealButton} onClick={onConceal}>
              Conceal ID
            </button>
          </header>
          <div className={styles.idScroll}>
            <article className={styles.idCard} aria-label="Civilian identification card">
              <div className={styles.idSignal} aria-hidden="true">
                <span />
                VERIFIED CURRENT VIEW
              </div>
              <div className={styles.idIdentity}>
                {profile.appearance ? (
                  <CharacterPortrait appearance={profile.appearance} compact />
                ) : (
                  <div className={styles.idMonogram} aria-hidden="true">
                    ID
                  </div>
                )}
                <div className={styles.idName}>
                  <p>REGISTERED IDENTITY</p>
                  <h1 id="civilian-id-title">{profile.displayAlias}</h1>
                  <strong>{profile.identityLabel}</strong>
                </div>
              </div>
              {profile.registrationDate ? (
                <dl className={styles.idFacts}>
                  <div>
                    <dt>Registered</dt>
                    <dd>
                      <time dateTime={profile.registrationDate}>
                        {registrationLabel(profile.registrationDate)}
                      </time>
                    </dd>
                  </div>
                </dl>
              ) : null}
              {qrUrl && invitation?.status === 'valid' ? (
                <section className={styles.qrPanel} aria-label="Temporary sharing code">
                  <div className={styles.qrFrame}>
                    <ProfileQr value={qrUrl} label="Temporary profile QR" />
                  </div>
                  <div>
                    <p className={styles.eyebrow}>TEMPORARY PROFILE VIEW</p>
                    <p>
                      Advisory expiry:{' '}
                      <time dateTime={invitation.expiresAt}>
                        {new Date(invitation.expiresAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </p>
                  </div>
                </section>
              ) : null}
            </article>
            <div className={styles.snapshotNotice}>
              <p>A saved image is only a snapshot. Current access requires a fresh server check.</p>
              <p>A temporary code may be forwarded to another eligible signed-in player.</p>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
