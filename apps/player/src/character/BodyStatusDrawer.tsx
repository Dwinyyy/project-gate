import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { MeResponse } from '@hunter-world/contracts';
import styles from './Character.module.css';

type Character = NonNullable<MeResponse['character']>;

export function BodyStatusDrawer({
  character,
  open,
  onClose,
  returnFocus,
  frameRef,
}: {
  character: Character;
  open: boolean;
  onClose: () => void;
  returnFocus: () => void;
  frameRef: RefObject<HTMLDivElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    const frame = frameRef.current;
    if (!element || !frame) return;
    const alignToFrame = () => {
      const bounds = frame.getBoundingClientRect();
      element.style.left = `${bounds.left}px`;
      element.style.bottom = `${window.innerHeight - bounds.bottom}px`;
      element.style.width = `${bounds.width}px`;
      element.style.maxHeight = `${Math.min(bounds.height * 0.85, 660)}px`;
    };
    alignToFrame();
    if (open && !element.open) {
      element.showModal();
      closeButton.current?.focus();
    }
    if (!open && element.open) element.close();
    const observer = new ResizeObserver(alignToFrame);
    observer.observe(frame);
    window.addEventListener('resize', alignToFrame);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', alignToFrame);
    };
  }, [open, frameRef]);
  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-labelledby="body-status-title"
      onCancel={onClose}
      onClose={returnFocus}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          const controls = dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [tabindex="0"]',
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
      <div className={styles.drawerContent} tabIndex={0} role="region" aria-label="Body details">
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
      </div>
    </dialog>
  );
}
