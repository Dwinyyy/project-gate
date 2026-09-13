import { describe, expect, it } from 'vitest';
import { developmentOwnerUrl } from '../../scripts/lib/development-setup.js';

describe('managed development setup boundary', () => {
  it('encodes the owner password without allowing it to change the target', () => {
    const url = new URL(
      developmentOwnerUrl({ NODE_ENV: 'development', SUPABASE_DATABASE_PASSWORD: 'a@b:/?#x' }),
    );
    expect(url.hostname).toBe('db.zsejplglpfcmcikcydgb.supabase.co');
    expect(decodeURIComponent(url.password)).toBe('a@b:/?#x');
    expect(url.username).toBe('postgres');
    expect(url.pathname).toBe('/postgres');
  });
  it('refuses production execution', () => {
    expect(() =>
      developmentOwnerUrl({ NODE_ENV: 'production', SUPABASE_DATABASE_PASSWORD: 'value' }),
    ).toThrow('development');
  });
  it('does not invent missing credentials', () => {
    expect(() => developmentOwnerUrl({ NODE_ENV: 'development' })).toThrow(
      'SUPABASE_DATABASE_PASSWORD',
    );
  });
});
