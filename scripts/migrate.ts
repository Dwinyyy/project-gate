import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool, type PoolConfig } from 'pg';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migrationLock = 'hunter-world:canonical-sql-migrations:v1';

/** Only the explicitly supplied migration-owner connection can apply DDL. */
export async function migrate(
  connectionString: string,
  ssl?: PoolConfig['ssl'],
): Promise<string[]> {
  if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required.');
  const pool = new Pool({
    connectionString,
    ...(ssl !== undefined ? { ssl } : {}),
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SET lock_timeout = '15s'");
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [migrationLock]);
    const role = await client.query<{ runtime: boolean }>(
      "SELECT current_user = 'hunter_runtime' AS runtime",
    );
    if (role.rows[0]?.runtime) throw new Error('Runtime credentials cannot run migrations.');
    // Bootstrap only migration metadata. Application/queue DDL lives solely in SQL files.
    await client.query('CREATE SCHEMA IF NOT EXISTS ops');
    await client.query('REVOKE ALL ON SCHEMA ops FROM PUBLIC');
    await client.query(`CREATE TABLE IF NOT EXISTS ops.schema_migrations (
      name text PRIMARY KEY,
      sha256 text NOT NULL CHECK (length(sha256) = 64),
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by text NOT NULL DEFAULT current_user
    )`);
    const files = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    const history = await client.query<{ name: string; sha256: string }>(
      'SELECT name, sha256 FROM ops.schema_migrations ORDER BY name',
    );
    const recorded = new Map(history.rows.map((row) => [row.name, row.sha256]));
    for (const name of recorded.keys()) {
      if (!files.includes(name))
        throw new Error(`Previously applied migration is missing: ${name}`);
    }
    // Validate the whole history before applying any pending file.
    const migrations = await Promise.all(
      files.map(async (name) => {
        const sql = await readFile(new URL(name, migrationDirectory), 'utf8');
        const checksum = createHash('sha256').update(sql).digest('hex');
        if (recorded.has(name) && recorded.get(name) !== checksum) {
          throw new Error(`Migration checksum mismatch: ${name}`);
        }
        return { name, sql, checksum };
      }),
    );
    for (const migration of migrations) {
      if (recorded.has(migration.name)) continue;
      const latestApplied = history.rows.at(-1)?.name;
      if (latestApplied && migration.name < latestApplied) {
        throw new Error(`Out-of-order migration: ${migration.name}`);
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO ops.schema_migrations(name, sha256) VALUES ($1, $2)', [
          migration.name,
          migration.checksum,
        ]);
        await client.query('COMMIT');
        applied.push(migration.name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    await client
      .query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [migrationLock])
      .catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString)
    throw new Error('MIGRATION_DATABASE_URL is required; DATABASE_URL is never used.');
  const applied = await migrate(connectionString);
  console.log(`Canonical migrations complete: ${applied.length} applied.`);
}
