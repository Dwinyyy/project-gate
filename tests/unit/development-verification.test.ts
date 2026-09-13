import { describe, expect, it, vi } from 'vitest';
import { verifyAuthProviderConfiguration } from '../../scripts/verify-development.js';

describe('managed development verification', () => {
  it('checks Auth health and confirmation-safe public settings without account mutations', async () => {
    const fetchAuth = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/health') {
        return new Response(JSON.stringify({ version: 'fixture' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          disable_signup: false,
          mailer_autoconfirm: false,
          external: { email: true, phone: false },
        }),
        { status: 200 },
      );
    });

    await expect(
      verifyAuthProviderConfiguration({
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'sb_publishable_fixture',
        fetchAuth,
      }),
    ).resolves.toBeUndefined();
    expect(fetchAuth).toHaveBeenCalledTimes(2);
    expect(fetchAuth.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/auth/v1/health',
      '/auth/v1/settings',
    ]);
  });

  it('fails when the managed project would auto-confirm email', async () => {
    const fetchAuth = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      return new Response(
        JSON.stringify(
          path === '/auth/v1/health'
            ? { version: 'fixture' }
            : {
                disable_signup: false,
                mailer_autoconfirm: true,
                external: { email: true, phone: false },
              },
        ),
        { status: 200 },
      );
    });

    await expect(
      verifyAuthProviderConfiguration({
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'sb_publishable_fixture',
        fetchAuth,
      }),
    ).rejects.toThrow('Managed Auth settings do not match the required account policy');
  });
});
