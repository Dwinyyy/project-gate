import {
  civilianProfileResponseSchema,
  ownerProfileResponseSchema,
  profileMutationResponseSchema,
  issueProfileInvitationResponseSchema,
  resolveProfileInvitationResponseSchema,
  errorResponseSchema,
  type CivilianProfileResponse,
  type OwnerProfileResponse,
  type ProfileMutationResponse,
  type IssueProfileInvitationResponse,
  type ResolveProfileInvitationResponse,
  type UpdateMyProfileInput,
  type IssueProfileInvitationInput,
  type RevokeProfileInvitationInput,
  type WithdrawProfileDisclosureInput,
  type ResolveProfileInvitationInput,
} from '@hunter-world/contracts';

export class ProfileActionError extends Error {
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
    this.name = 'ProfileActionError';
    this.code = code;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.retryAfter = options.retryAfter ?? null;
  }
}

const safeOwnerMessage = 'Profile information is unavailable. Try again shortly.';
const safeSharedMessage = 'Shared profile unavailable';
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isAbort(error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError';
}
function calendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
}
function dateTime(value: string): boolean {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return (
    !!match &&
    calendarDate(match[1]!) &&
    Number(match[2]) <= 23 &&
    Number(match[3]) <= 59 &&
    Number(match[4]) <= 59 &&
    (match[5] === undefined || (Number(match[5]) <= 23 && Number(match[6]) <= 59)) &&
    Number.isFinite(Date.parse(value))
  );
}

// Interpret only the schema vocabulary used by these public contracts. Unknown
// keywords fail closed, so a later schema change cannot silently weaken parsing.
function valid(value: unknown, schema: unknown): boolean {
  if (!record(schema)) return false;
  if (
    Object.keys(schema).some(
      (key) =>
        ![
          'type',
          'additionalProperties',
          'required',
          'properties',
          'anyOf',
          'const',
          'enum',
          'pattern',
          'format',
          'minimum',
        ].includes(key),
    )
  )
    return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((branch) => valid(value, branch)))
    return false;
  if ('const' in schema && value !== schema.const) return false;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (schema.type === 'null' && value !== null) return false;
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (schema.type === 'integer' && (typeof value !== 'number' || !Number.isSafeInteger(value)))
    return false;
  if (typeof schema.minimum === 'number' && (typeof value !== 'number' || value < schema.minimum))
    return false;
  if (schema.type === 'string' && typeof value !== 'string') return false;
  if (
    typeof schema.pattern === 'string' &&
    (typeof value !== 'string' || !new RegExp(schema.pattern).test(value))
  )
    return false;
  if (schema.format === 'date' && (typeof value !== 'string' || !calendarDate(value))) return false;
  if (schema.format === 'date-time' && (typeof value !== 'string' || !dateTime(value)))
    return false;
  if (
    schema.format === 'uuid' &&
    (typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
  )
    return false;
  if (schema.type === 'object') {
    if (!record(value) || !record(schema.properties) || !Array.isArray(schema.required))
      return false;
    const properties = schema.properties;
    if (schema.required.some((key) => typeof key !== 'string' || !Object.hasOwn(value, key)))
      return false;
    if (
      schema.additionalProperties !== false ||
      Object.keys(value).some((key) => !Object.hasOwn(properties, key))
    )
      return false;
    if (!Object.entries(value).every(([key, field]) => valid(field, properties[key]))) return false;
  }
  return true;
}

function retryAfter(response: Response): number | null {
  const value = response.headers.get('Retry-After');
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1000) : null;
}
async function raiseResponseError(response: Response, message: string): Promise<never> {
  let code = 'UNAVAILABLE',
    requestId: string | null = null;
  try {
    const value: unknown = await response.json();
    if (valid(value, errorResponseSchema) && record(value) && record(value.error)) {
      code = value.error.code as string;
      requestId = value.error.requestId as string;
    }
  } catch (error) {
    if (isAbort(error)) throw error;
  }
  throw new ProfileActionError(
    code,
    response.status === 401 ? 'Your session has expired. Sign in again.' : message,
    { status: response.status, requestId, retryAfter: retryAfter(response) },
  );
}
async function request<T>(
  path: string,
  init: RequestInit,
  schema: unknown,
  outward = false,
): Promise<T> {
  const message = outward ? safeSharedMessage : safeOwnerMessage;
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ProfileActionError('UNAVAILABLE', message);
  }
  if (!response.ok) return raiseResponseError(response, message);
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ProfileActionError('INVALID_RESPONSE', message, { status: response.status });
  }
  if (!valid(value, schema))
    throw new ProfileActionError('INVALID_RESPONSE', message, { status: response.status });
  return value as T;
}
function init(
  accessToken: string,
  method: string,
  signal?: AbortSignal,
  body?: object,
  operationId?: string,
): RequestInit {
  return {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(operationId !== undefined ? { 'Idempotency-Key': operationId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  };
}
export function getMyProfile(
  accessToken: string,
  signal?: AbortSignal,
): Promise<OwnerProfileResponse> {
  return request('/v1/me/profile', init(accessToken, 'GET', signal), ownerProfileResponseSchema);
}
export function updateMyProfile(
  accessToken: string,
  input: UpdateMyProfileInput,
  operationId: string,
  signal?: AbortSignal,
): Promise<ProfileMutationResponse> {
  return request(
    '/v1/me/profile',
    init(
      accessToken,
      'PUT',
      signal,
      {
        characterId: input.characterId,
        expectedRevision: input.expectedRevision,
        visibility: input.visibility,
        showFictionalAvatar: input.showFictionalAvatar,
        showRegistrationDate: input.showRegistrationDate,
      },
      operationId,
    ),
    profileMutationResponseSchema,
  );
}
export function issueMyProfileInvitation(
  accessToken: string,
  input: IssueProfileInvitationInput,
  operationId: string,
  signal?: AbortSignal,
): Promise<IssueProfileInvitationResponse> {
  return request(
    '/v1/me/profile/invitations',
    init(
      accessToken,
      'POST',
      signal,
      {
        characterId: input.characterId,
        expectedRevision: input.expectedRevision,
        scope: input.scope,
        mode: input.mode,
      },
      operationId,
    ),
    issueProfileInvitationResponseSchema,
  );
}
export function revokeMyProfileInvitation(
  accessToken: string,
  input: RevokeProfileInvitationInput,
  operationId: string,
  signal?: AbortSignal,
): Promise<ProfileMutationResponse> {
  return request(
    '/v1/me/profile/invitations/revoke',
    init(
      accessToken,
      'POST',
      signal,
      { characterId: input.characterId, expectedRevision: input.expectedRevision },
      operationId,
    ),
    profileMutationResponseSchema,
  );
}
export function withdrawMyProfileDisclosure(
  accessToken: string,
  input: WithdrawProfileDisclosureInput,
  operationId: string,
  signal?: AbortSignal,
): Promise<ProfileMutationResponse> {
  return request(
    '/v1/me/profile/disclosure/withdraw',
    init(accessToken, 'POST', signal, { scope: input.scope }, operationId),
    profileMutationResponseSchema,
  );
}
export function getPublicProfile(
  accessToken: string,
  publicReference: string,
  signal?: AbortSignal,
): Promise<CivilianProfileResponse> {
  if (!uuidV4.test(publicReference))
    return Promise.reject(new ProfileActionError('INVALID_REQUEST', safeSharedMessage));
  return request(
    `/v1/profiles/${publicReference}`,
    init(accessToken, 'GET', signal),
    civilianProfileResponseSchema,
    true,
  );
}
export function resolveProfileInvitation(
  accessToken: string,
  input: ResolveProfileInvitationInput,
  signal?: AbortSignal,
): Promise<ResolveProfileInvitationResponse> {
  return request(
    '/v1/profile-invitations/resolve',
    init(accessToken, 'POST', signal, { token: input.token }),
    resolveProfileInvitationResponseSchema,
    true,
  );
}
