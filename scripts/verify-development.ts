import 'dotenv/config';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase, createOperatorAccessStore, type Database } from '@hunter-world/database';
import {
  createSupabaseAuthVerifier,
  createWorker,
  databaseTls,
  parseEnvironment,
} from '@hunter-world/server';
import { buildApp } from '../apps/api/src/app.js';

interface AuthProviderVerificationOptions {
  supabaseUrl: string;
  publishableKey: string;
  fetchAuth?: typeof globalThis.fetch;
}

export async function verifyAuthProviderConfiguration(
  options: AuthProviderVerificationOptions,
): Promise<void> {
  const fetchAuth = options.fetchAuth ?? globalThis.fetch;
  const headers = { Accept: 'application/json', apikey: options.publishableKey };
  const health = await fetchAuth(new URL('/auth/v1/health', options.supabaseUrl), {
    headers,
    signal: AbortSignal.timeout(8_000),
  });
  if (!health.ok) throw new Error('Managed Auth health check failed');

  const settingsResponse = await fetchAuth(new URL('/auth/v1/settings', options.supabaseUrl), {
    headers,
    signal: AbortSignal.timeout(8_000),
  });
  if (!settingsResponse.ok) throw new Error('Managed Auth settings check failed');
  const value: unknown = await settingsResponse.json();
  if (!value || typeof value !== 'object') {
    throw new Error('Managed Auth settings returned an unsupported response');
  }
  const settings = value as Record<string, unknown>;
  const external =
    settings.external && typeof settings.external === 'object'
      ? (settings.external as Record<string, unknown>)
      : null;
  if (
    settings.disable_signup !== false ||
    settings.mailer_autoconfirm !== false ||
    external?.email !== true ||
    external.phone !== false
  ) {
    throw new Error('Managed Auth settings do not match the required account policy');
  }
}

function fabricatedAccessToken(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256', typ: 'JWT' })}.${encode({
    sub: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    exp: Math.floor(Date.now() / 1000) + 300,
    aal: 'aal1',
    session_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  })}.invalid-signature`;
}

async function verifyApiAuthBoundaries(
  database: Database,
  publicConfig: { supabaseUrl: string; supabasePublishableKey: string },
): Promise<void> {
  const app = buildApp({
    database,
    auth: {
      publicConfig,
      verifier: createSupabaseAuthVerifier({
        supabaseUrl: publicConfig.supabaseUrl,
        publishableKey: publicConfig.supabasePublishableKey,
      }),
    },
    operators: createOperatorAccessStore(database.pool),
  });
  try {
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    if (ready.statusCode !== 200) throw new Error('API readiness failed');

    const config = await app.inject({ method: 'GET', url: '/v1/auth/config' });
    if (
      config.statusCode !== 200 ||
      JSON.stringify(config.json()) !== JSON.stringify(publicConfig)
    ) {
      throw new Error('API public Auth configuration check failed');
    }

    const token = fabricatedAccessToken();
    for (const url of ['/v1/auth/session', '/v1/operator/session']) {
      const rejected = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${token}` },
      });
      if (rejected.statusCode !== 401) throw new Error('Fabricated Auth token was not rejected');
    }
  } finally {
    await app.close();
  }
}

async function verify() {
  const environment = parseEnvironment(process.env);
  if (
    environment.nodeEnv !== 'development' ||
    !environment.databaseUrl ||
    !environment.supabaseUrl ||
    !environment.supabasePublishableKey
  ) {
    throw new Error('Managed development database and Auth configuration required');
  }
  const database = createDatabase({
    connectionString: environment.databaseUrl,
    ssl: await databaseTls(environment),
  });
  const worker = createWorker(database);
  try {
    await verifyAuthProviderConfiguration({
      supabaseUrl: environment.supabaseUrl,
      publishableKey: environment.supabasePublishableKey,
    });
    await verifyApiAuthBoundaries(database, {
      supabaseUrl: environment.supabaseUrl,
      supabasePublishableKey: environment.supabasePublishableKey,
    });
    await worker.start();
    console.log(
      'Managed readiness, worker startup, public Auth configuration, provider policy, and fabricated-token rejection passed.',
    );
  } finally {
    await worker.stop();
    await database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await verify();
  } catch {
    console.error('Development verification failed. Credential values are not logged.');
    process.exitCode = 1;
  }
}
