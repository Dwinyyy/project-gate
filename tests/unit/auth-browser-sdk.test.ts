import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserAuthController } from '../../packages/client/src/auth.js';

const key = 'sb-127-auth-token';
const userA = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.test' };
const userB = { id: '22222222-2222-4222-8222-222222222222', email: 'b@example.test' };

function token(
  user: typeof userA,
  mode: 'password' | 'recovery',
  expiry: number,
  sessionId: string,
) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({
    sub: user.id,
    exp: expiry,
    aal: 'aal1',
    session_id: sessionId,
    amr: [{ method: mode, timestamp: 1 }],
  })}.fixture`;
}

function session(user: typeof userA, accessToken: string, refreshToken: string) {
  const expiresAt = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString()) as {
    exp: number;
  };
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt.exp,
    user: {
      ...user,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
      factors: [],
    },
  };
}

function browserHarness(initial: ReturnType<typeof session>) {
  const values = new Map<string, string>([[key, JSON.stringify(initial)]]);
  const listeners = new Set<(event: { key: string }) => void>();
  const localStorage = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value);
      for (const listener of listeners) listener({ key: name });
    },
    removeItem: (name: string) => {
      values.delete(name);
      for (const listener of listeners) listener({ key: name });
    },
  };
  let lockQueue = Promise.resolve();
  const locks = {
    request<T>(name: string, _options: unknown, callback: (lock: { name: string }) => Promise<T>) {
      const result = lockQueue.then(() => callback({ name }));
      lockQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('navigator', { locks });
  vi.stubGlobal('window', { location: new URL('http://127.0.0.1:5173/') });
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('addEventListener', (type: string, listener: (event: { key: string }) => void) => {
    if (type === 'storage') listeners.add(listener);
  });
  vi.stubGlobal(
    'removeEventListener',
    (type: string, listener: (event: { key: string }) => void) => {
      if (type === 'storage') listeners.delete(listener);
    },
  );
  return { values };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('installed Supabase SDK session isolation', () => {
  it('reports expired-bearer sign-out as incomplete instead of claiming provider revocation', async () => {
    const now = Math.floor(Date.now() / 1000);
    const tokenA = token(userA, 'password', now + 120, 'session-a');
    const initial = session(userA, tokenA, 'refresh-a');
    const browser = browserHarness(initial);
    let logoutCalls = 0;
    let refreshCalls = 0;
    const fetchAuth = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/v1/auth/config')
        return Response.json({
          supabaseUrl: 'http://127.0.0.1:54321',
          supabasePublishableKey: 'sb_publishable_fixture',
        });
      if (url.includes('grant_type=refresh_token')) {
        refreshCalls += 1;
        return Response.json(initial);
      }
      if (url.endsWith('/auth/v1/user')) return Response.json(initial.user);
      if (url.includes('/auth/v1/logout')) {
        logoutCalls += 1;
        expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${tokenA}`);
        return Response.json({ code: 'bad_jwt', msg: 'expired' }, { status: 401 });
      }
      throw new Error(`unexpected fixture request: ${url}`);
    }) as typeof fetch;
    const controller = await createBrowserAuthController(fetchAuth);
    await controller.ready();
    vi.spyOn(Date, 'now').mockReturnValue((now + 180) * 1000);
    await expect(controller.signOut()).rejects.toMatchObject({ code: 'sign_out_incomplete' });
    expect(logoutCalls).toBe(1);
    expect(refreshCalls).toBe(0);
    expect(browser.values.has(key)).toBe(false);
    controller.dispose();
  });

  it('cannot sign out a replacement when this controller has no originating session', async () => {
    const now = Math.floor(Date.now() / 1000);
    const replacement = session(
      userB,
      token(userB, 'password', now + 3600, 'session-b'),
      'refresh-b',
    );
    const browser = browserHarness(replacement);
    browser.values.clear();
    let logoutCalls = 0;
    const fetchAuth = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/v1/auth/config')
        return Response.json({
          supabaseUrl: 'http://127.0.0.1:54321',
          supabasePublishableKey: 'sb_publishable_fixture',
        });
      if (url.includes('grant_type=password')) return Response.json(replacement);
      if (url.endsWith('/auth/v1/user')) return Response.json(replacement.user);
      if (url.includes('/auth/v1/logout')) {
        logoutCalls += 1;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fixture request: ${url}`);
    }) as typeof fetch;
    const controllerA = await createBrowserAuthController(fetchAuth);
    await controllerA.ready();
    const controllerB = await createBrowserAuthController(fetchAuth);
    await controllerB.ready();
    await controllerB.signIn(userB.email, 'long-enough-password');
    expect(controllerA.getSnapshot().phase).toBe('anonymous');
    await expect(controllerA.signOut()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(logoutCalls).toBe(0);
    expect(JSON.parse(browser.values.get(key)!).access_token).toBe(replacement.access_token);
    controllerA.dispose();
    controllerB.dispose();
  });

  it('fails closed when browser coordination is unavailable', async () => {
    const initial = session(
      userA,
      token(userA, 'password', Math.floor(Date.now() / 1000) + 3600, 'session-a'),
      'refresh-a',
    );
    const browser = browserHarness(initial);
    vi.stubGlobal('navigator', {});
    const fetchAuth = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe('/v1/auth/config');
      return Response.json({
        supabaseUrl: 'http://127.0.0.1:54321',
        supabasePublishableKey: 'sb_publishable_fixture',
      });
    });
    await expect(createBrowserAuthController(fetchAuth)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(fetchAuth).toHaveBeenCalledTimes(1);
    expect(JSON.parse(browser.values.get(key)!).access_token).toBe(initial.access_token);
  });

  it('does not consume the primary refresh token while inspecting an expired recovery session', async () => {
    const now = Math.floor(Date.now() / 1000);
    const initial = session(userA, token(userA, 'recovery', now + 120, 'session-a'), 'refresh-a');
    const browser = browserHarness(initial);
    let refreshCalls = 0;
    const fetchAuth = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/v1/auth/config')
        return Response.json({
          supabaseUrl: 'http://127.0.0.1:54321',
          supabasePublishableKey: 'sb_publishable_fixture',
        });
      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        refreshCalls += 1;
        if (refreshCalls > 1)
          return Response.json(
            { code: 'invalid_grant', msg: 'used refresh token' },
            { status: 400 },
          );
        return Response.json(
          session(userA, token(userA, 'recovery', now + 3600, 'session-a'), 'refresh-a-rotated'),
        );
      }
      if (url.endsWith('/auth/v1/user')) {
        return Date.now() >= (now + 120) * 1000
          ? Response.json({ code: 'bad_jwt', msg: 'expired' }, { status: 401 })
          : Response.json(initial.user);
      }
      throw new Error(`unexpected fixture request: ${url}`);
    }) as typeof fetch;
    const controller = await createBrowserAuthController(fetchAuth);
    await controller.ready();
    expect(controller.getSnapshot().phase).toBe('recovery');
    expect(refreshCalls).toBe(0);

    vi.spyOn(Date, 'now').mockReturnValue((now + 180) * 1000);
    await expect(controller.getRecoveryMfaStatus()).rejects.toMatchObject({ code: 'unavailable' });
    expect(refreshCalls).toBe(0);
    expect(JSON.parse(browser.values.get(key)!).refresh_token).toBe('refresh-a');
    const refreshedController = await createBrowserAuthController(fetchAuth);
    await refreshedController.ready();
    expect(refreshCalls).toBe(1);
    expect(JSON.parse(browser.values.get(key)!).refresh_token).toBe('refresh-a-rotated');
    expect(refreshedController.getSnapshot().phase).toBe('recovery');
    controller.dispose();
    refreshedController.dispose();
  });

  it.each([
    ['another account', userB],
    ['a new session for the same account', userA],
  ])('leaves %s signed in after a late originating logout', async (_label, replacementUser) => {
    const now = Math.floor(Date.now() / 1000);
    const tokenA = token(userA, 'password', now + 3600, 'session-a');
    const tokenB = token(replacementUser, 'password', now + 3600, 'session-b');
    const initial = session(userA, tokenA, 'refresh-a');
    const replacement = session(replacementUser, tokenB, 'refresh-b');
    const browser = browserHarness(initial);
    const logoutStarted = deferred<void>();
    const releaseLogout = deferred<Response>();
    const outgoing: string[] = [];
    const fetchAuth = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/v1/auth/config')
        return Response.json({
          supabaseUrl: 'http://127.0.0.1:54321',
          supabasePublishableKey: 'sb_publishable_fixture',
        });
      if (url.endsWith('/auth/v1/user')) {
        const bearer = new Headers(init?.headers).get('authorization');
        return Response.json(bearer === `Bearer ${tokenB}` ? replacement.user : initial.user);
      }
      if (url.includes('/auth/v1/token?grant_type=password')) return Response.json(replacement);
      if (url.includes('/auth/v1/logout')) {
        outgoing.push(new Headers(init?.headers).get('authorization') ?? '');
        expect(url).toContain('scope=local');
        logoutStarted.resolve();
        return releaseLogout.promise;
      }
      throw new Error(`unexpected fixture request: ${url}`);
    }) as typeof fetch;
    const controllerA = await createBrowserAuthController(fetchAuth);
    await controllerA.ready();
    const pendingLogout = controllerA.signOut();
    await logoutStarted.promise;

    const controllerB = await createBrowserAuthController(fetchAuth);
    await controllerB.ready();
    await controllerB.signIn(replacementUser.email, 'long-enough-password');
    expect(JSON.parse(browser.values.get(key)!).access_token).toBe(tokenB);
    releaseLogout.resolve(new Response(null, { status: 204 }));

    await expect(pendingLogout).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(outgoing).toEqual([`Bearer ${tokenA}`]);
    expect(JSON.parse(browser.values.get(key)!).access_token).toBe(tokenB);
    expect(controllerB.getSnapshot().accessToken).toBe(tokenB);
    controllerA.dispose();
    controllerB.dispose();
  });
});
