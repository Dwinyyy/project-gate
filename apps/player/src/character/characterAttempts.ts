import { appearanceCatalog, type CreateCharacterInput } from '@hunter-world/contracts';

export type CharacterAttempt = {
  draft: string;
  operationId: string;
  confirmationVersion: number;
};
export type AttemptConfirmation = Pick<CharacterAttempt, 'operationId' | 'confirmationVersion'>;

const prefix = 'hunter-character-attempt:';
// Storage is optional. This session-scoped copy survives component unmounts,
// while null entries prevent a cleared persisted value from being resurrected.
const attempts = new Map<string, CharacterAttempt | null>();
const listeners = new Set<() => void>();
let confirmationVersion = 0;

export function characterAttemptKey(owner: string) {
  return `${prefix}${owner.split(':').slice(0, 2).join(':')}`;
}

export function subscribeCharacterAttempts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function changed() {
  for (const listener of listeners) listener();
}

export function readCharacterAttempt(key: string): CharacterAttempt | null {
  if (attempts.has(key)) return attempts.get(key) ?? null;
  let attempt: CharacterAttempt | null = null;
  try {
    const raw = sessionStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (
        typeof record.draft === 'string' &&
        typeof record.operationId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          record.operationId,
        )
      ) {
        const draft: CreateCharacterInput = JSON.parse(record.draft);
        if (
          typeof draft.displayAlias === 'string' &&
          draft.appearance?.catalogVersion === 1 &&
          appearanceCatalog.presets.some((option) => option.id === draft.appearance.presetId) &&
          appearanceCatalog.skinTones.some((option) => option.id === draft.appearance.skinToneId) &&
          appearanceCatalog.hairStyles.some(
            (option) => option.id === draft.appearance.hairStyleId,
          ) &&
          appearanceCatalog.hairColors.some((option) => option.id === draft.appearance.hairColorId)
        ) {
          attempt = {
            draft: record.draft,
            operationId: record.operationId,
            confirmationVersion: ++confirmationVersion,
          };
        }
      }
    }
  } catch {
    /* A blocked storage read does not remove the in-memory copy. */
  }
  attempts.set(key, attempt);
  return attempt;
}

export function storeCharacterAttempt(
  key: string,
  input: Pick<CharacterAttempt, 'draft' | 'operationId'> | null,
) {
  const attempt = input ? { ...input, confirmationVersion: ++confirmationVersion } : null;
  attempts.set(key, attempt);
  try {
    if (attempt)
      sessionStorage.setItem(
        key,
        JSON.stringify({ draft: attempt.draft, operationId: attempt.operationId }),
      );
    else sessionStorage.removeItem(key);
  } catch {
    /* The in-memory copy is retained when persistence is unavailable. */
  }
  changed();
}

export function requireCharacterConfirmation(key: string) {
  const attempt = readCharacterAttempt(key);
  if (!attempt) return;
  attempts.set(key, { ...attempt, confirmationVersion: ++confirmationVersion });
  changed();
}

export function clearCharacterAttempts(retainKey?: string) {
  for (const key of attempts.keys()) {
    if (key !== retainKey) attempts.set(key, null);
  }
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(prefix) && key !== retainKey) {
        sessionStorage.removeItem(key);
        attempts.set(key, null);
      }
    }
  } catch {
    /* Private memory is cleared even if browser storage is blocked. */
  }
  changed();
}
