import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthConfig, OperatorSession, SelfSession } from '@hunter-world/contracts';

export type AuthProblem =
  | 'invalid_input'
  | 'invalid_credentials'
  | 'verification_required'
  | 'rate_limited'
  | 'expired_link'
  | 'invalid_code'
  | 'unauthenticated'
  | 'mfa_required'
  | 'operator_access_denied'
  | 'unavailable';

export class AuthActionError extends Error {
  constructor(
    readonly code: AuthProblem,
    message: string,
  ) {
    super(message);
    this.name = 'AuthActionError';
  }
}

export interface AuthBackendUser {
  id: string;
  email: string | null;
}

export interface AuthBackendSession {
  accessToken: string;
  user: AuthBackendUser;
}

export type AuthBackendEvent =
  | 'INITIAL_SESSION'
  | 'PASSWORD_RECOVERY'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'MFA_CHALLENGE_VERIFIED';

export interface AuthBackendError {
  code?: string;
  message: string;
  status?: number;
}

export interface AuthBackendResult<T> {
  data: T | null | undefined;
  error: AuthBackendError | null;
}

export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export interface AuthBackend {
  getSession(): Promise<AuthBackendResult<AuthBackendSession | null>>;
  subscribe(
    listener: (event: AuthBackendEvent, session: AuthBackendSession | null) => void,
  ): () => void;
  signUp(input: {
    email: string;
    password: string;
    redirectTo: string;
  }): Promise<AuthBackendResult<{ session: AuthBackendSession | null }>>;
  signIn(input: {
    email: string;
    password: string;
  }): Promise<AuthBackendResult<AuthBackendSession>>;
  signOut(scope: 'global' | 'others'): Promise<AuthBackendResult<void>>;
  requestPasswordRecovery(input: {
    email: string;
    redirectTo: string;
  }): Promise<AuthBackendResult<void>>;
  updatePassword(password: string): Promise<AuthBackendResult<void>>;
  refreshSession(): Promise<AuthBackendResult<AuthBackendSession>>;
  getMfaState(): Promise<
    AuthBackendResult<{
      currentLevel: 'aal1' | 'aal2' | null;
      verifiedTotpFactorIds: string[];
    }>
  >;
  enrollTotp(): Promise<AuthBackendResult<TotpEnrollment>>;
  verifyTotp(input: {
    factorId: string;
    code: string;
  }): Promise<AuthBackendResult<AuthBackendSession>>;
}

export interface AuthSnapshot {
  phase: 'initializing' | 'anonymous' | 'authenticated' | 'recovery' | 'unavailable';
  user: AuthBackendUser | null;
  accessToken: string | null;
  error: string | null;
}

export interface AuthController {
  getSnapshot(): AuthSnapshot;
  subscribe(listener: () => void): () => void;
  ready(): Promise<void>;
  signUp(email: string, password: string, redirectTo: string): Promise<'verification-required'>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordRecovery(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  getMfaStatus(): Promise<'unenrolled' | 'aal1' | 'aal2'>;
  enrollTotp(): Promise<TotpEnrollment>;
  verifyTotp(factorId: string, code: string): Promise<void>;
  dispose(): void;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new AuthActionError('invalid_input', 'Enter a valid email address.');
  }
  return normalized;
}

function validatePassword(password: string): void {
  if (password.length < 12) {
    throw new AuthActionError('invalid_input', 'Use at least 12 characters for your password.');
  }
}

function validateRedirect(redirectTo: string): string {
  try {
    const url = new URL(redirectTo);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) {
      throw new Error('unsafe protocol');
    }
    return url.href;
  } catch {
    throw new AuthActionError('invalid_input', 'The account return path is invalid.');
  }
}

function actionError(error: AuthBackendError | null): AuthActionError {
  const code = error?.code?.toLowerCase() ?? '';
  if (code.includes('invalid_credentials')) {
    return new AuthActionError('invalid_credentials', 'The email or password is incorrect.');
  }
  if (code.includes('email_not_confirmed')) {
    return new AuthActionError('verification_required', 'Verify your email before signing in.');
  }
  if (error?.status === 429 || code.includes('rate_limit') || code.includes('over_request')) {
    return new AuthActionError('rate_limited', 'Too many attempts. Wait a moment and try again.');
  }
  if (code.includes('expired') || code.includes('otp_disabled')) {
    return new AuthActionError('expired_link', 'This account link has expired. Request a new one.');
  }
  if (code.includes('mfa') || code.includes('otp')) {
    return new AuthActionError('invalid_code', 'The authenticator code was not accepted.');
  }
  return new AuthActionError('unavailable', 'Account access is unavailable. Try again shortly.');
}

function requireData<T>(result: AuthBackendResult<T>): T {
  if (result.error || result.data === null || result.data === undefined) {
    throw actionError(result.error);
  }
  return result.data;
}

function snapshotForSession(
  session: AuthBackendSession | null,
  phase: 'authenticated' | 'recovery' = 'authenticated',
): AuthSnapshot {
  return session
    ? { phase, user: session.user, accessToken: session.accessToken, error: null }
    : { phase: 'anonymous', user: null, accessToken: null, error: null };
}

export function createAuthControllerForBackend(backend: AuthBackend): AuthController {
  let snapshot: AuthSnapshot = {
    phase: 'initializing',
    user: null,
    accessToken: null,
    error: null,
  };
  let revision = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const publish = (next: AuthSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const unsubscribeBackend = backend.subscribe((event, nextSession) => {
    revision += 1;
    publish(snapshotForSession(nextSession, event === 'PASSWORD_RECOVERY' ? 'recovery' : 'authenticated'));
  });
  const initializationRevision = revision;
  const readyPromise = backend
    .getSession()
    .then((result) => {
      if (revision !== initializationRevision) return;
      if (result.error) {
        publish({
          phase: 'unavailable',
          user: null,
          accessToken: null,
          error: 'Account access is unavailable. Try again shortly.',
        });
        return;
      }
      publish(snapshotForSession(result.data ?? null));
    })
    .catch(() => {
      publish({
        phase: 'unavailable',
        user: null,
        accessToken: null,
        error: 'Account access is unavailable. Try again shortly.',
      });
    });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready: () => readyPromise,
    async signUp(email, password, redirectTo) {
      validatePassword(password);
      const result = await backend.signUp({
        email: normalizeEmail(email),
        password,
        redirectTo: validateRedirect(redirectTo),
      });
      requireData(result);
      return 'verification-required';
    },
    async signIn(email, password) {
      validatePassword(password);
      const nextSession = requireData(
        await backend.signIn({ email: normalizeEmail(email), password }),
      );
      publish(snapshotForSession(nextSession));
    },
    async signOut() {
      const result = await backend.signOut('global');
      if (result.error) throw actionError(result.error);
      publish(snapshotForSession(null));
    },
    async requestPasswordRecovery(email, redirectTo) {
      const result = await backend.requestPasswordRecovery({
        email: normalizeEmail(email),
        redirectTo: validateRedirect(redirectTo),
      });
      if (result.error) throw actionError(result.error);
    },
    async updatePassword(password) {
      validatePassword(password);
      const updated = await backend.updatePassword(password);
      if (updated.error) throw actionError(updated.error);
      const signedOut = await backend.signOut('others');
      if (signedOut.error) throw actionError(signedOut.error);
      const nextSession = requireData(await backend.refreshSession());
      publish(snapshotForSession(nextSession));
    },
    async getMfaStatus() {
      const state = requireData(await backend.getMfaState());
      if (state.currentLevel === 'aal2') return 'aal2';
      return state.verifiedTotpFactorIds.length > 0 ? 'aal1' : 'unenrolled';
    },
    async enrollTotp() {
      const enrollment = requireData(await backend.enrollTotp());
      return {
        ...enrollment,
        qrCode: enrollment.qrCode.startsWith('data:')
          ? enrollment.qrCode
          : `data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCode)}`,
      };
    },
    async verifyTotp(factorId, code) {
      if (!factorId || !/^\d{6}$/.test(code)) {
        throw new AuthActionError('invalid_input', 'Enter the six-digit authenticator code.');
      }
      const nextSession = requireData(await backend.verifyTotp({ factorId, code }));
      publish(snapshotForSession(nextSession));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeBackend();
      listeners.clear();
    },
  };
}

function backendError(
  error: { code?: unknown; message: string; status?: unknown } | null,
): AuthBackendError | null {
  return error
    ? {
        message: error.message,
        ...(typeof error.code === 'string' ? { code: error.code } : {}),
        ...(typeof error.status === 'number' ? { status: error.status } : {}),
      }
    : null;
}

function backendSession(value: Session | null): AuthBackendSession | null {
  return value
    ? {
        accessToken: value.access_token,
        user: { id: value.user.id, email: value.user.email ?? null },
      }
    : null;
}

function createSupabaseBackend(client: SupabaseClient): AuthBackend {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      return { data: backendSession(data.session), error: backendError(error) };
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((event, nextSession) => {
        listener(event, backendSession(nextSession));
      });
      return () => data.subscription.unsubscribe();
    },
    async signUp(input) {
      const { data, error } = await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: { emailRedirectTo: input.redirectTo },
      });
      return {
        data: { session: backendSession(data.session) },
        error: backendError(error),
      };
    },
    async signIn(input) {
      const { data, error } = await client.auth.signInWithPassword(input);
      return { data: backendSession(data.session), error: backendError(error) };
    },
    async signOut(scope) {
      const { error } = await client.auth.signOut({ scope });
      return { data: undefined, error: backendError(error) };
    },
    async requestPasswordRecovery(input) {
      const { error } = await client.auth.resetPasswordForEmail(input.email, {
        redirectTo: input.redirectTo,
      });
      return { data: undefined, error: backendError(error) };
    },
    async updatePassword(password) {
      const { data, error } = await client.auth.updateUser({ password });
      return { data: data.user ? undefined : null, error: backendError(error) };
    },
    async refreshSession() {
      const { data, error } = await client.auth.refreshSession();
      return { data: backendSession(data.session), error: backendError(error) };
    },
    async getMfaState() {
      const factors = await client.auth.mfa.listFactors();
      if (factors.error) return { data: null, error: backendError(factors.error) };
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) return { data: null, error: backendError(assurance.error) };
      const rawCurrentLevel: string | null = assurance.data.currentLevel;
      const currentLevel: 'aal1' | 'aal2' | null =
        rawCurrentLevel === 'aal1' ? 'aal1' : rawCurrentLevel === 'aal2' ? 'aal2' : null;
      return {
        data: {
          currentLevel,
          verifiedTotpFactorIds: factors.data.totp.map((factor) => factor.id),
        },
        error: null,
      };
    },
    async enrollTotp() {
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Hunter World Operator',
        issuer: 'Hunter World',
      });
      return {
        data: data
          ? {
              factorId: data.id,
              qrCode: data.totp.qr_code,
              secret: data.totp.secret,
              uri: data.totp.uri,
            }
          : null,
        error: backendError(error),
      };
    },
    async verifyTotp(input) {
      const { data, error } = await client.auth.mfa.challengeAndVerify(input);
      return {
        data: data
          ? {
              accessToken: data.access_token,
              user: { id: data.user.id, email: data.user.email ?? null },
            }
          : null,
        error: backendError(error),
      };
    },
  };
}

function isLoopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

function parseAuthConfig(value: unknown): AuthConfig | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => key !== 'supabaseUrl' && key !== 'supabasePublishableKey',
    ) ||
    typeof record.supabaseUrl !== 'string' ||
    typeof record.supabasePublishableKey !== 'string' ||
    record.supabasePublishableKey.length < 1 ||
    record.supabasePublishableKey.length > 4096
  )
    return null;
  try {
    const url = new URL(record.supabaseUrl);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return null;
    return { supabaseUrl: url.origin, supabasePublishableKey: record.supabasePublishableKey };
  } catch {
    return null;
  }
}

export async function getAuthConfig(fetchAuth: typeof fetch = globalThis.fetch): Promise<AuthConfig> {
  try {
    const response = await fetchAuth('/v1/auth/config', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error('auth config unavailable');
    const config = parseAuthConfig(await response.json());
    if (!config) throw new Error('unsupported auth config');
    return config;
  } catch {
    throw new AuthActionError('unavailable', 'Account access is unavailable. Try again shortly.');
  }
}

export async function createBrowserAuthController(
  fetchAuth: typeof fetch = globalThis.fetch,
): Promise<AuthController> {
  const config = await getAuthConfig(fetchAuth);
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  return createAuthControllerForBackend(createSupabaseBackend(client));
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function sessionRequest(
  path: string,
  accessToken: string,
  fetchSession: typeof fetch,
): Promise<unknown> {
  try {
    const response = await fetchSession(path, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      let code = '';
      const value: unknown = await response.json();
      if (value && typeof value === 'object') {
        const error = (value as Record<string, unknown>).error;
        if (error && typeof error === 'object') {
          const responseCode = (error as Record<string, unknown>).code;
          if (typeof responseCode === 'string') code = responseCode;
        }
      }
      if (code === 'MFA_REQUIRED') {
        throw new AuthActionError('mfa_required', 'Verify your authenticator code to continue.');
      }
      if (code === 'OPERATOR_ACCESS_DENIED') {
        throw new AuthActionError('operator_access_denied', 'This account has no operator access.');
      }
      if (response.status === 401) {
        throw new AuthActionError('unauthenticated', 'Your session has expired. Sign in again.');
      }
      throw new AuthActionError('unavailable', 'Account access is unavailable. Try again shortly.');
    }
    return response.json();
  } catch (error) {
    if (error instanceof AuthActionError) throw error;
    throw new AuthActionError('unavailable', 'Account access is unavailable. Try again shortly.');
  }
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

export async function getSelfSession(
  accessToken: string,
  fetchSession: typeof fetch = globalThis.fetch,
): Promise<SelfSession> {
  const value = await sessionRequest('/v1/auth/session', accessToken, fetchSession);
  if (!value || typeof value !== 'object') throw actionError(null);
  const session = value as Record<string, unknown>;
  if (
    !hasOnlyKeys(session, ['authUserId', 'email', 'emailVerified', 'sessionId', 'aal']) ||
    typeof session.authUserId !== 'string' ||
    !uuidPattern.test(session.authUserId) ||
    (session.email !== null && typeof session.email !== 'string') ||
    typeof session.emailVerified !== 'boolean' ||
    (session.sessionId !== null &&
      (typeof session.sessionId !== 'string' || !uuidPattern.test(session.sessionId))) ||
    (session.aal !== 'aal1' && session.aal !== 'aal2')
  )
    throw actionError(null);
  return session as unknown as SelfSession;
}

export async function getOperatorSession(
  accessToken: string,
  fetchSession: typeof fetch = globalThis.fetch,
): Promise<OperatorSession> {
  const value = await sessionRequest('/v1/operator/session', accessToken, fetchSession);
  if (!value || typeof value !== 'object') throw actionError(null);
  const session = value as Record<string, unknown>;
  if (
    !hasOnlyKeys(session, ['authUserId', 'aal', 'permissions']) ||
    typeof session.authUserId !== 'string' ||
    !uuidPattern.test(session.authUserId) ||
    session.aal !== 'aal2' ||
    !Array.isArray(session.permissions) ||
    session.permissions.some(
      (permission) =>
        typeof permission !== 'string' ||
        permission.length < 3 ||
        permission.length > 80 ||
        !/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/.test(permission),
    ) ||
    new Set(session.permissions).size !== session.permissions.length
  )
    throw actionError(null);
  return session as unknown as OperatorSession;
}
