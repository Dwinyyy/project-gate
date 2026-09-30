import { useEffect, useRef } from 'react';
import type { MeResponse } from '@hunter-world/contracts';
import styles from './Character.module.css';

type Character = NonNullable<MeResponse['character']>;

export function BodyStatusDrawer({
  character,
  open,
  onClose,
  returnFocus,
}: {
  character: Character;
  open: boolean;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      closeButton.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-labelledby="body-status-title"
      onCancel={onClose}
      onClose={returnFocus}
      onKeyDown={(event) => {
        // This read-only drawer has one interactive control. Keep Tab in the
        // dialog instead of allowing Chromium to move focus to browser chrome.
        if (event.key === 'Tab') {
          event.preventDefault();
          closeButton.current?.focus();
        }
      }}
    >
      <div className={styles.drawerTop}>
        <div>
          <p className={styles.eyebrow}>PERSONAL SYSTEM · BODY</p>
          <h2 id="body-status-title">Body status</h2>
        </div>
        <button
          className={styles.closeButton}
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close body status"
        >
          Close
        </button>
      </div>
      <p className={styles.lead}>Current confirmed state for {character.displayAlias}.</p>
      <dl className={styles.bodyList}>
        <div>
          <dt>Life</dt>
          <dd>{character.lifeState === 'incapacitated' ? 'Incapacitated' : 'Alive'}</dd>
        </div>
        <div>
          <dt>Awakening</dt>
          <dd>{character.awakeningState === 'unawakened' ? 'Unawakened' : 'Awakened'}</dd>
        </div>
        <div>
          <dt>Presence</dt>
          <dd>
            {character.presenceState.charAt(0).toUpperCase() + character.presenceState.slice(1)}
          </dd>
        </div>
        <div>
          <dt>MP</dt>
          <dd>{character.awakeningState === 'unawakened' ? 'Dormant' : 'Unavailable'}</dd>
        </div>
        <div>
          <dt>HP</dt>
          <dd>Not yet tracked</dd>
        </div>
        <div>
          <dt>Stamina</dt>
          <dd>Not yet tracked</dd>
        </div>
        <div>
          <dt>Injuries and effects</dt>
          <dd>Not yet tracked</dd>
        </div>
      </dl>
      <p className={styles.hint}>
        Resource measurements will appear when authoritative body tracking becomes available.
      </p>
    </dialog>
  );
}
