import { describe, expect, it } from 'vitest';
import { createSupabaseAuthVerifier } from '../../packages/server/src/auth.js';

const authUserId = '11111111-1111-4111-8111-111111111111';

function accessToken(overrides: Record<string, unknown> = {}): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: authUserId,
      exp: Math.floor(Date.now() / 1000) + 600,
      aal: 'aal2',
      session_id: '22222222-2222-4222-8222-222222222222',
      amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }],
      ...overrides,
    }),
  ).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${payload}.provider-validated-signature`;
}

function providerFetch(expectedToken: string, response: Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (
      String(input) !== 'https://project.supabase.co/auth/v1/user' ||
      headers.get('apikey') !== 'sb_publishable_example' ||
      headers.get('authorization') !== `Bearer ${expectedToken}`
    ) {
      return new Response(null, { status: 401 });
    }
    return response;
  }) as typeof fetch;
}

describe('Supabase access-token verifier', () => {
  it('returns a minimal identity only after the provider validates the same token', async () => {
    const token = accessToken({
      amr: [
        { method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 },
        { method: 'totp', timestamp: Math.floor(Date.now() / 1000) - 30 },
      ],
    });
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(
        token,
        Response.json({
          id: authUserId,
          email: 'operator@example.test',
          email_confirmed_at: '2026-09-13T12:00:00.000Z',
          factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
          user_metadata: { operator: true },
        }),
      ),
    });

    await expect(verifier.verify(token)).resolves.toEqual({
      authUserId,
      email: 'operator@example.test',
      emailVerified: true,
      hasVerifiedTotp: true,
      totpAuthenticated: true,
      sessionId: '22222222-2222-4222-8222-222222222222',
      aal: 'aal2',
      accessMode: 'standard',
    });
  });

  it.each([
    ['no factors', undefined],
    ['removed factors', []],
    ['unverified TOTP', [{ factor_type: 'totp', status: 'unverified' }]],
    ['verified phone only', [{ factor_type: 'phone', status: 'verified' }]],
  ])('does not infer a current TOTP from %s or aal2', async (_label, factors) => {
    const token = accessToken();
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(
        token,
        Response.json({
          id: authUserId,
          email: 'operator@example.test',
          email_confirmed_at: '2026-09-13T12:00:00.000Z',
          ...(factors === undefined ? {} : { factors }),
          user_metadata: { operator: true, hasVerifiedTotp: true },
        }),
      ),
    });
    await expect(verifier.verify(token)).resolves.toMatchObject({ hasVerifiedTotp: false });
  });

  it('fails closed when the provider factor list is malformed', async () => {
    const token = accessToken();
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(token, Response.json({ id: authUserId, factors: 'verified' })),
    });
    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it('does not treat non-TOTP AAL2 as an authenticator challenge', async () => {
    const token = accessToken({
      amr: [
        { method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 },
        { method: 'mfa/phone', timestamp: Math.floor(Date.now() / 1000) - 30 },
      ],
    });
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(
        token,
        Response.json({ id: authUserId, factors: [{ factor_type: 'totp', status: 'verified' }] }),
      ),
    });
    await expect(verifier.verify(token)).resolves.toMatchObject({
      hasVerifiedTotp: true,
      totpAuthenticated: false,
    });
  });

  it('preserves the recovery restriction across later authentication-method entries', async () => {
    const token = accessToken({
      amr: [
        { method: 'token_refresh', timestamp: Math.floor(Date.now() / 1000) },
        { method: 'recovery', timestamp: Math.floor(Date.now() / 1000) - 60 },
      ],
    });
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(
        token,
        Response.json({
          id: authUserId,
          email: 'player@example.test',
          email_confirmed_at: '2026-09-13T12:00:00.000Z',
        }),
      ),
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({ accessMode: 'recovery' });
  });

  it('accepts RFC string AMR while preserving its recovery restriction', async () => {
    const token = accessToken({ amr: ['token_refresh', 'recovery'] });
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(
        token,
        Response.json({
          id: authUserId,
          email: 'player@example.test',
          email_confirmed_at: '2026-09-13T12:00:00.000Z',
        }),
      ),
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({ accessMode: 'recovery' });
  });

  it('treats provider rejection as unauthenticated', async () => {
    const token = accessToken();
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(token, new Response(null, { status: 401 })),
    });

    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it.each([
    ['current ban', { banned_until: new Date(Date.now() + 60_000).toISOString() }, null],
    ['expired ban', { banned_until: new Date(Date.now() - 60_000).toISOString() }, 'standard'],
    ['deleted user', { deleted_at: '2026-09-01T00:00:00Z' }, null],
    ['anonymous user', { is_anonymous: true }, null],
    ['invalid ban date', { banned_until: 'not-a-date' }, null],
    ['invalid deletion status', { deleted_at: false }, null],
    ['invalid anonymous status', { is_anonymous: 'false' }, null],
  ])(
    'checks provider current status for an already-issued token: %s',
    async (_label, status, expectedMode) => {
      const token = accessToken();
      const verifier = createSupabaseAuthVerifier({
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'sb_publishable_example',
        fetch: providerFetch(
          token,
          Response.json({
            id: authUserId,
            email: 'player@example.test',
            email_confirmed_at: '2026-09-13T12:00:00.000Z',
            banned_until: null,
            deleted_at: null,
            is_anonymous: false,
            ...status,
          }),
        ),
      });
      const identity = await verifier.verify(token);
      expect(identity?.accessMode ?? null).toBe(expectedMode);
    },
  );

  it.each([
    ['expired token', { exp: Math.floor(Date.now() / 1000) - 1 }],
    ['mismatched subject', { sub: '33333333-3333-4333-8333-333333333333' }],
    ['unsupported assurance', { aal: 'aal3' }],
  ])('rejects a provider response paired with an %s', async (_label, overrides) => {
    const token = accessToken(overrides);
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(
        token,
        Response.json({
          id: authUserId,
          email: 'player@example.test',
          email_confirmed_at: '2026-09-13T12:00:00.000Z',
        }),
      ),
    });

    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it('rejects malformed provider user data and malformed JWT payloads', async () => {
    const malformedToken = 'not-a-jwt';
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(malformedToken, Response.json({ id: authUserId })),
    });

    await expect(verifier.verify(malformedToken)).resolves.toBeNull();
  });

  it.each([
    ['missing AMR', undefined],
    ['empty AMR', []],
    ['non-array AMR', 'recovery'],
    ['mixed AMR formats', ['password', { method: 'recovery', timestamp: 1_789_318_800 }]],
    ['missing method', [{ timestamp: 1_789_318_800 }]],
    ['empty method', [{ method: '', timestamp: 1_789_318_800 }]],
    ['missing timestamp', [{ method: 'recovery' }]],
    ['non-integer timestamp', [{ method: 'recovery', timestamp: 1.5 }]],
  ])('fails closed for %s claims', async (_label, amr) => {
    const token = accessToken({ amr });
    const verifier = createSupabaseAuthVerifier({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_example',
      fetch: providerFetch(
        token,
        Response.json({
          id: authUserId,
          email: 'player@example.test',
          email_confirmed_at: '2026-09-13T12:00:00.000Z',
        }),
      ),
    });

    await expect(verifier.verify(token)).resolves.toBeNull();
  });
});
