import { afterAll, beforeAll, expect, test } from 'vitest';
import { Pool } from 'pg';
import { migrate } from '../../scripts/migrate.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile, fork, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  createDatabase,
  findActiveOperator,
  getFeatureControls,
  withTransaction,
} from '../../packages/database/src/index.js';
import {
  consumeDemoEvent,
  createJobQueue,
  dispatchOutbox,
  recordDemoRequested,
} from '../../packages/server/src/jobs/index.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error('TEST_DATABASE_URL is required; integration tests never skip.');
const target = new URL(connectionString);
if (
  process.env.NODE_ENV === 'production' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  !/^hunter_test(?:_[a-z0-9_]+)?$/.test(target.pathname.slice(1))
) {
  throw new Error('Integration tests require a local disposable hunter_test database.');
}
const owner = new Pool({ connectionString });
const runtimeUrl = new URL(connectionString);
runtimeUrl.username = 'hunter_runtime';
runtimeUrl.password = randomBytes(24).toString('hex');
const database = createDatabase({ connectionString: runtimeUrl.toString() });

test('queue helper functions have a pinned trusted search path', async () => {
  const functions = await owner.query<{ proname: string; proconfig: string[] | null }>(
    "SELECT proname, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ops'",
  );
  expect(functions.rows.length).toBeGreaterThanOrEqual(5);
  for (const fn of functions.rows)
    expect(fn.proconfig, fn.proname).toContain('search_path=pg_catalog, ops');
});
beforeAll(async () => {
  await owner.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$",
  );
  await migrate(connectionString);
  await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MIGRATION_DATABASE_URL: connectionString,
      DATABASE_URL: runtimeUrl.toString(),
    },
  });
});
afterAll(async () => {
  await database.close();
  await owner.end();
});

test('the canonical migration creates a private operational schema', async () => {
  const result = await owner.query<{ schema: string | null }>(
    "select to_regnamespace('ops')::text as schema",
  );
  expect(result.rows[0]?.schema).toBe('ops');
});

test('runtime readiness requires the private schema and cannot use migration-owner authority', async () => {
  await expect(database.ready()).resolves.toBe(true);
  const privileged = createDatabase({ connectionString });
  try {
    await expect(privileged.ready()).resolves.toBe(false);
  } finally {
    await privileged.close();
  }
  await expect(getFeatureControls(database.pool)).resolves.toEqual({
    registration: false,
    characters: false,
    encounters: false,
    commerce: false,
  });
  await expect(
    database.pool.query('CREATE TABLE ops.forbidden_table(id integer)'),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    database.pool.query('UPDATE ops.feature_controls SET commerce = true'),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    database.pool.query("UPDATE ops.schema_migrations SET sha256 = repeat('0', 64)"),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(migrate(runtimeUrl.toString())).rejects.toThrow('Runtime credentials');
});

test('a rolled-back domain transaction leaves no event for the worker', async () => {
  const eventKey = randomUUID();
  await expect(
    withTransaction(database.pool, async (client) => {
      await recordDemoRequested(client, { eventKey, label: 'rolled back' });
      throw new Error('deliberate domain failure');
    }),
  ).rejects.toThrow('deliberate domain failure');
  const events = await owner.query('SELECT id FROM ops.outbox_events WHERE event_key = $1', [
    eventKey,
  ]);
  expect(events.rowCount).toBe(0);
});

test('repeated event keys preserve their terms and concurrent consumers create one effect', async () => {
  const eventKey = randomUUID();
  const eventId = await withTransaction(database.pool, (client) =>
    recordDemoRequested(client, { eventKey, label: 'one effect' }),
  );
  await expect(
    withTransaction(database.pool, (client) =>
      recordDemoRequested(client, { eventKey, label: 'one effect' }),
    ),
  ).resolves.toBe(eventId);
  await expect(
    withTransaction(database.pool, (client) =>
      recordDemoRequested(client, { eventKey, label: 'changed terms' }),
    ),
  ).rejects.toThrow('different terms');
  const results = await Promise.all(
    Array.from({ length: 8 }, () => consumeDemoEvent(database.pool, eventId)),
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(
    (await owner.query('SELECT * FROM ops.demo_effects WHERE event_id = $1', [eventId])).rowCount,
  ).toBe(1);
  expect(
    (await owner.query('SELECT * FROM ops.consumer_receipts WHERE event_id = $1', [eventId]))
      .rowCount,
  ).toBe(1);
});

test('a failure after the consumer receipt rolls back both receipt and effect', async () => {
  const eventKey = randomUUID();
  const eventId = await withTransaction(database.pool, (client) =>
    recordDemoRequested(client, { eventKey, label: 'retry after failure' }),
  );
  await owner.query(`CREATE FUNCTION ops.reject_demo_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected storage failure'; END $$;
    CREATE TRIGGER reject_demo_effect BEFORE INSERT ON ops.demo_effects FOR EACH ROW EXECUTE FUNCTION ops.reject_demo_effect()`);
  try {
    await expect(consumeDemoEvent(database.pool, eventId)).rejects.toThrow(
      'injected storage failure',
    );
    expect(
      (await owner.query('SELECT * FROM ops.consumer_receipts WHERE event_id = $1', [eventId]))
        .rowCount,
    ).toBe(0);
    expect(
      (await owner.query('SELECT * FROM ops.demo_effects WHERE event_id = $1', [eventId])).rowCount,
    ).toBe(0);
  } finally {
    await owner.query(
      'DROP TRIGGER reject_demo_effect ON ops.demo_effects; DROP FUNCTION ops.reject_demo_effect()',
    );
  }
  await expect(consumeDemoEvent(database.pool, eventId)).resolves.toBe(true);
});

test('enqueue and published marker share a transaction when dispatch is retried', async () => {
  const eventId = await withTransaction(database.pool, (client) =>
    recordDemoRequested(client, { eventKey: randomUUID(), label: 'dispatch retry' }),
  );
  const boss = createJobQueue(database.pool);
  boss.on('error', () => undefined);
  await boss.start();
  await owner.query(`CREATE FUNCTION ops.reject_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected publication failure'; END $$;
    CREATE TRIGGER reject_publication BEFORE UPDATE ON ops.outbox_events FOR EACH ROW EXECUTE FUNCTION ops.reject_publication()`);
  try {
    await expect(dispatchOutbox(database.pool, boss)).rejects.toThrow(
      'injected publication failure',
    );
    expect((await owner.query('SELECT id FROM ops.job WHERE id = $1', [eventId])).rowCount).toBe(0);
    expect(
      (await owner.query('SELECT published_at FROM ops.outbox_events WHERE id = $1', [eventId]))
        .rows[0]?.published_at,
    ).toBeNull();
  } finally {
    await owner.query(
      'DROP TRIGGER reject_publication ON ops.outbox_events; DROP FUNCTION ops.reject_publication()',
    );
  }
  try {
    await dispatchOutbox(database.pool, boss);
    await dispatchOutbox(database.pool, boss);
    expect((await owner.query('SELECT id FROM ops.job WHERE id = $1', [eventId])).rowCount).toBe(1);
  } finally {
    await boss.stop({ graceful: true, timeout: 5_000 });
  }
});

test('a killed worker after effect commit is retried by a fresh process without a duplicate', async () => {
  // Isolate this process-restart proof from already queued rows in earlier cases.
  await owner.query('DELETE FROM ops.job');
  await owner.query('UPDATE ops.outbox_events SET published_at = now() WHERE published_at IS NULL');
  await owner.query("UPDATE ops.queue SET expire_seconds = 1 WHERE name = 'foundation-demo'");
  const eventId = await withTransaction(database.pool, (client) =>
    recordDemoRequested(client, { eventKey: randomUUID(), label: 'survives process death' }),
  );
  const boss = createJobQueue(database.pool);
  boss.on('error', () => undefined);
  await boss.start();
  await dispatchOutbox(database.pool, boss);
  await boss.stop({ graceful: true, timeout: 5_000 });
  let child: ChildProcess | undefined;
  try {
    child = workerProcess('commit-without-ack');
    await message(child, 'effect-committed');
    await kill(child);
    child = undefined;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_100));
    child = workerProcess('normal');
    await message(child, 'ready');
    await expect
      .poll(
        async () =>
          (await owner.query('SELECT state FROM ops.job WHERE id = $1', [eventId])).rows[0]?.state,
        { timeout: 15_000 },
      )
      .toBe('completed');
    expect(
      (await owner.query('SELECT * FROM ops.demo_effects WHERE event_id = $1', [eventId])).rowCount,
    ).toBe(1);
    expect(
      (await owner.query('SELECT * FROM ops.consumer_receipts WHERE event_id = $1', [eventId]))
        .rowCount,
    ).toBe(1);
    expect(
      (await owner.query('SELECT retry_count FROM ops.job WHERE id = $1', [eventId])).rows[0]
        ?.retry_count,
    ).toBeGreaterThanOrEqual(1);
  } finally {
    if (child) await kill(child);
    await owner.query("UPDATE ops.queue SET expire_seconds = 60 WHERE name = 'foundation-demo'");
  }
}, 40_000);

function workerProcess(mode: string): ChildProcess {
  return fork(fileURLToPath(new URL('./worker-process.ts', import.meta.url)), [], {
    execArgv: ['--import', 'tsx'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, DATABASE_URL: runtimeUrl.toString(), WORKER_TEST_MODE: mode },
  });
}
async function message(child: ChildProcess, expected: string): Promise<void> {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => reject(new Error(`Worker did not send ${expected}`)), 15_000);
    child.on('message', (value: unknown) => {
      if (value === expected) {
        clearTimeout(timer);
        resolveMessage();
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Worker exited before ${expected}: ${code}`));
    });
  });
}
async function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolveExit) => {
    child.once('exit', () => resolveExit());
    child.kill('SIGKILL');
  });
}

test('a retry of the canonical migration history changes nothing', async () => {
  await expect(migrate(connectionString)).resolves.toEqual([]);
});

test('features are persisted disabled and public API roles cannot see private tables', async () => {
  const controls = await owner.query(
    'SELECT registration, characters, encounters, commerce FROM ops.feature_controls',
  );
  expect(controls.rows).toEqual([
    { registration: false, characters: false, encounters: false, commerce: false },
  ]);
  for (const role of ['anon', 'authenticated']) {
    const access = await owner.query<{ schema: boolean; table: boolean }>(
      "SELECT has_schema_privilege($1, 'ops', 'USAGE') AS schema, has_table_privilege($1, 'ops.outbox_events', 'SELECT') AS table",
      [role],
    );
    expect(access.rows).toEqual([{ schema: false, table: false }]);
  }
});

test('operator access is private, current, and read-only to the runtime', async () => {
  const authUserId = randomUUID();
  await owner.query(
    "INSERT INTO ops.operator_accounts(auth_user_id, status) VALUES ($1, 'active')",
    [authUserId],
  );
  await owner.query(
    "INSERT INTO ops.operator_permissions(auth_user_id, permission) VALUES ($1, 'feature_controls:read')",
    [authUserId],
  );
  try {
    await expect(findActiveOperator(database.pool, authUserId)).resolves.toEqual({
      authUserId,
      permissions: ['feature_controls:read'],
    });
    await owner.query(
      "UPDATE ops.operator_accounts SET status = 'suspended', updated_at = now() WHERE auth_user_id = $1",
      [authUserId],
    );
    await expect(findActiveOperator(database.pool, authUserId)).resolves.toBeNull();
    await expect(
      database.pool.query(
        "INSERT INTO ops.operator_accounts(auth_user_id, status) VALUES ($1, 'active')",
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    for (const role of ['anon', 'authenticated']) {
      const access = await owner.query<{ accounts: boolean; permissions: boolean }>(
        "SELECT has_table_privilege($1, 'ops.operator_accounts', 'SELECT') AS accounts, has_table_privilege($1, 'ops.operator_permissions', 'SELECT') AS permissions",
        [role],
      );
      expect(access.rows).toEqual([{ accounts: false, permissions: false }]);
    }
  } finally {
    await owner.query('DELETE FROM ops.operator_accounts WHERE auth_user_id = $1', [authUserId]);
  }
});
