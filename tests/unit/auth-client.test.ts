import { describe, expect, it } from 'vitest';
import {
  AuthActionError,
  authAccessModeFromToken,
  createAuthControllerForBackend,
  getAuthConfig,
  getOperatorSession,
  getSelfSession,
  type AuthBackend,
  type AuthBackendEvent,
  type AuthBackendResult,
  type AuthBackendSession,
} from '../../packages/client/src/auth.js';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'player@example.test' };

function accessToken(amr: unknown): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ amr })}.fixture`;
}

function session(
  accessToken: string,
  accessMode: 'standard' | 'recovery' | 'restricted' = 'standard',
  sessionUser = user,
): AuthBackendSession {
  return { accessToken, user: sessionUser, accessMode };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

class MemoryAuthBackend implements AuthBackend {
  currentSession: AuthBackendSession | null = null;
  verifiedFactorIds: string[] = [];
  assurance: 'aal1' | 'aal2' = 'aal1';
  readonly signOutScopes: Array<'global' | 'others'> = [];
  readonly listeners = new Set<
    (event: AuthBackendEvent, session: AuthBackendSession | null) => void
  >();
  disposed = false;

  async getSession() {
    return { data: this.currentSession, error: null };
  }

  subscribe(listener: (event: AuthBackendEvent, session: AuthBackendSession | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      this.disposed = true;
    };
  }

  async signUp(input: { email: string; password: string; redirectTo: string }) {
    if (
      input.email !== 'player@example.test' ||
      input.password !== 'long-enough-password' ||
      input.redirectTo !== 'https://game.example/auth/callback'
    ) {
      return { data: null, error: { code: 'unexpected_input', message: 'unexpected input' } };
    }
    return { data: { session: null }, error: null };
  }

  async signIn(input: { email: string; password: string }) {
    if (input.email !== 'player@example.test' || input.password !== 'long-enough-password') {
      return { data: null, error: { code: 'invalid_credentials', message: 'invalid' } };
    }
    this.currentSession = session('signed-in-token');
    return { data: this.currentSession, error: null };
  }

  async signOut(scope: 'global' | 'others'): Promise<AuthBackendResult<void>> {
    this.signOutScopes.push(scope);
    if (scope === 'global') this.currentSession = null;
    return { data: undefined, error: null };
  }

  async requestPasswordRecovery(input: { email: string; redirectTo: string }) {
    if (
      input.email !== 'player@example.test' ||
      input.redirectTo !== 'https://game.example/account/recovery'
    ) {
      return { data: undefined, error: { code: 'unexpected_input', message: 'unexpected input' } };
    }
    return { data: undefined, error: null };
  }

  async updatePassword(password: string): ReturnType<AuthBackend['updatePassword']> {
    return password === 'replacement-password'
      ? { data: undefined, error: null }
      : { data: undefined, error: { code: 'weak_password', message: 'weak' } };
  }

  async refreshSession() {
    this.currentSession = session('refreshed-token');
    return { data: this.currentSession, error: null };
  }

  async getMfaState(): ReturnType<AuthBackend['getMfaState']> {
    return {
      data: { currentLevel: this.assurance, verifiedTotpFactorIds: this.verifiedFactorIds },
      error: null,
    };
  }

  async enrollTotp() {
    return {
      data: {
        factorId: 'factor-1',
        qrCode: '<svg>private qr</svg>',
        secret: 'PRIVATE-TOTP-SECRET',
        uri: 'otpauth://totp/private',
      },
      error: null,
    };
  }

  async verifyTotp(input: { factorId: string; code: string }): ReturnType<AuthBackend['verifyTotp']> {
    if (input.factorId !== 'factor-1' || input.code !== '123456') {
      return { data: null, error: { code: 'invalid_mfa_code', message: 'invalid' } };
    }
    this.assurance = 'aal2';
    this.currentSession = session(
      'aal2-token',
      this.currentSession?.accessMode === 'recovery' ? 'recovery' : 'standard',
    );
    return { data: this.currentSession, error: null };
  }

  emit(event: AuthBackendEvent, nextSession: AuthBackendSession | null) {
    this.currentSession = nextSession;
    for (const listener of this.listeners) listener(event, nextSession);
  }
}

describe('browser Auth controller', () => {
  it('tracks initialization, sign-in, provider refresh, and sign-out without inventing authority', async () => {
    const backend = new MemoryAuthBackend();
    const controller = createAuthControllerForBackend(backend);
    expect(controller.getSnapshot().phase).toBe('initializing');

    await controller.ready();
    expect(controller.getSnapshot()).toEqual({
      phase: 'anonymous',
      user: null,
      accessToken: null,
      error: null,
    });

    await controller.signIn(' PLAYER@EXAMPLE.TEST ', 'long-enough-password');
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'authenticated',
      user,
      accessToken: 'signed-in-token',
    });

    backend.emit('TOKEN_REFRESHED', session('rotated-token'));
    expect(controller.getSnapshot().accessToken).toBe('rotated-token');

    await controller.signOut();
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'anonymous',
      user: null,
      accessToken: null,
    });
    controller.dispose();
    expect(backend.disposed).toBe(true);
  });

  it('keeps registration, recovery, and password replacement outcomes explicit', async () => {
    const backend = new MemoryAuthBackend();
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    await expect(
      controller.signUp(
        ' PLAYER@EXAMPLE.TEST ',
        'long-enough-password',
        'https://game.example/auth/callback',
      ),
    ).resolves.toBe('verification-required');
    expect(controller.getSnapshot().phase).toBe('anonymous');

    await expect(
      controller.requestPasswordRecovery(
        'player@example.test',
        'https://game.example/account/recovery',
      ),
    ).resolves.toBeUndefined();

    backend.emit('PASSWORD_RECOVERY', session('recovery-token'));
    expect(controller.getSnapshot().phase).toBe('recovery');
    await controller.updatePassword('replacement-password');
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'anonymous',
      accessToken: null,
    });
    expect(backend.signOutScopes).toEqual(['global']);
  });

  it.each([false, true])(
    'reports a changed password honestly when global sign-out fails (local cleared: %s)',
    async (cleared) => {
      const backend = new MemoryAuthBackend();
      backend.currentSession = session('recovery-token', 'recovery');
      backend.signOut = async () => {
        if (cleared) backend.emit('SIGNED_OUT', null);
        return { data: undefined, error: { message: 'private provider detail' } };
      };
      const controller = createAuthControllerForBackend(backend);
      await controller.ready();
      await expect(controller.updatePassword('replacement-password')).rejects.toMatchObject({
        code: 'sign_out_incomplete',
        message:
          'Your password was updated, but signing out all sessions could not be confirmed. Return to sign in with your new password, then retry signing out.',
      });
      expect(controller.getSnapshot().phase).toBe(cleared ? 'anonymous' : 'recovery');
    },
  );

  it('reconstructs recovery mode during initialization and token refresh', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('stored-recovery-token', 'recovery');
    const controller = createAuthControllerForBackend(backend);

    await controller.ready();
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'recovery',
      accessToken: 'stored-recovery-token',
    });

    backend.emit('TOKEN_REFRESHED', session('refreshed-recovery-token', 'recovery'));
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'recovery',
      accessToken: 'refreshed-recovery-token',
    });
  });

  it('allows password replacement only from recovery and blocks operator MFA operations there', async () => {
    const standardBackend = new MemoryAuthBackend();
    standardBackend.currentSession = session('standard-token');
    const standardController = createAuthControllerForBackend(standardBackend);
    await standardController.ready();

    await expect(standardController.updatePassword('replacement-password')).rejects.toMatchObject({
      code: 'recovery_required',
    });

    const recoveryBackend = new MemoryAuthBackend();
    recoveryBackend.currentSession = session('recovery-token', 'recovery');
    const recoveryController = createAuthControllerForBackend(recoveryBackend);
    await recoveryController.ready();

    await expect(recoveryController.getMfaStatus()).rejects.toMatchObject({
      code: 'password_update_required',
    });
    await expect(recoveryController.enrollTotp()).rejects.toMatchObject({
      code: 'password_update_required',
    });
    await expect(recoveryController.verifyTotp('factor-1', '123456')).rejects.toMatchObject({
      code: 'password_update_required',
    });
  });

  it('requires an enrolled recovery factor before password replacement and stays recovery-only after verification', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('recovery-token', 'recovery');
    backend.verifiedFactorIds = ['factor-1'];
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    await expect(controller.getRecoveryMfaStatus()).resolves.toEqual({
      assurance: 'aal1',
      verifiedTotpFactorIds: ['factor-1'],
    });
    await expect(controller.updatePassword('replacement-password')).rejects.toMatchObject({
      code: 'mfa_required',
    });
    await expect(controller.verifyRecoveryTotp('factor-1', '12x')).rejects.toMatchObject({
      code: 'invalid_input',
    });

    await controller.verifyRecoveryTotp('factor-1', '123456');
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'recovery',
      accessToken: 'aal2-token',
    });
    await expect(controller.getRecoveryMfaStatus()).resolves.toEqual({
      assurance: 'aal2',
      verifiedTotpFactorIds: ['factor-1'],
    });

    backend.emit('TOKEN_REFRESHED', session('refreshed-aal2-recovery', 'recovery'));
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'recovery',
      accessToken: 'refreshed-aal2-recovery',
    });
    await controller.updatePassword('replacement-password');
    expect(controller.getSnapshot().phase).toBe('anonymous');
  });

  it('keeps password-only recovery unchanged when no verified factor exists', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('recovery-token', 'recovery');
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    await expect(controller.getRecoveryMfaStatus()).resolves.toEqual({
      assurance: 'unenrolled',
      verifiedTotpFactorIds: [],
    });
    await controller.updatePassword('replacement-password');
    expect(backend.signOutScopes).toEqual(['global']);
  });

  it('fails closed if an MFA verification response loses the recovery marker', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('recovery-token', 'recovery');
    backend.verifiedFactorIds = ['factor-1'];
    backend.verifyTotp = async () => {
      backend.assurance = 'aal2';
      return { data: session('unexpected-standard-token'), error: null };
    };
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    await expect(controller.verifyRecoveryTotp('factor-1', '123456')).rejects.toMatchObject({
      code: 'expired_link',
    });
    expect(backend.signOutScopes).toEqual(['global']);
    expect(controller.getSnapshot().phase).toBe('anonymous');
  });

  it('keeps recovery locked when an enrolled factor becomes stale before verification', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('recovery-token', 'recovery');
    backend.verifiedFactorIds = ['factor-1'];
    backend.verifyTotp = async () => ({
      data: null,
      error: { code: 'factor_not_found', message: 'private factor detail' },
    });
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    await expect(controller.verifyRecoveryTotp('factor-1', '123456')).rejects.toMatchObject({
      code: 'unavailable',
      message: 'Account access is unavailable. Try again shortly.',
    });
    expect(controller.getSnapshot().phase).toBe('recovery');
    await expect(controller.updatePassword('replacement-password')).rejects.toMatchObject({
      code: 'mfa_required',
    });
  });

  it('does not update a replacement account when the recovery session changes during the MFA check', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('recovery-a', 'recovery');
    const mfaState = deferred<Awaited<ReturnType<AuthBackend['getMfaState']>>>();
    backend.getMfaState = () => mfaState.promise;
    let updatedUserId: string | null = null;
    backend.updatePassword = async () => {
      updatedUserId = backend.currentSession?.user.id ?? null;
      return { data: undefined, error: null };
    };
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    const update = controller.updatePassword('replacement-password');
    const replacementUser = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'replacement@example.test',
    };
    backend.emit('SIGNED_IN', session('standard-b', 'standard', replacementUser));
    mfaState.resolve({
      data: { currentLevel: 'aal1', verifiedTotpFactorIds: [] },
      error: null,
    });

    await expect(update).rejects.toMatchObject({ code: 'recovery_required' });
    expect(updatedUserId).toBeNull();
    expect(backend.signOutScopes).toEqual([]);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'authenticated',
      user: replacementUser,
      accessToken: 'standard-b',
    });
  });

  it('does not sign out a replacement account when recovery changes during the password update', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('recovery-a', 'recovery');
    const passwordUpdate = deferred<AuthBackendResult<void>>();
    const updateStarted = deferred<void>();
    backend.updatePassword = () => {
      updateStarted.resolve();
      return passwordUpdate.promise;
    };
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    const update = controller.updatePassword('replacement-password');
    await updateStarted.promise;
    const replacementUser = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'replacement@example.test',
    };
    backend.emit('SIGNED_IN', session('standard-b', 'standard', replacementUser));
    passwordUpdate.resolve({ data: undefined, error: null });

    await expect(update).rejects.toMatchObject({ code: 'sign_out_incomplete' });
    expect(backend.signOutScopes).toEqual([]);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'authenticated',
      user: replacementUser,
      accessToken: 'standard-b',
    });
  });

  it('quarantines a late MFA completion without replacing or signing out a newer account', async () => {
    const backend = new MemoryAuthBackend();
    const recoveryA = session('recovery-a', 'recovery');
    backend.currentSession = recoveryA;
    backend.verifiedFactorIds = ['factor-1'];
    const verification = deferred<Awaited<ReturnType<AuthBackend['verifyTotp']>>>();
    backend.verifyTotp = () => verification.promise;
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    const pending = controller.verifyRecoveryTotp('factor-1', '123456');
    const replacementUser = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'replacement@example.test',
    };
    backend.emit('SIGNED_OUT', null);
    backend.emit('SIGNED_IN', session('standard-b', 'standard', replacementUser));
    const lateRecoveryA = session('recovery-a-aal2', 'recovery');
    backend.emit('MFA_CHALLENGE_VERIFIED', lateRecoveryA);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'authenticated',
      user: replacementUser,
      accessToken: 'standard-b',
    });
    verification.resolve({ data: lateRecoveryA, error: null });

    await expect(pending).rejects.toMatchObject({ code: 'recovery_required' });
    expect(backend.signOutScopes).toEqual([]);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'authenticated',
      user: replacementUser,
      accessToken: 'standard-b',
    });
  });

  it('allows an in-flight MFA check to continue across a same-account recovery refresh', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('recovery-a', 'recovery');
    const mfaState = deferred<Awaited<ReturnType<AuthBackend['getMfaState']>>>();
    backend.getMfaState = () => mfaState.promise;
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    const update = controller.updatePassword('replacement-password');
    backend.emit('TOKEN_REFRESHED', session('recovery-a-refreshed', 'recovery'));
    mfaState.resolve({
      data: { currentLevel: 'aal1', verifiedTotpFactorIds: [] },
      error: null,
    });

    await expect(update).resolves.toBeUndefined();
    expect(backend.signOutScopes).toEqual(['global']);
    expect(controller.getSnapshot().phase).toBe('anonymous');
  });

  it('enforces local password and TOTP input boundaries before provider work', async () => {
    const backend = new MemoryAuthBackend();
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    await expect(controller.signIn('not-an-email', 'short')).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(controller.updatePassword('short')).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(controller.verifyTotp('factor-1', '12x')).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('requires password sign-in after email-only verification before MFA or application access', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('email-only-token', 'restricted');
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();
    expect(controller.getSnapshot().phase).toBe('restricted');
    await expect(controller.getMfaStatus()).rejects.toMatchObject({
      code: 'password_sign_in_required',
    });
    await expect(controller.enrollTotp()).rejects.toMatchObject({
      code: 'password_sign_in_required',
    });
    await expect(controller.verifyTotp('factor-1', '123456')).rejects.toMatchObject({
      code: 'password_sign_in_required',
    });
    await expect(controller.updatePassword('replacement-password')).rejects.toMatchObject({
      code: 'recovery_required',
    });
    await controller.signIn('player@example.test', 'long-enough-password');
    expect(controller.getSnapshot().phase).toBe('authenticated');
  });

  it('reports unenrolled, challenge-required, and aal2 MFA states', async () => {
    const backend = new MemoryAuthBackend();
    backend.currentSession = session('aal1-token');
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    await expect(controller.getMfaStatus()).resolves.toEqual({
      assurance: 'unenrolled',
      verifiedTotpFactorIds: [],
    });
    const enrollment = await controller.enrollTotp();
    expect(enrollment).toEqual({
      factorId: 'factor-1',
      qrCode: 'data:image/svg+xml;utf-8,%3Csvg%3Eprivate%20qr%3C%2Fsvg%3E',
      secret: 'PRIVATE-TOTP-SECRET',
      uri: 'otpauth://totp/private',
    });

    backend.verifiedFactorIds = ['factor-1'];
    await expect(controller.getMfaStatus()).resolves.toEqual({
      assurance: 'aal1',
      verifiedTotpFactorIds: ['factor-1'],
    });
    await controller.verifyTotp('factor-1', '123456');
    await expect(controller.getMfaStatus()).resolves.toEqual({
      assurance: 'aal2',
      verifiedTotpFactorIds: ['factor-1'],
    });
    expect(controller.getSnapshot().accessToken).toBe('aal2-token');
  });

  it('maps provider failures to stable safe errors', async () => {
    const backend = new MemoryAuthBackend();
    backend.signIn = async () => ({
      data: null,
      error: { code: 'invalid_credentials', message: 'provider detail with an account identifier' },
    });
    const controller = createAuthControllerForBackend(backend);
    await controller.ready();

    await expect(controller.signIn('player@example.test', 'long-enough-password')).rejects.toEqual(
      new AuthActionError('invalid_credentials', 'The email or password is incorrect.'),
    );
  });
});

describe('browser Auth token boundary', () => {
  it.each([
    ['detailed password AMR', [{ method: 'password', timestamp: 1_789_318_800 }], 'standard'],
    [
      'refreshed detailed recovery AMR',
      [
        { method: 'token_refresh', timestamp: 1_789_318_860 },
        { method: 'recovery', timestamp: 1_789_318_800 },
      ],
      'recovery',
    ],
    ['RFC string recovery AMR', ['token_refresh', 'recovery'], 'recovery'],
    ['email OTP verification', ['otp'], 'restricted'],
    ['magic link with MFA', ['totp', 'magiclink'], 'restricted'],
    ['signup link', ['signup'], 'restricted'],
    ['unknown method', ['future_method'], 'restricted'],
    ['password with MFA', ['totp', 'password'], 'standard'],
    ['password with recovery', ['password', 'recovery'], 'recovery'],
  ] as const)('derives %s safely', (_label, amr, expected) => {
    expect(authAccessModeFromToken(accessToken(amr))).toBe(expected);
  });

  it.each([
    ['missing AMR', undefined],
    ['empty AMR', []],
    ['non-array AMR', 'recovery'],
    ['mixed AMR formats', ['password', { method: 'recovery', timestamp: 1_789_318_800 }]],
    ['malformed detailed AMR', [{ method: 'recovery' }]],
  ])('fails closed for %s', (_label, amr) => {
    expect(authAccessModeFromToken(accessToken(amr))).toBeNull();
  });
});

describe('Auth HTTP boundaries', () => {
  it('accepts only a complete public runtime configuration', async () => {
    const authFetch = (async () =>
      Response.json({
        supabaseUrl: 'https://project.supabase.co',
        supabasePublishableKey: 'sb_publishable_example',
      })) as typeof fetch;
    await expect(getAuthConfig(authFetch)).resolves.toEqual({
      supabaseUrl: 'https://project.supabase.co',
      supabasePublishableKey: 'sb_publishable_example',
    });

    await expect(
      getAuthConfig((async () =>
        Response.json({ supabaseUrl: 'javascript:alert(1)' })) as typeof fetch),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('returns validated self and operator session projections', async () => {
    const sessionFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.get('authorization') !== 'Bearer access-token') {
        return new Response(null, { status: 401 });
      }
      if (String(input) === '/v1/auth/session') {
        return Response.json({
          authUserId: user.id,
          email: user.email,
          emailVerified: true,
          sessionId: '22222222-2222-4222-8222-222222222222',
          aal: 'aal2',
          applicationRole: 'operator',
        });
      }
      return Response.json({
        authUserId: user.id,
        aal: 'aal2',
        permissions: ['feature_controls:read'],
      });
    }) as typeof fetch;

    await expect(getSelfSession('access-token', sessionFetch)).resolves.toMatchObject({
      authUserId: user.id,
      emailVerified: true,
      applicationRole: 'operator',
    });
    await expect(getOperatorSession('access-token', sessionFetch)).resolves.toEqual({
      authUserId: user.id,
      aal: 'aal2',
      permissions: ['feature_controls:read'],
    });
  });

  it('rejects unsupported session fields and permission values', async () => {
    const selfWithPrivateField = (async () =>
      Response.json({
        authUserId: user.id,
        email: user.email,
        emailVerified: true,
        sessionId: null,
        aal: 'aal1',
        applicationRole: 'player',
        provider_metadata: { role: 'untrusted' },
      })) as typeof fetch;
    await expect(getSelfSession('access-token', selfWithPrivateField)).rejects.toMatchObject({
      code: 'unavailable',
    });

    const invalidRole = (async () => Response.json({
      authUserId: user.id, email: user.email, emailVerified: true,
      sessionId: null, aal: 'aal1', applicationRole: 'admin',
    })) as typeof fetch;
    await expect(getSelfSession('access-token', invalidRole)).rejects.toMatchObject({ code: 'unavailable' });

    const invalidPermission = (async () =>
      Response.json({
        authUserId: user.id,
        aal: 'aal2',
        permissions: ['Administrator'],
      })) as typeof fetch;
    await expect(getOperatorSession('access-token', invalidPermission)).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('redacts network failures at the session boundary', async () => {
    const failedFetch = (async () => {
      throw new Error('provider request contained a private token');
    }) as typeof fetch;
    const result = getSelfSession('access-token', failedFetch);
    await expect(result).rejects.toMatchObject({ code: 'unavailable' });
    await expect(result).rejects.not.toThrow(/private token/);
  });
});
