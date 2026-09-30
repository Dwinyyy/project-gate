import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CharacterActionError, createMyCharacter } from '@hunter-world/client';
import {
  appearanceCatalog,
  appearanceCatalogVersion,
  type AppearanceChoice,
  type CreateCharacterInput,
  type MeResponse,
} from '@hunter-world/contracts';
import { CharacterPortrait } from './CharacterPortrait';
import styles from './Character.module.css';

type Attempt = { draft: string; operationId: string; outcome: 'uncertain' | 'sending' };
type Refresh = () => Promise<{ data: MeResponse | undefined }>;

const initialAppearance: AppearanceChoice = {
  catalogVersion: appearanceCatalogVersion,
  presetId: appearanceCatalog.presets[0].id,
  skinToneId: appearanceCatalog.skinTones[0].id,
  hairStyleId: appearanceCatalog.hairStyles[0].id,
  hairColorId: appearanceCatalog.hairColors[0].id,
};

function readAttempt(key: string): Attempt | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.draft !== 'string' ||
      typeof record.operationId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        record.operationId,
      )
    )
      return null;
    const draft: CreateCharacterInput = JSON.parse(record.draft);
    if (
      typeof draft.displayAlias !== 'string' ||
      !draft.appearance ||
      draft.appearance.catalogVersion !== 1 ||
      !appearanceCatalog.presets.some((option) => option.id === draft.appearance.presetId) ||
      !appearanceCatalog.skinTones.some((option) => option.id === draft.appearance.skinToneId) ||
      !appearanceCatalog.hairStyles.some((option) => option.id === draft.appearance.hairStyleId) ||
      !appearanceCatalog.hairColors.some((option) => option.id === draft.appearance.hairColorId)
    )
      return null;
    return { draft: record.draft, operationId: record.operationId, outcome: 'uncertain' };
  } catch {
    return null;
  }
}

function storeAttempt(key: string, attempt: Attempt | null) {
  try {
    if (attempt) sessionStorage.setItem(key, JSON.stringify(attempt));
    else sessionStorage.removeItem(key);
  } catch {
    /* In-memory retry still works when browser storage is unavailable. */
  }
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
}: {
  owner: string;
  token: string;
  creation: MeResponse['creation'];
  refresh: Refresh;
  checking: boolean;
}) {
  const storageKey = `hunter-character-attempt:${owner.split(':').slice(0, 2).join(':')}`;
  const [attempt, setAttempt] = useState<Attempt | null>(() => readAttempt(storageKey));
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
    };
  }, []);

  const normalizedAlias = alias.normalize('NFC').trim();
  const input: CreateCharacterInput = { displayAlias: normalizedAlias, appearance };
  const draft = JSON.stringify(input);
  const exactRetry = attempt?.draft === draft && attempt.outcome === 'uncertain';
  const available = creation.status === 'available';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || checking || requiresSignIn || inFlight.current) return;
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
    const next: Attempt = { draft, operationId, outcome: 'sending' };
    storeAttempt(storageKey, next);
    setAttempt(next);
    setMessage(null);
    setBusy(true);
    inFlight.current = true;
    const controller = new AbortController();
    abort.current = controller;
    try {
      await createMyCharacter(token, input, operationId, controller.signal);
      const confirmed = await refresh();
      if (!mounted.current) return;
      if (confirmed.data?.character) {
        storeAttempt(storageKey, null);
      } else {
        setAttempt({ ...next, outcome: 'uncertain' });
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
        storeAttempt(storageKey, null);
        setAttempt(null);
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
        storeAttempt(storageKey, null);
        setAttempt(null);
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
        storeAttempt(storageKey, null);
        setAttempt(null);
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
        storeAttempt(storageKey, null);
        setAttempt(null);
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
          setAttempt({ ...next, outcome: 'uncertain' });
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
          <CharacterPortrait appearance={appearance} />
          <label htmlFor="portrait-preset">Base portrait</label>
          <select
            disabled={busy}
            id="portrait-preset"
            value={appearance.presetId}
            onChange={(event) =>
              setAppearance((current) => ({
                ...current,
                presetId: event.target.value as AppearanceChoice['presetId'],
              }))
            }
          >
            {appearanceCatalog.presets.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="portrait-tone">Skin tone</label>
          <select
            disabled={busy}
            id="portrait-tone"
            value={appearance.skinToneId}
            onChange={(event) =>
              setAppearance((current) => ({
                ...current,
                skinToneId: event.target.value as AppearanceChoice['skinToneId'],
              }))
            }
          >
            {appearanceCatalog.skinTones.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="portrait-hair-style">Hair style</label>
          <select
            disabled={busy}
            id="portrait-hair-style"
            value={appearance.hairStyleId}
            onChange={(event) =>
              setAppearance((current) => ({
                ...current,
                hairStyleId: event.target.value as AppearanceChoice['hairStyleId'],
              }))
            }
          >
            {appearanceCatalog.hairStyles.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="portrait-hair-color">Hair color</label>
          <select
            disabled={busy}
            id="portrait-hair-color"
            value={appearance.hairColorId}
            onChange={(event) =>
              setAppearance((current) => ({
                ...current,
                hairColorId: event.target.value as AppearanceChoice['hairColorId'],
              }))
            }
          >
            {appearanceCatalog.hairColors.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {message ? (
            <p className={styles.notice} role="alert">
              {message}
            </p>
          ) : null}
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={busy || checking || requiresSignIn}
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
