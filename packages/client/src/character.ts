import type {
  AppearanceChoice,
  CharacterCreationResponse,
  CreateCharacterInput,
  MeResponse,
} from '@hunter-world/contracts';

export class CharacterActionError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly retryAfter: number | null;

  constructor(
    code: string,
    message: string,
    options: { status?: number; requestId?: string | null; retryAfter?: number | null } = {},
  ) {
    super(message);
    this.name = 'CharacterActionError';
    this.code = code;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.retryAfter = options.retryAfter ?? null;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeMessage = 'Character information is unavailable. Try again shortly.';
const modes = ['onboarding', 'active', 'incapacitated', 'observer', 'restricted'] as const;
const createStatuses = [
  'available',
  'occupied',
  'cooldown',
  'feature_disabled',
  'restricted',
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function dateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function appearance(value: unknown): value is AppearanceChoice {
  if (
    !record(value) ||
    !exactKeys(value, ['catalogVersion', 'presetId', 'skinToneId', 'hairStyleId', 'hairColorId'])
  )
    return false;
  return (
    value.catalogVersion === 1 &&
    ['portrait-01', 'portrait-02', 'portrait-03', 'portrait-04'].includes(String(value.presetId)) &&
    ['tone-01', 'tone-02', 'tone-03', 'tone-04', 'tone-05', 'tone-06'].includes(
      String(value.skinToneId),
    ) &&
    ['cropped', 'swept', 'curly', 'coiled', 'shaved'].includes(String(value.hairStyleId)) &&
    ['black', 'brown', 'auburn', 'blond', 'silver'].includes(String(value.hairColorId))
  );
}

function validMe(value: unknown): value is MeResponse {
  if (
    !record(value) ||
    !exactKeys(value, ['schemaVersion', 'mode', 'character', 'creation']) ||
    value.schemaVersion !== 3 ||
    !modes.includes(value.mode as (typeof modes)[number])
  )
    return false;
  if (
    !record(value.creation) ||
    !exactKeys(value.creation, ['status', 'notBefore']) ||
    !createStatuses.includes(value.creation.status as (typeof createStatuses)[number]) ||
    (value.creation.notBefore !== null && !dateTime(value.creation.notBefore))
  )
    return false;
  if (value.character === null) return true;
  const c = value.character;
  return (
    record(c) &&
    exactKeys(c, [
      'id',
      'displayAlias',
      'appearance',
      'lifeState',
      'awakeningState',
      'presenceState',
      'profileVisibility',
      'revision',
      'createdAt',
    ]) &&
    typeof c.id === 'string' &&
    uuidPattern.test(c.id) &&
    typeof c.displayAlias === 'string' &&
    appearance(c.appearance) &&
    (c.lifeState === 'alive' || c.lifeState === 'incapacitated') &&
    (c.awakeningState === 'unawakened' || c.awakeningState === 'awakened') &&
    ['sheltered', 'active', 'committed'].includes(String(c.presenceState)) &&
    ['private', 'limited', 'public'].includes(String(c.profileVisibility)) &&
    typeof c.revision === 'string' &&
    /^(0|[1-9][0-9]*)$/.test(c.revision) &&
    dateTime(c.createdAt)
  );
}

function validCreation(value: unknown): value is CharacterCreationResponse {
  return (
    record(value) &&
    exactKeys(value, ['characterId', 'operationId', 'createdAt']) &&
    typeof value.characterId === 'string' &&
    uuidPattern.test(value.characterId) &&
    typeof value.operationId === 'string' &&
    uuidPattern.test(value.operationId) &&
    dateTime(value.createdAt)
  );
}

function retryAfter(response: Response): number | null {
  const value = response.headers.get('Retry-After');
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1000) : null;
}

async function raiseResponseError(response: Response): Promise<never> {
  let code = 'UNAVAILABLE';
  let requestId: string | null = null;
  try {
    const value: unknown = await response.json();
    if (
      record(value) &&
      exactKeys(value, ['error']) &&
      record(value.error) &&
      exactKeys(value.error, ['code', 'requestId']) &&
      typeof value.error.code === 'string' &&
      typeof value.error.requestId === 'string'
    ) {
      code = value.error.code;
      requestId = value.error.requestId;
    }
  } catch {
    // Malformed error bodies deliberately collapse to the same safe error.
  }
  const message =
    response.status === 401
      ? 'Your session has expired. Sign in again.'
      : response.status === 403
        ? 'This character action is unavailable for this account.'
        : safeMessage;
  throw new CharacterActionError(code, message, {
    status: response.status,
    requestId,
    retryAfter: retryAfter(response),
  });
}

async function request<T>(
  path: string,
  init: RequestInit,
  parse: (value: unknown) => value is T,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new CharacterActionError('UNAVAILABLE', safeMessage);
  }
  if (!response.ok) return raiseResponseError(response);
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new CharacterActionError('INVALID_RESPONSE', safeMessage, { status: response.status });
  }
  if (!parse(value))
    throw new CharacterActionError('INVALID_RESPONSE', safeMessage, { status: response.status });
  return value;
}

export function getMyCharacter(accessToken: string, signal?: AbortSignal): Promise<MeResponse> {
  return request(
    '/v1/me',
    {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    },
    validMe,
  );
}

export function createMyCharacter(
  accessToken: string,
  input: CreateCharacterInput,
  operationId: string,
  signal?: AbortSignal,
): Promise<CharacterCreationResponse> {
  return request(
    '/v1/characters',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': operationId,
      },
      body: JSON.stringify({
        displayAlias: input.displayAlias,
        appearance: {
          catalogVersion: input.appearance.catalogVersion,
          presetId: input.appearance.presetId,
          skinToneId: input.appearance.skinToneId,
          hairStyleId: input.appearance.hairStyleId,
          hairColorId: input.appearance.hairColorId,
        },
      }),
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    },
    validCreation,
  );
}
