import { afterAll, beforeAll, expect, test } from 'vitest';
import { Pool } from 'pg';
import { migrate } from '../../scripts/migrate.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile, fork, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { prepareOperatorStatusChange } from '../../scripts/lib/operator-provisioning.js';
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
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$",
  );
  // Minimal provider-owned identity fixture; real Supabase journeys are verified separately.
  await owner.query(`CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text,
      email_confirmed_at timestamptz,
      banned_until timestamptz,
      deleted_at timestamptz,
      is_anonymous boolean NOT NULL DEFAULT false
    );
    CREATE TABLE auth.mfa_factors (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id),
      factor_type text NOT NULL,
      status text NOT NULL
    )`);
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

test('game identities use private tables and safe independent lifecycle defaults', async () => {
  const account = await owner.query<{ id: string }>(
    'INSERT INTO game.accounts DEFAULT VALUES RETURNING id',
  );
  const accountId = account.rows[0]!.id;
  try {
    const character = await owner.query<{
      id: string;
      life_state: string;
      awakening_state: string;
      presence_state: string;
      profile_visibility: string;
    }>('INSERT INTO game.characters(account_id, display_alias) VALUES ($1, $2) RETURNING *', [
      accountId,
      'First civilian',
    ]);
    expect(character.rows[0]).toMatchObject({
      life_state: 'alive',
      awakening_state: 'unawakened',
      presence_state: 'sheltered',
      profile_visibility: 'private',
    });
    expect(character.rows[0]?.id).toBeTruthy();
    expect(
      (await owner.query("SELECT to_regnamespace('game')::text AS schema")).rows[0]?.schema,
    ).toBe('game');
    for (const role of ['anon', 'authenticated']) {
      const access = await owner.query(
        "SELECT has_schema_privilege($1, 'game', 'USAGE') AS schema, has_table_privilege($1, 'game.accounts', 'SELECT') AS accounts, has_table_privilege($1, 'game.characters', 'SELECT') AS characters",
        [role],
      );
      expect(access.rows).toEqual([{ schema: false, accounts: false, characters: false }]);
    }
  } finally {
    await owner.query('DELETE FROM game.characters WHERE account_id = $1', [accountId]);
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
});

test('a living or incapacitated character occupies the account slot while dead history remains', async () => {
  const accountId = (
    await owner.query<{ id: string }>('INSERT INTO game.accounts DEFAULT VALUES RETURNING id')
  ).rows[0]!.id;
  try {
    const first = (
      await owner.query<{ id: string }>(
        "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'First') RETURNING id",
        [accountId],
      )
    ).rows[0]!.id;
    await expect(
      owner.query("INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Second')", [
        accountId,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    await owner.query("UPDATE game.characters SET life_state = 'incapacitated' WHERE id = $1", [
      first,
    ]);
    await expect(
      owner.query("INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Second')", [
        accountId,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    await owner.query("UPDATE game.characters SET life_state = 'dead' WHERE id = $1", [first]);
    await owner.query(
      "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Second')",
      [accountId],
    );
    expect(
      (
        await owner.query(
          'SELECT life_state FROM game.characters WHERE account_id = $1 ORDER BY created_at, id',
          [accountId],
        )
      ).rows
        .map((row) => row.life_state)
        .sort(),
    ).toEqual(['alive', 'dead']);
  } finally {
    await owner.query('DELETE FROM game.characters WHERE account_id = $1', [accountId]);
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
});

test('invalid character values and missing parent accounts fail at the database boundary', async () => {
  const accountId = (
    await owner.query<{ id: string }>('INSERT INTO game.accounts DEFAULT VALUES RETURNING id')
  ).rows[0]!.id;
  try {
    for (const column of [
      'life_state',
      'awakening_state',
      'presence_state',
      'profile_visibility',
    ]) {
      await expect(
        owner.query(
          `INSERT INTO game.characters(account_id, display_alias, ${column}) VALUES ($1, 'Invalid', 'invalid')`,
          [accountId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }
    for (const alias of ['', ' ', '\t', '\n', ' \t\n ', 'x'.repeat(41), 'é'.repeat(41)]) {
      await expect(
        owner.query('INSERT INTO game.characters(account_id, display_alias) VALUES ($1, $2)', [
          accountId,
          alias,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    }
    await expect(
      owner.query("INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Orphan')", [
        randomUUID(),
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      owner.query('INSERT INTO game.accounts(revision) VALUES (-1)'),
    ).rejects.toMatchObject({ code: '23514' });
  } finally {
    await owner.query('DELETE FROM game.characters WHERE account_id = $1', [accountId]);
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
});

test('Auth deletion detaches only the login and cannot transfer history by email', async () => {
  const authId = randomUUID();
  const replacementId = randomUUID();
  const email = `${authId}@example.test`;
  await owner.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [authId, email]);
  const linkedId = (
    await owner.query<{ id: string }>(
      'INSERT INTO game.accounts(auth_user_id) VALUES ($1) RETURNING id',
      [authId],
    )
  ).rows[0]!.id;
  const detachedId = (
    await owner.query<{ id: string }>('INSERT INTO game.accounts DEFAULT VALUES RETURNING id')
  ).rows[0]!.id;
  const characterId = (
    await owner.query<{ id: string }>(
      "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'History') RETURNING id",
      [linkedId],
    )
  ).rows[0]!.id;
  try {
    await expect(
      owner.query('INSERT INTO game.accounts(auth_user_id) VALUES ($1)', [authId]),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      owner.query('DELETE FROM game.accounts WHERE id = $1', [linkedId]),
    ).rejects.toMatchObject({ code: '23001' });
    await owner.query('DELETE FROM auth.users WHERE id = $1', [authId]);
    expect(
      (await owner.query('SELECT auth_user_id FROM game.accounts WHERE id = $1', [linkedId])).rows,
    ).toEqual([{ auth_user_id: null }]);
    expect(
      (await owner.query('SELECT id FROM game.characters WHERE account_id = $1', [linkedId])).rows,
    ).toEqual([{ id: characterId }]);
    await owner.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [replacementId, email]);
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [replacementId]))
        .rowCount,
    ).toBe(0);
  } finally {
    await owner.query('DELETE FROM game.characters WHERE account_id = $1', [linkedId]);
    await owner.query('DELETE FROM game.accounts WHERE id = ANY($1::uuid[])', [
      [linkedId, detachedId],
    ]);
    await owner.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [
      [authId, replacementId],
    ]);
  }
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

async function verifiedOperatorCandidate(withMfa = true): Promise<string> {
  const id = randomUUID();
  await owner.query(
    'INSERT INTO auth.users(id, email, email_confirmed_at) VALUES ($1, $2, now())',
    [id, `${id}@example.test`],
  );
  if (withMfa) {
    await owner.query(
      "INSERT INTO auth.mfa_factors(id, user_id, factor_type, status) VALUES ($1, $2, 'totp', 'verified')",
      [randomUUID(), id],
    );
  }
  return id;
}

function operatorRequest(authUserId: string, status: 'active' | 'suspended' = 'active') {
  return {
    requestId: randomUUID(),
    authUserId,
    status,
    requestedBy: 'integration-test-owner',
    reason: 'Designated operator access acceptance',
  };
}

test('owner assignment can precede TOTP without adding administrative permissions', async () => {
  const id = await verifiedOperatorCandidate(false);
  const sql = prepareOperatorStatusChange(operatorRequest(id));
  await owner.query(sql);
  await expect(findActiveOperator(database.pool, id)).resolves.toEqual({
    authUserId: id,
    permissions: [],
  });
  expect(
    (await owner.query('SELECT * FROM ops.operator_permissions WHERE auth_user_id = $1', [id]))
      .rowCount,
  ).toBe(0);
});

test('owner email assignment is attributable, retry-safe and does not undo suspension on replay', async () => {
  const id = await verifiedOperatorCandidate(false);
  const requestId = randomUUID();
  const args = [
    `  ${id.toUpperCase()}@EXAMPLE.TEST  `,
    'active',
    'project-owner',
    'Operator onboarding',
    requestId,
  ];
  const query = 'SELECT ops.set_operator_status_by_email($1, $2, $3, $4, $5) AS receipt';
  const assigned = await Promise.all([owner.query(query, args), owner.query(query, args)]);
  expect(assigned[0]?.rows[0]?.receipt).toMatchObject({
    request_id: requestId,
    auth_user_id: id,
    new_status: 'active',
    requested_by: 'project-owner',
    database_actor: 'postgres',
  });
  expect(assigned[1]?.rows[0]?.receipt).toEqual(assigned[0]?.rows[0]?.receipt);
  await owner.query(query, [
    `${id}@example.test`,
    'suspended',
    'project-owner',
    'End test access',
    randomUUID(),
  ]);
  await owner.query(query, args);
  await expect(findActiveOperator(database.pool, id)).resolves.toBeNull();
  await expect(
    owner.query(query, [args[0], 'active', 'project-owner', 'Changed reason', requestId]),
  ).rejects.toThrow('different terms');
  expect(
    (
      await owner.query('SELECT * FROM ops.operator_access_changes WHERE request_id = $1', [
        requestId,
      ])
    ).rowCount,
  ).toBe(1);
});

test('email management fails safely for missing, ambiguous and unverified identities', async () => {
  const query = 'SELECT ops.set_operator_status_by_email($1, $2, $3, $4)';
  const assign = (email: string) =>
    owner.query(query, [email, 'active', 'project-owner', 'Eligibility test']);
  await expect(assign('missing@example.test')).rejects.toThrow('exactly one account');
  await expect(assign('bad\naddress@example.test')).rejects.toThrow('Invalid operator email');
  const id = await verifiedOperatorCandidate(false);
  await owner.query('UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1', [id]);
  await expect(assign(`${id}@example.test`)).rejects.toThrow('verified eligible account');
  const duplicateId = await verifiedOperatorCandidate(false);
  await owner.query('UPDATE auth.users SET email = $1 WHERE id = $2', [
    `${id}@example.test`,
    duplicateId,
  ]);
  await expect(assign(`${id}@example.test`)).rejects.toThrow('exactly one account');
  expect(
    (
      await owner.query(
        'SELECT * FROM ops.operator_accounts WHERE auth_user_id = ANY($1::uuid[])',
        [[id, duplicateId]],
      )
    ).rowCount,
  ).toBe(0);
});

test('operator provisioning is attributable, idempotent and cannot replay a grant over suspension', async () => {
  const id = await verifiedOperatorCandidate();
  const request = operatorRequest(id);
  const sql = prepareOperatorStatusChange(request);
  await Promise.all([owner.query(sql), owner.query(sql), owner.query(sql)]);
  await expect(findActiveOperator(database.pool, id)).resolves.toEqual({
    authUserId: id,
    permissions: [],
  });
  const receipt = await owner.query(
    'SELECT * FROM ops.operator_access_changes WHERE request_id = $1',
    [request.requestId],
  );
  expect(receipt.rowCount).toBe(1);
  expect(receipt.rows[0]).toMatchObject({
    auth_user_id: id,
    previous_status: null,
    new_status: 'active',
    requested_by: request.requestedBy,
    reason: request.reason,
    database_actor: 'postgres',
  });
  await owner.query(prepareOperatorStatusChange(operatorRequest(id, 'suspended')));
  await owner.query(sql);
  await expect(findActiveOperator(database.pool, id)).resolves.toBeNull();
  await expect(
    owner.query(prepareOperatorStatusChange({ ...request, reason: 'changed terms' })),
  ).rejects.toThrow('different terms');
});

test('operator provisioning requires a current verified eligible provider identity', async () => {
  const missing = randomUUID();
  await expect(owner.query(prepareOperatorStatusChange(operatorRequest(missing)))).rejects.toThrow(
    'verified eligible account',
  );
  for (const state of ['unverified', 'banned', 'deleted', 'anonymous']) {
    const id = await verifiedOperatorCandidate();
    if (state === 'unverified')
      await owner.query('UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1', [id]);
    if (state === 'banned')
      await owner.query(
        "UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = $1",
        [id],
      );
    if (state === 'deleted')
      await owner.query('UPDATE auth.users SET deleted_at = now() WHERE id = $1', [id]);
    if (state === 'anonymous')
      await owner.query('UPDATE auth.users SET is_anonymous = true WHERE id = $1', [id]);
    await expect(owner.query(prepareOperatorStatusChange(operatorRequest(id)))).rejects.toThrow(
      'verified eligible account',
    );
    expect(
      (await owner.query('SELECT * FROM ops.operator_accounts WHERE auth_user_id = $1', [id]))
        .rowCount,
    ).toBe(0);
  }
});

test('operator status and audit receipt roll back together and reasons remain data', async () => {
  const id = await verifiedOperatorCandidate();
  const reason = "Owner's \\ review'); DROP TABLE ops.operator_accounts; --";
  const request = { ...operatorRequest(id), reason };
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query(prepareOperatorStatusChange(request));
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  expect(
    (await owner.query('SELECT * FROM ops.operator_accounts WHERE auth_user_id = $1', [id]))
      .rowCount,
  ).toBe(0);
  expect(
    (
      await owner.query('SELECT * FROM ops.operator_access_changes WHERE request_id = $1', [
        request.requestId,
      ])
    ).rowCount,
  ).toBe(0);
  await owner.query(prepareOperatorStatusChange(request));
  expect(
    (
      await owner.query('SELECT reason FROM ops.operator_access_changes WHERE request_id = $1', [
        request.requestId,
      ])
    ).rows[0]?.reason,
  ).toBe(reason);
});

test('runtime and public roles cannot provision operators or write audit receipts', async () => {
  const id = await verifiedOperatorCandidate();
  const sql = prepareOperatorStatusChange(operatorRequest(id));
  await expect(database.pool.query(sql)).rejects.toMatchObject({ code: '42501' });
  for (const role of ['hunter_runtime', 'anon', 'authenticated', 'service_role']) {
    const privileges = await owner.query(
      `SELECT has_function_privilege($1, 'ops.set_operator_status(uuid,uuid,text,text,text)', 'EXECUTE') AS execute,
        has_function_privilege($1, 'ops.set_operator_status_by_email(text,text,text,text,uuid)', 'EXECUTE') AS email_execute,
        has_table_privilege($1, 'ops.operator_access_changes', 'INSERT') AS insert`,
      [role],
    );
    expect(privileges.rows).toEqual([{ execute: false, email_execute: false, insert: false }]);
  }
  await expect(
    database.pool.query('SELECT ops.set_operator_status_by_email($1, $2, $3, $4)', [
      `${id}@example.test`,
      'active',
      'runtime',
      'Self promotion',
    ]),
  ).rejects.toMatchObject({ code: '42501' });
});
