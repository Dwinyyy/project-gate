import 'dotenv/config';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { createDatabase } from '@hunter-world/database';
import { migrate } from './migrate.js';
import { developmentOwnerUrl } from './lib/development-setup.js';

async function bootstrap() {
  const connectionString = developmentOwnerUrl(process.env);
  const caPath = process.env.DATABASE_SSL_CA_PATH;
  const ssl = {
    rejectUnauthorized: true,
    ...(caPath ? { ca: await readFile(caPath, 'utf8') } : {}),
  };
  if (process.env.DATABASE_URL) {
    throw new Error(
      'Runtime connection already configured; setup will not rotate it automatically',
    );
  }
  const owner = new Pool({ connectionString, ssl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const role = await owner.query<{ current_user: string }>('SELECT current_user');
    if (role.rows[0]?.current_user !== 'postgres') throw new Error('Unexpected bootstrap role');
    await migrate(connectionString, ssl);
    const runtime = new URL(connectionString);
    runtime.username = 'hunter_runtime';
    runtime.password = randomBytes(32).toString('hex');
    // Persist before changing the login, so an interrupted setup cannot lose its new credential.
    const path = '.env';
    let env = await readFile(path, 'utf8');
    if (!/^DATABASE_URL=$/m.test(env)) throw new Error('Expected empty DATABASE_URL in .env');
    env = env.replace(/^DATABASE_URL=$/m, `DATABASE_URL=${runtime.toString()}`);
    await writeFile('.env.setup.tmp', env, { mode: 0o600 });
    await rename('.env.setup.tmp', path);
    const command = await owner.query<{ sql: string }>(
      "SELECT format('ALTER ROLE hunter_runtime LOGIN PASSWORD %L', $1::text) AS sql",
      [runtime.password],
    );
    await owner.query(command.rows[0]!.sql);
    const database = createDatabase({ connectionString: runtime.toString(), ssl });
    try {
      if (!(await database.ready())) throw new Error('Restricted runtime verification failed');
    } finally {
      await database.close();
    }
    // The API does not require the database-owner secret. Remove the one-time setup value.
    const latest = await readFile(path, 'utf8');
    await writeFile(path, latest.replace(/^SUPABASE_DATABASE_PASSWORD=.*(?:\r?\n|$)/m, ''), {
      mode: 0o600,
    });
    console.log(
      'Managed development runtime verified. Owner password removed from local configuration.',
    );
  } finally {
    await owner.end();
  }
}

bootstrap().catch((error: unknown) => {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'SETUP_INCOMPLETE';
  console.error(
    `Development setup failed (${code}). Check local credentials, certificate and connectivity. Values are not logged.`,
  );
  process.exitCode = 1;
});
