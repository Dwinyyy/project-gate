import 'dotenv/config';
import { Pool } from 'pg';

if (process.env.NODE_ENV === 'production') throw new Error('Local seed is forbidden in production');
const ownerUrl = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
const runtimeUrl = new URL(process.env.DATABASE_URL ?? '');
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(ownerUrl.hostname) ||
  ownerUrl.host !== runtimeUrl.host ||
  ownerUrl.pathname !== runtimeUrl.pathname ||
  runtimeUrl.username !== 'hunter_runtime' ||
  !runtimeUrl.password
)
  throw new Error('Seed requires matching local owner/runtime connections');
const pool = new Pool({ connectionString: ownerUrl.toString() });
try {
  const statement = await pool.query<{ sql: string }>(
    "SELECT format('ALTER ROLE hunter_runtime LOGIN PASSWORD %L', $1::text) AS sql",
    [decodeURIComponent(runtimeUrl.password)],
  );
  await pool.query(statement.rows[0]!.sql);
  console.log('Local runtime login initialized. No gameplay data or enabled features seeded.');
} finally {
  await pool.end();
}
