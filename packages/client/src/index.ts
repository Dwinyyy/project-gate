import type { SystemStatus } from '@hunter-world/contracts';

export {
  AuthActionError,
  authAccessModeFromToken,
  createAuthControllerForBackend,
  createBrowserAuthController,
  getAuthConfig,
  getOperatorSession,
  getSelfSession,
  type AuthBackend,
  type AuthBackendEvent,
  type AuthBackendSession,
  type AuthController,
  type MfaStatus,
  type AuthProblem,
  type AuthSnapshot,
  type TotpEnrollment,
} from './auth.js';

export { CharacterActionError, createMyCharacter, getMyCharacter } from './character.js';

function isStatus(value: unknown): value is SystemStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  if (
    status.name !== 'Hunter World' ||
    status.release !== 'foundation' ||
    typeof status.serverTime !== 'string' ||
    !Number.isFinite(Date.parse(status.serverTime))
  )
    return false;
  if (!status.capabilities || typeof status.capabilities !== 'object') return false;
  const capabilities = status.capabilities as Record<string, unknown>;
  return ['registration', 'characters', 'encounters', 'commerce'].every(
    (key) => capabilities[key] === false,
  );
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await fetch('/v1/system/status', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('The System service is unavailable. Try again shortly.');
  const value: unknown = await response.json();
  if (!isStatus(value))
    throw new Error('The System returned an unsupported response. Refresh to try again.');
  return value;
}
