import { describe, expect, it } from 'vitest';
import {
  AuthActionError,
  createAuthControllerForBackend,
  getAuthConfig,
  getOperatorSession,
  getSelfSession,
  type AuthBackend,
  type AuthBackendEvent,
  type AuthBackendSession,
} from '../../packages/client/src/auth.js';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'player@example.test' };

function session(accessToken: string): AuthBackendSession {
  return { accessToken, user };
}

class MemoryAuthBackend implements AuthBackend {
  currentSession: AuthBackendSession | null = null;
  verifiedFactorIds: string[] = [];
  assurance: 'aal1' | 'aal2' = 'aal1';
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

  async signOut(scope: 'global' | 'others') {
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

  async updatePassword(password: string) {
    return password === 'replacement-password'
      ? { data: undefined, error: null }
      : { data: undefined, error: { code: 'weak_password', message: 'weak' } };
  }

  async refreshSession() {
    this.currentSession = session('refreshed-token');
    return { data: this.currentSession, error: null };
  }

  async getMfaState() {
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

  async verifyTotp(input: { factorId: string; code: string }) {
    if (input.factorId !== 'factor-1' || input.code !== '123456') {
      return { data: null, error: { code: 'invalid_mfa_code', message: 'invalid' } };
    }
    this.assurance = 'aal2';
    this.currentSession = session('aal2-token');
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
      phase: 'authenticated',
      accessToken: 'refreshed-token',
    });
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
        provider_metadata: { role: 'untrusted' },
      })) as typeof fetch;
    await expect(getSelfSession('access-token', selfWithPrivateField)).rejects.toMatchObject({
      code: 'unavailable',
    });

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
