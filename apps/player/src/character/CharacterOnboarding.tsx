import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { CharacterActionError, createMyCharacter } from '@hunter-world/client';
import {
  appearanceCatalog,
  appearanceCatalogVersion,
  type AppearanceChoice,
  type CreateCharacterInput,
  type MeResponse,
} from '@hunter-world/contracts';
import { appearanceDescription, CharacterPortrait } from './CharacterPortrait';
import styles from './Character.module.css';
import {
  characterAttemptKey,
  readCharacterAttempt,
  requireCharacterConfirmation,
  storeCharacterAttempt,
  subscribeCharacterAttempts,
  type AttemptConfirmation,
} from './characterAttempts';

type Refresh = () => Promise<{ data: MeResponse | undefined }>;

const initialAppearance: AppearanceChoice = {
  catalogVersion: appearanceCatalogVersion,
  presetId: appearanceCatalog.presets[0].id,
  skinToneId: appearanceCatalog.skinTones[0].id,
  hairStyleId: appearanceCatalog.hairStyles[0].id,
  hairColorId: appearanceCatalog.hairColors[0].id,
};

const skinSwatches = ['#f2d8bd', '#dfb792', '#bf8c68', '#9f6549', '#754a39', '#51362c'];
const hairSwatches = ['#171b20', '#503628', '#a45a3e', '#d8af67', '#b7bac0'];

function swatchStyle(color: string) {
  return { '--choice-swatch': color } as CSSProperties;
}

function SelectedCheck({ visible }: { visible: boolean }) {
  return (
    <span className={styles.choiceCheck} aria-hidden="true">
      {visible ? '✓' : ''}
    </span>
  );
}

function unavailableMessage(status: MeResponse['creation']['status'], notBefore: string | null) {
  switch (status) {
    case 'feature_disabled':
      return 'Character creation is currently unavailable. Account access remains open while the world is prepared.';
    case 'restricted':
      return 'This account cannot create a character. You can still view any existing private character information.';
    case 'occupied':
      return 'This account already has a living character. Return to the System to see the confirmed state.';
    case 'cooldown':
      return `A new character cannot be created yet.${notBefore ? ` Earliest eligible time: ${new Date(notBefore).toLocaleString()}.` : ''}`;
    case 'available':
      return '';
  }
}

export function CharacterOnboarding({
  owner,
  token,
  creation,
  refresh,
  checking,
  confirmation,
}: {
  owner: string;
  token: string;
  creation: MeResponse['creation'];
  refresh: Refresh;
  checking: boolean;
  confirmation: AttemptConfirmation | null;
}) {
  const storageKey = characterAttemptKey(owner);
  const attempt = useSyncExternalStore(
    subscribeCharacterAttempts,
    () => readCharacterAttempt(storageKey),
    () => null,
  );
  const [alias, setAlias] = useState(() =>
    attempt ? (JSON.parse(attempt.draft) as CreateCharacterInput).displayAlias : '',
  );
  const [appearance, setAppearance] = useState<AppearanceChoice>(() =>
    attempt ? (JSON.parse(attempt.draft) as CreateCharacterInput).appearance : initialAppearance,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      requireCharacterConfirmation(storageKey);
    };
  }, [storageKey]);

  const normalizedAlias = alias.normalize('NFC').trim();
  const input: CreateCharacterInput = { displayAlias: normalizedAlias, appearance };
  const draft = JSON.stringify(input);
  const exactRetry = attempt?.draft === draft;
  const requiresConfirmation =
    !!attempt &&
    (confirmation?.operationId !== attempt.operationId ||
      confirmation.confirmationVersion !== attempt.confirmationVersion);
  const available = creation.status === 'available';
  useEffect(() => {
    if (requiresConfirmation && !inFlight.current && !busy && !checking && !requiresSignIn)
      void refresh();
  }, [requiresConfirmation, busy, checking, requiresSignIn, refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || checking || requiresConfirmation || requiresSignIn || inFlight.current)
      return;
    if (
      Array.from(normalizedAlias).length < 1 ||
      Array.from(normalizedAlias).length > 40 ||
      /\p{Cc}/u.test(normalizedAlias)
    ) {
      setMessage('Choose an alias of 1–40 characters without control characters.');
      return;
    }
    if (!navigator.onLine) {
      setMessage(
        'You are offline. Reconnect, check your confirmed character state, then create explicitly.',
      );
      return;
    }
    const operationId = exactRetry ? attempt.operationId : crypto.randomUUID();
    inFlight.current = true;
    storeCharacterAttempt(storageKey, { draft, operationId });
    setMessage(null);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      await createMyCharacter(token, input, operationId, controller.signal);
      const confirmed = await refresh();
      if (!mounted.current) return;
      if (confirmed.data?.character) {
        storeCharacterAttempt(storageKey, null);
      } else {
        setMessage(
          'Creation was received, but the current character state could not be confirmed. Check state before retrying.',
        );
      }
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      const code = error instanceof CharacterActionError ? error.code : 'UNAVAILABLE';
      if (
        code === 'AUTH_REQUIRED' ||
        (error instanceof CharacterActionError && error.status === 401)
      ) {
        storeCharacterAttempt(storageKey, null);
        setRequiresSignIn(true);
        setMessage('Your session has expired. Sign out and sign in again.');
      } else if (
        [
          'OPERATOR_ONLY',
          'AUTH_INELIGIBLE',
          'PASSWORD_UPDATE_REQUIRED',
          'PASSWORD_SIGN_IN_REQUIRED',
          'EMAIL_VERIFICATION_REQUIRED',
        ].includes(code)
      ) {
        storeCharacterAttempt(storageKey, null);
        setRequiresSignIn(true);
        setMessage(
          'This session cannot create a player character. Sign out and sign in with an eligible player account.',
        );
      } else if (
        code === 'ACCOUNT_RESTRICTED' ||
        code === 'CHARACTER_CREATION_DISABLED' ||
        code === 'CHARACTER_SLOT_OCCUPIED' ||
        code === 'CHARACTER_CREATION_COOLDOWN'
      ) {
        storeCharacterAttempt(storageKey, null);
        await refresh();
        if (mounted.current)
          setMessage(
            code === 'ACCOUNT_RESTRICTED'
              ? 'This account cannot create a character.'
              : code === 'CHARACTER_CREATION_DISABLED'
                ? 'Character creation is currently unavailable.'
                : code === 'CHARACTER_SLOT_OCCUPIED'
                  ? 'This account already has a living character.'
                  : 'A new character cannot be created yet. Check the current eligibility time.',
          );
      } else if (code === 'OPERATION_CONFLICT' || code === 'INVALID_REQUEST') {
        storeCharacterAttempt(storageKey, null);
        setMessage(
          code === 'OPERATION_CONFLICT'
            ? 'This request identity conflicts with an earlier draft. Check current state before starting a new request.'
            : 'The character choices were not accepted. Check your alias and appearance.',
        );
        await refresh();
      } else {
        // A transport failure does not prove the transaction failed. Read server state first.
        await refresh();
        if (mounted.current) {
          setMessage(
            'The result could not be confirmed. Check your connection, then explicitly retry this same appearance and alias.',
          );
        }
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="character-create-title">
      <p className={styles.eyebrow}>PERSONAL SYSTEM · BEGINNING</p>
      <h1 id="character-create-title">Create your character</h1>
      <p className={styles.lead}>
        Choose the name and appearance you want to carry into this world. Every choice here is free
        and visual.
      </p>
      {!available ? (
        <div className={styles.notice} role="status">
          <p>{unavailableMessage(creation.status, creation.notBefore)}</p>
          <button type="button" className={styles.secondaryButton} onClick={() => void refresh()}>
            Check current state
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <label htmlFor="character-alias">Character alias</label>
          <input
            id="character-alias"
            autoComplete="off"
            maxLength={80}
            disabled={busy}
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
          />
          <p className={styles.hint}>
            1–40 characters. Your account owns one living character at a time.
          </p>
          <div className={styles.livePortrait}>
            <CharacterPortrait appearance={appearance} decorative />
            <output className={styles.portraitDescription} aria-live="polite">
              {appearanceDescription(appearance)}
            </output>
          </div>
          <fieldset className={styles.choiceGroup} disabled={busy}>
            <legend>Base portrait</legend>
            <div className={styles.portraitChoices}>
              {appearanceCatalog.presets.map((option) => {
                const checked = appearance.presetId === option.id;
                return (
                  <label className={styles.portraitChoice} key={option.id}>
                    <input
                      type="radio"
                      name="portrait-preset"
                      value={option.id}
                      checked={checked}
                      onChange={() =>
                        setAppearance((current) => ({ ...current, presetId: option.id }))
                      }
                    />
                    <CharacterPortrait
                      appearance={{ ...appearance, presetId: option.id }}
                      miniature
                      decorative
                    />
                    <span className={styles.choiceLabel}>{option.label}</span>
                    <SelectedCheck visible={checked} />
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset className={styles.choiceGroup} disabled={busy}>
            <legend>Skin tone</legend>
            <div className={styles.swatchChoices}>
              {appearanceCatalog.skinTones.map((option, index) => {
                const checked = appearance.skinToneId === option.id;
                return (
                  <label className={styles.swatchChoice} key={option.id}>
                    <input
                      type="radio"
                      name="portrait-tone"
                      value={option.id}
                      checked={checked}
                      onChange={() =>
                        setAppearance((current) => ({ ...current, skinToneId: option.id }))
                      }
                    />
                    <span className={styles.swatch} style={swatchStyle(skinSwatches[index]!)} />
                    <span className={styles.choiceLabel}>{option.label}</span>
                    <SelectedCheck visible={checked} />
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset className={styles.choiceGroup} disabled={busy}>
            <legend>Hair style</legend>
            <div className={styles.hairStyleChoices}>
              {appearanceCatalog.hairStyles.map((option) => {
                const checked = appearance.hairStyleId === option.id;
                return (
                  <label className={styles.hairStyleChoice} key={option.id}>
                    <input
                      type="radio"
                      name="portrait-hair-style"
                      value={option.id}
                      checked={checked}
                      onChange={() =>
                        setAppearance((current) => ({ ...current, hairStyleId: option.id }))
                      }
                    />
                    <CharacterPortrait
                      appearance={{ ...appearance, hairStyleId: option.id }}
                      miniature
                      decorative
                    />
                    <span className={styles.choiceLabel}>{option.label}</span>
                    <SelectedCheck visible={checked} />
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset className={styles.choiceGroup} disabled={busy}>
            <legend>Hair color</legend>
            <div className={styles.swatchChoices}>
              {appearanceCatalog.hairColors.map((option, index) => {
                const checked = appearance.hairColorId === option.id;
                return (
                  <label className={styles.swatchChoice} key={option.id}>
                    <input
                      type="radio"
                      name="portrait-hair-color"
                      value={option.id}
                      checked={checked}
                      onChange={() =>
                        setAppearance((current) => ({ ...current, hairColorId: option.id }))
                      }
                    />
                    <span className={styles.swatch} style={swatchStyle(hairSwatches[index]!)} />
                    <span className={styles.choiceLabel}>{option.label}</span>
                    <SelectedCheck visible={checked} />
                  </label>
                );
              })}
            </div>
          </fieldset>
          {message ? (
            <p className={styles.notice} role="alert">
              {message}
            </p>
          ) : null}
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={busy || checking || requiresConfirmation || requiresSignIn}
          >
            {busy ? 'Checking creation…' : exactRetry ? 'Retry creation' : 'Create character'}
          </button>
          {exactRetry ? (
            <p className={styles.hint}>
              Retry uses the same request identity for this exact alias and appearance. Editing a
              choice starts a new request.
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
