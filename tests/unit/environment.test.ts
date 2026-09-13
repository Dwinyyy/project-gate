import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../packages/server/src/environment.js';

describe('server environment', () => {
  it('defaults to a loopback foundation without claiming database availability', () => {
    const env = parseEnvironment({});
    expect(env).toMatchObject({ nodeEnv: 'development', host: '127.0.0.1', port: 3001 });
    expect(env.databaseUrl).toBeUndefined();
  });
  it.each(['0', '65536', '3001garbage', '-1', 'NaN'])('rejects invalid port %s', (port) => {
    expect(() => parseEnvironment({ PORT: port })).toThrow(/PORT/);
  });
  it('refuses production without an authoritative database', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });
  it('refuses production database connections without TLS', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://x:y@db/game',
        DATABASE_SSL: 'false',
      }),
    ).toThrow(/TLS/);
  });
  it('rejects simulator override even in a configured production deployment', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://x:y@db/game',
        DATABASE_SSL: 'true',
        ENABLE_LOCATION_SIMULATOR: 'true',
      }),
    ).toThrow(/simulator/i);
  });
  it('does not copy migration credentials into runtime configuration', () => {
    expect(parseEnvironment({ MIGRATION_DATABASE_URL: 'private-owner-value' })).not.toHaveProperty(
      'migrationDatabaseUrl',
    );
  });
  it('requires the public Supabase URL and publishable key together', () => {
    expect(() =>
      parseEnvironment({ SUPABASE_URL: 'https://project.supabase.co' }),
    ).toThrow('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together');
    expect(() =>
      parseEnvironment({ SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' }),
    ).toThrow('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together');
  });
  it('accepts a complete public Supabase Auth configuration', () => {
    expect(
      parseEnvironment({
        SUPABASE_URL: 'https://project.supabase.co/',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      }),
    ).toMatchObject({
      supabaseUrl: 'https://project.supabase.co',
      supabasePublishableKey: 'sb_publishable_example',
    });
  });
  it('requires HTTPS for Supabase Auth outside loopback development', () => {
    expect(() =>
      parseEnvironment({
        SUPABASE_URL: 'http://project.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      }),
    ).toThrow('SUPABASE_URL must use HTTPS unless it targets loopback development');
  });
  it('requires Supabase Auth in production without accepting a service-role substitute', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://x:y@db/game',
        DATABASE_SSL: 'true',
        SUPABASE_SERVICE_ROLE_KEY: 'server-secret',
      }),
    ).toThrow('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required in production');
  });
});
