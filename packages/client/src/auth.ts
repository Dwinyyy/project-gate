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
  | 'recovery_required'
  | 'password_update_required'
  | 'password_sign_in_required'
  | 'sign_out_incomplete'
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
  accessMode: 'standard' | 'recovery' | 'restricted';
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

export interface MfaStatus {
  assurance: 'unenrolled' | 'aal1' | 'aal2';
  verifiedTotpFactorIds: string[];
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
  beginBoundSession?(session: AuthBackendSession): Promise<BoundAuthSession>;
}

export interface BoundAuthSession {
  isCurrent(): Promise<boolean>;
  getMfaState(): ReturnType<AuthBackend['getMfaState']>;
  enrollTotp(): ReturnType<AuthBackend['enrollTotp']>;
  verifyTotp(input: { factorId: string; code: string }): ReturnType<AuthBackend['verifyTotp']>;
  updatePassword(password: string): ReturnType<AuthBackend['updatePassword']>;
  signOut(): ReturnType<AuthBackend['signOut']>;
  promote(): Promise<AuthBackendSession | null>;
  clear(): Promise<boolean>;
}

export interface AuthSnapshot {
  phase: 'initializing' | 'anonymous' | 'authenticated' | 'recovery' | 'restricted' | 'unavailable';
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
  getRecoveryMfaStatus(): Promise<MfaStatus>;
  verifyRecoveryTotp(factorId: string, code: string): Promise<void>;
  getMfaStatus(): Promise<MfaStatus>;
  enrollTotp(): Promise<TotpEnrollment>;
  verifyTotp(factorId: string, code: string): Promise<void>;
  dispose(): void;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
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

function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3 || !parts[1] || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function authenticationMethods(amr: unknown): string[] | null {
  if (!Array.isArray(amr) || amr.length === 0) return null;
  if (amr.every((entry) => typeof entry === 'string')) {
    const methods = amr as string[];
    return methods.every((method) => method.length > 0 && method.length <= 64) ? methods : null;
  }
  if (
    amr.every((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const record = entry as Record<string, unknown>;
      return (
        typeof record.method === 'string' &&
        record.method.length > 0 &&
        record.method.length <= 64 &&
        typeof record.timestamp === 'number' &&
        Number.isSafeInteger(record.timestamp) &&
        record.timestamp >= 0
      );
    })
  ) {
    return (amr as Array<{ method: string }>).map((entry) => entry.method);
  }
  return null;
}

// UI restriction only. Server authorization independently validates the exact token with Supabase.
export function authAccessModeFromToken(
  accessToken: string,
): AuthBackendSession['accessMode'] | null {
  const payload = decodeJwtPayload(accessToken);
  const methods = payload ? authenticationMethods(payload.amr) : null;
  if (!methods) return null;
  return methods.includes('recovery')
    ? 'recovery'
    : methods.includes('password')
      ? 'standard'
      : 'restricted';
}

function snapshotForSession(
  session: AuthBackendSession | null,
  forceRecovery = false,
): AuthSnapshot {
  return session
    ? {
        phase:
          forceRecovery || session.accessMode === 'recovery'
            ? 'recovery'
            : session.accessMode === 'standard'
              ? 'authenticated'
              : 'restricted',
        user: session.user,
        accessToken: session.accessToken,
        error: null,
      }
    : { phase: 'anonymous', user: null, accessToken: null, error: null };
}

function mfaStatus(state: {
  currentLevel: 'aal1' | 'aal2' | null;
  verifiedTotpFactorIds: string[];
}): MfaStatus {
  return {
    assurance:
      state.currentLevel === 'aal2'
        ? 'aal2'
        : state.verifiedTotpFactorIds.length > 0
          ? 'aal1'
          : 'unenrolled',
    verifiedTotpFactorIds: [...state.verifiedTotpFactorIds],
  };
}

function validateTotp(factorId: string, code: string): void {
  if (!factorId || !/^\d{6}$/.test(code)) {
    throw new AuthActionError('invalid_input', 'Enter the six-digit authenticator code.');
  }
}

export function createAuthControllerForBackend(backend: AuthBackend): AuthController {
  let snapshot: AuthSnapshot = {
    phase: 'initializing',
    user: null,
    accessToken: null,
    error: null,
  };
  let revision = 0;
  let recoveryGeneration = 0;
  let pendingRecoveryVerification: { generation: number; userId: string } | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const publish = (next: AuthSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const publishSession = (
    session: AuthBackendSession | null,
    forceRecovery = false,
    restartRecovery = false,
  ) => {
    const next = snapshotForSession(session, forceRecovery);
    const sameRecovery =
      !restartRecovery &&
      snapshot.phase === 'recovery' &&
      next.phase === 'recovery' &&
      snapshot.user?.id === next.user?.id;
    if (!sameRecovery && (snapshot.phase === 'recovery' || next.phase === 'recovery')) {
      recoveryGeneration += 1;
    }
    publish(next);
  };
  const recoveryContext = () => {
    if (snapshot.phase !== 'recovery' || !snapshot.user) {
      throw new AuthActionError(
        'recovery_required',
        'Open a fresh password-recovery link before continuing.',
      );
    }
    return { generation: recoveryGeneration, userId: snapshot.user.id };
  };
  const recoveryIsCurrent = (context: { generation: number; userId: string }) =>
    snapshot.phase === 'recovery' &&
    snapshot.user?.id === context.userId &&
    recoveryGeneration === context.generation;
  const recoveryChanged = () =>
    new AuthActionError(
      'recovery_required',
      'The recovery session changed. Open the newest recovery link and try again.',
    );
  const unsubscribeBackend = backend.subscribe((event, nextSession) => {
    if (
      event === 'MFA_CHALLENGE_VERIFIED' &&
      pendingRecoveryVerification &&
      (!recoveryIsCurrent(pendingRecoveryVerification) ||
        nextSession?.user.id !== pendingRecoveryVerification.userId)
    ) return;
    revision += 1;
    publishSession(nextSession, event === 'PASSWORD_RECOVERY', event === 'PASSWORD_RECOVERY');
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
      publishSession(result.data ?? null);
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
      publishSession(nextSession);
    },
    async signOut() {
      const result = await backend.signOut('global');
      if (result.error) throw actionError(result.error);
      publishSession(null);
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
      const context = recoveryContext();
      const bound = backend.beginBoundSession
        ? await backend.beginBoundSession({
            accessToken: snapshot.accessToken!,
            user: snapshot.user!,
            accessMode: 'recovery',
          })
        : null;
      const state = mfaStatus(requireData(await (bound ?? backend).getMfaState()));
      if (!recoveryIsCurrent(context)) throw recoveryChanged();
      if (bound && !(await bound.isCurrent())) throw recoveryChanged();
      if (state.assurance === 'aal1') {
        throw new AuthActionError(
          'mfa_required',
          'Verify your authenticator code before choosing a new password.',
        );
      }
      const updated = await (bound ?? backend).updatePassword(password);
      if (updated.error) throw actionError(updated.error);
      if (!bound && !recoveryIsCurrent(context)) {
        throw new AuthActionError(
          'sign_out_incomplete',
          'Your password was updated, but the recovery session changed before global sign-out could be confirmed. Return to sign in with your new password, then retry signing out.',
        );
      }
      const signedOut = bound ? await bound.signOut() : await backend.signOut('global');
      if (signedOut.error) {
        if (bound) {
          // Match provider behavior: local recovery credentials are removed even when global
          // revocation fails, but only while this tab still stores the originating session.
          try {
            if (await bound.clear()) publishSession(null);
          } catch {
            // The honest partial-failure report below still applies.
          }
        }
        throw new AuthActionError(
          'sign_out_incomplete',
          'Your password was updated, but signing out all sessions could not be confirmed. Return to sign in with your new password, then retry signing out.',
        );
      }
      if (bound) {
        if (!(await bound.clear())) {
          // Another sign-in replaced the originating recovery session. Never sign it out.
          throw new AuthActionError(
            'recovery_required',
            'Your password was updated and recovery sessions were signed out, but another account is now active in this browser. Sign in with your new password when you need it.',
          );
        }
        // Publish the committed storage state now; the deferred reconciliation only confirms it.
        publishSession(null);
      } else {
        publishSession(null);
      }
    },
    async getRecoveryMfaStatus() {
      const context = recoveryContext();
      const bound = backend.beginBoundSession
        ? await backend.beginBoundSession({
            accessToken: snapshot.accessToken!, user: snapshot.user!, accessMode: 'recovery',
          })
        : null;
      const status = mfaStatus(requireData(await (bound ?? backend).getMfaState()));
      if (!recoveryIsCurrent(context)) throw recoveryChanged();
      if (bound && !(await bound.isCurrent())) throw recoveryChanged();
      return status;
    },
    async verifyRecoveryTotp(factorId, code) {
      const context = recoveryContext();
      validateTotp(factorId, code);
      const bound = backend.beginBoundSession
        ? await backend.beginBoundSession({
            accessToken: snapshot.accessToken!, user: snapshot.user!, accessMode: 'recovery',
          })
        : null;
      pendingRecoveryVerification = context;
      let nextSession: AuthBackendSession;
      try {
        nextSession = requireData(await (bound ?? backend).verifyTotp({ factorId, code }));
      } finally {
        pendingRecoveryVerification = null;
      }
      if (!recoveryIsCurrent(context)) {
        if (
          snapshot.user?.id === nextSession.user.id &&
          snapshot.accessToken === nextSession.accessToken
        ) {
          await backend.signOut('global');
          publishSession(null);
        }
        throw recoveryChanged();
      }
      if (nextSession.accessMode !== 'recovery') {
        if (bound) {
          // The bound client revokes only the originating account; storage is cleared only
          // while it still holds that exact session.
          await bound.signOut();
          if (await bound.clear()) publishSession(null);
        } else {
          await backend.signOut('global');
          publishSession(null);
        }
        throw new AuthActionError(
          'expired_link',
          'This recovery session could not be verified safely. Request a new recovery link.',
        );
      }
      if (bound) {
        const promoted = await bound.promote();
        if (!promoted) throw recoveryChanged();
        // Publish the committed storage state now; the deferred reconciliation only confirms it.
        publishSession(promoted, true);
      } else publishSession(nextSession, true);
    },
    async getMfaStatus() {
      if (snapshot.phase === 'restricted') {
        throw new AuthActionError(
          'password_sign_in_required',
          'Sign in with your password before using an authenticator.',
        );
      }
      if (snapshot.phase === 'recovery') {
        throw new AuthActionError(
          'password_update_required',
          'Complete password recovery and sign in again before using an authenticator.',
        );
      }
      const origin = snapshot;
      const bound = backend.beginBoundSession && origin.user && origin.accessToken
        ? await backend.beginBoundSession({
            accessToken: origin.accessToken, user: origin.user, accessMode: 'standard',
          })
        : null;
      const result = mfaStatus(requireData(await (bound ?? backend).getMfaState()));
      if (bound && !(await bound.isCurrent())) {
        throw new AuthActionError('unauthenticated', 'The account changed. Sign in again to continue.');
      }
      return result;
    },
    async enrollTotp() {
      if (snapshot.phase === 'restricted') {
        throw new AuthActionError(
          'password_sign_in_required',
          'Sign in with your password before using an authenticator.',
        );
      }
      if (snapshot.phase === 'recovery') {
        throw new AuthActionError(
          'password_update_required',
          'Complete password recovery and sign in again before using an authenticator.',
        );
      }
      const origin = snapshot;
      const bound = backend.beginBoundSession && origin.user && origin.accessToken
        ? await backend.beginBoundSession({
            accessToken: origin.accessToken, user: origin.user, accessMode: 'standard',
          })
        : null;
      const enrollment = requireData(await (bound ?? backend).enrollTotp());
      if (bound && !(await bound.isCurrent())) {
        throw new AuthActionError('unauthenticated', 'The account changed. Sign in again to continue.');
      }
      return {
        ...enrollment,
        qrCode: enrollment.qrCode.startsWith('data:')
          ? enrollment.qrCode
          : `data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCode)}`,
      };
    },
    async verifyTotp(factorId, code) {
      if (snapshot.phase === 'restricted') {
        throw new AuthActionError(
          'password_sign_in_required',
          'Sign in with your password before using an authenticator.',
        );
      }
      if (snapshot.phase === 'recovery') {
        throw new AuthActionError(
          'password_update_required',
          'Complete password recovery and sign in again before using an authenticator.',
        );
      }
      validateTotp(factorId, code);
      const origin = snapshot;
      const bound = backend.beginBoundSession && origin.user && origin.accessToken
        ? await backend.beginBoundSession({
            accessToken: origin.accessToken, user: origin.user, accessMode: 'standard',
          })
        : null;
      const nextSession = requireData(await (bound ?? backend).verifyTotp({ factorId, code }));
      if (bound) {
        const promoted = await bound.promote();
        if (!promoted) {
          throw new AuthActionError('unauthenticated', 'The account changed. Sign in again to continue.');
        }
        publishSession(promoted);
      } else if (
        snapshot.user?.id === origin.user?.id &&
        snapshot.accessToken === origin.accessToken
      ) publishSession(nextSession);
      else throw new AuthActionError('unauthenticated', 'The account changed. Sign in again to continue.');
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
  if (!value) return null;
  const accessMode = authAccessModeFromToken(value.access_token);
  return accessMode
    ? {
        accessToken: value.access_token,
        user: { id: value.user.id, email: value.user.email ?? null },
        accessMode,
      }
    : null;
}

let isolatedClientId = 0;

class BrowserSessionStore {
  readonly storageKey: string;
  private readonly lockName: string;

  constructor(
    private readonly config: AuthConfig,
    private readonly fetchAuth: typeof fetch,
  ) {
    this.storageKey = `sb-${new URL(config.supabaseUrl).hostname.split('.')[0]}-auth-token`;
    this.lockName = `lock:${this.storageKey}`;
  }

  async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const locks = globalThis.navigator?.locks;
    if (!locks?.request) {
      throw new AuthActionError(
        'unavailable',
        'Secure account coordination is unavailable in this browser. Try a supported browser.',
      );
    }
    try {
      return await locks.request(this.lockName, { mode: 'exclusive' }, async (lock) => {
        if (!lock) throw new Error('account lock unavailable');
        return operation();
      });
    } catch (error) {
      if (error instanceof AuthActionError) throw error;
      throw new AuthActionError('unavailable', 'Account access is unavailable. Try again shortly.');
    }
  }

  sdkLock = <T>(_name: string, _timeout: number, operation: () => Promise<T>): Promise<T> =>
    this.exclusive(operation);

  private readRaw(): string | null {
    return globalThis.localStorage.getItem(this.storageKey);
  }

  private parsed(raw: string | null): Session | null {
    if (!raw) return null;
    try {
      const session: unknown = JSON.parse(raw);
      if (!session || typeof session !== 'object') return null;
      const value = session as Record<string, unknown>;
      return typeof value.access_token === 'string' &&
        typeof value.refresh_token === 'string' &&
        value.user && typeof value.user === 'object' &&
        typeof (value.user as Record<string, unknown>).id === 'string'
        ? session as Session : null;
    } catch {
      return null;
    }
  }

  current(): Promise<AuthBackendSession | null> {
    return this.exclusive(async () => backendSession(this.parsed(this.readRaw())));
  }

  async begin(expected: AuthBackendSession, changed: () => void): Promise<BoundAuthSession> {
    const origin = await this.exclusive(async () => {
      const raw = this.readRaw();
      const session = this.parsed(raw);
      if (!session || !raw ||
        session.access_token !== expected.accessToken ||
        session.user.id !== expected.user.id ||
        authAccessModeFromToken(session.access_token) !== expected.accessMode) return null;
      return { raw, session };
    });
    if (!origin) {
      throw new AuthActionError('unauthenticated', 'The account changed. Sign in again to continue.');
    }

    const privateClient = createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
      auth: {
        storageKey: `${this.storageKey}-isolated-${++isolatedClientId}`,
        flowType: 'pkce', autoRefreshToken: false,
        detectSessionInUrl: false, persistSession: false,
      },
      global: { fetch: this.fetchAuth },
    });
    const seeded = await privateClient.auth.setSession({
      access_token: origin.session.access_token,
      refresh_token: origin.session.refresh_token,
    });
    const seededSession = backendSession(seeded.data.session);
    if (seeded.error || !seededSession ||
      seededSession.user.id !== expected.user.id ||
      seededSession.accessMode !== expected.accessMode) {
      throw new AuthActionError('unavailable', 'Account access is unavailable. Try again shortly.');
    }

    let revision = origin.raw;
    const sameRevision = () => this.exclusive(async () => this.readRaw() === revision);
    const exchange = async (next: Session | null) => {
      const exchanged = await this.exclusive(async () => {
        if (this.readRaw() !== revision) return false;
        if (next) {
          revision = JSON.stringify(next);
          globalThis.localStorage.setItem(this.storageKey, revision);
        } else {
          globalThis.localStorage.removeItem(this.storageKey);
          revision = '';
        }
        return true;
      });
      if (exchanged) changed();
      return exchanged;
    };
    return {
      isCurrent: sameRevision,
      getMfaState: () => supabaseMfaState(privateClient),
      enrollTotp: () => supabaseEnrollTotp(privateClient),
      verifyTotp: (input) => supabaseVerifyTotp(privateClient, input),
      async updatePassword(password) {
        const { data, error } = await privateClient.auth.updateUser({ password });
        return { data: data.user ? undefined : null, error: backendError(error) };
      },
      async signOut() {
        const { error } = await privateClient.auth.signOut({ scope: 'global' });
        return { data: undefined, error: backendError(error) };
      },
      async promote() {
        const { data, error } = await privateClient.auth.getSession();
        const next = data.session;
        const projected = backendSession(next);
        if (error || !next || !projected || projected.user.id !== expected.user.id ||
          projected.accessMode !== expected.accessMode) return null;
        return await exchange(next) ? projected : null;
      },
      clear: () => exchange(null),
    };
  }
}

async function supabaseMfaState(client: SupabaseClient): ReturnType<AuthBackend['getMfaState']> {
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) return { data: null, error: backendError(factors.error) };
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error) return { data: null, error: backendError(assurance.error) };
  const rawCurrentLevel: string | null = assurance.data.currentLevel;
  const currentLevel: 'aal1' | 'aal2' | null =
    rawCurrentLevel === 'aal1' ? 'aal1' : rawCurrentLevel === 'aal2' ? 'aal2' : null;
  return {
    data: { currentLevel, verifiedTotpFactorIds: factors.data.totp.map((factor) => factor.id) },
    error: null,
  };
}

async function supabaseEnrollTotp(client: SupabaseClient): ReturnType<AuthBackend['enrollTotp']> {
  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp', friendlyName: 'Hunter World Operator', issuer: 'Hunter World',
  });
  return {
    data: data ? {
      factorId: data.id, qrCode: data.totp.qr_code,
      secret: data.totp.secret, uri: data.totp.uri,
    } : null,
    error: backendError(error),
  };
}

async function supabaseVerifyTotp(
  client: SupabaseClient,
  input: { factorId: string; code: string },
): ReturnType<AuthBackend['verifyTotp']> {
  const { data, error } = await client.auth.mfa.challengeAndVerify(input);
  const accessMode = data ? authAccessModeFromToken(data.access_token) : null;
  return {
    data: data && accessMode ? {
      accessToken: data.access_token,
      user: { id: data.user.id, email: data.user.email ?? null },
      accessMode,
    } : null,
    error: backendError(error),
  };
}

function createSupabaseBackend(client: SupabaseClient, browser?: BrowserSessionStore): AuthBackend {
  const listeners = new Set<(event: AuthBackendEvent, session: AuthBackendSession | null) => void>();
  let reconcileGeneration = 0;
  const reconcile = () => {
    const generation = ++reconcileGeneration;
    // SDK callbacks may run under its lock. Reconciliation must leave that callback first.
    globalThis.setTimeout(() => {
      if (!browser) return;
      void browser.current().then((session) => {
        if (generation !== reconcileGeneration) return;
        for (const listener of listeners) listener('TOKEN_REFRESHED', session);
      }).catch(() => {
        if (generation !== reconcileGeneration) return;
        for (const listener of listeners) listener('SIGNED_OUT', null);
      });
    }, 0);
  };
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      return { data: backendSession(data.session), error: backendError(error) };
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((event, nextSession) => {
        if (browser) reconcile();
        else listener(event, backendSession(nextSession));
      });
      listeners.add(listener);
      const storageListener = (event: StorageEvent) => {
        if (event.key === browser?.storageKey) reconcile();
      };
      if (browser) globalThis.addEventListener?.('storage', storageListener);
      return () => {
        data.subscription.unsubscribe();
        listeners.delete(listener);
        if (browser) globalThis.removeEventListener?.('storage', storageListener);
      };
    },
    async signUp(input) {
      const { data, error } = await (browser ? browser.exclusive(() => client.auth.signUp({
        email: input.email,
        password: input.password,
        options: { emailRedirectTo: input.redirectTo },
      })) : client.auth.signUp({
        email: input.email, password: input.password,
        options: { emailRedirectTo: input.redirectTo },
      }));
      return {
        data: { session: backendSession(data.session) },
        error: backendError(error),
      };
    },
    async signIn(input) {
      const { data, error } = await (browser
        ? browser.exclusive(() => client.auth.signInWithPassword(input))
        : client.auth.signInWithPassword(input));
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
      return supabaseMfaState(client);
    },
    async enrollTotp() {
      return supabaseEnrollTotp(client);
    },
    async verifyTotp(input) {
      return supabaseVerifyTotp(client, input);
    },
    ...(browser ? { beginBoundSession: (session: AuthBackendSession) => browser.begin(session, reconcile) } : {}),
  };
}

function isLoopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

function parseAuthConfig(value: unknown): AuthConfig | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== 'supabaseUrl' && key !== 'supabasePublishableKey') ||
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

export async function getAuthConfig(
  fetchAuth: typeof fetch = globalThis.fetch,
): Promise<AuthConfig> {
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
  const browser = new BrowserSessionStore(config, fetchAuth);
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      storageKey: browser.storageKey,
      storage: globalThis.localStorage,
      lock: browser.sdkLock,
      flowType: 'pkce',
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
    global: { fetch: fetchAuth },
  });
  return createAuthControllerForBackend(createSupabaseBackend(client, browser));
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      if (code === 'PASSWORD_UPDATE_REQUIRED') {
        throw new AuthActionError(
          'password_update_required',
          'Complete password recovery and sign in again to continue.',
        );
      }
      if (code === 'PASSWORD_SIGN_IN_REQUIRED') {
        throw new AuthActionError(
          'password_sign_in_required',
          'Sign in with your password to continue.',
        );
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
    !hasOnlyKeys(session, ['authUserId', 'email', 'emailVerified', 'sessionId', 'aal', 'applicationRole']) ||
    typeof session.authUserId !== 'string' ||
    !uuidPattern.test(session.authUserId) ||
    (session.email !== null && typeof session.email !== 'string') ||
    typeof session.emailVerified !== 'boolean' ||
    (session.sessionId !== null &&
      (typeof session.sessionId !== 'string' || !uuidPattern.test(session.sessionId))) ||
    (session.aal !== 'aal1' && session.aal !== 'aal2') ||
    (session.applicationRole !== 'player' && session.applicationRole !== 'operator')
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
