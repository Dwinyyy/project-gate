import { afterAll, beforeAll, expect, test } from 'vitest';
import { Pool } from 'pg';
import { migrate } from '../../scripts/migrate.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFile, fork, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { prepareOperatorStatusChange } from '../../scripts/lib/operator-provisioning.js';
import { registerProfileDisclosureTests } from './profile-disclosure-cases.js';
import {
  authorizeCharacterOperation,
  type CharacterAuthorityInput,
  createDatabase,
  createCharacterStore,
  findActiveOperator,
  findOperatorStatus,
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
registerProfileDisclosureTests({
  owner,
  runtime: database.pool,
  createCandidate: characterCandidate,
  removeCandidate: removeCharacterCandidate,
});

test('operational functions have pinned trusted search paths', async () => {
  const functions = await owner.query<{ proname: string; proconfig: string[] | null }>(
    "SELECT proname, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ops'",
  );
  expect(functions.rows.length).toBeGreaterThanOrEqual(5);
  for (const fn of functions.rows)
    expect(fn.proconfig, fn.proname).toContain(
      fn.proname === 'lock_character_pilot_access'
        ? 'search_path=pg_catalog, pg_temp'
        : 'search_path=pg_catalog, ops',
    );
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

test('backfills_existing_character_with_renderable_v1_appearance', async () => {
  const id = await characterCandidate();
  let accountId: string | undefined;
  try {
    const account = await owner.query<{ id: string }>(
      'INSERT INTO game.accounts(auth_user_id) VALUES ($1) RETURNING id',
      [id],
    );
    accountId = account.rows[0]!.id;
    const character = await owner.query<{ id: string }>(
      "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Legacy') RETURNING id",
      [account.rows[0]!.id],
    );
    expect(
      (
        await owner.query(
          'SELECT catalog_version, preset_id, skin_tone_id, hair_style_id, hair_color_id FROM game.characters WHERE id = $1',
          [character.rows[0]!.id],
        )
      ).rows,
    ).toEqual([
      {
        catalog_version: 1,
        preset_id: 'portrait-01',
        skin_tone_id: 'tone-03',
        hair_style_id: 'cropped',
        hair_color_id: 'black',
      },
    ]);
    await owner.query('DELETE FROM auth.users WHERE id = $1', [id]);
    expect(
      (await owner.query('SELECT id FROM game.characters WHERE id = $1', [character.rows[0]!.id]))
        .rowCount,
    ).toBe(1);
    expect(
      (
        await owner.query('SELECT auth_user_id FROM game.accounts WHERE id = $1', [
          account.rows[0]!.id,
        ])
      ).rows,
    ).toEqual([{ auth_user_id: null }]);
  } finally {
    if (accountId) {
      await owner.query('DELETE FROM game.characters WHERE account_id = $1', [accountId]);
      await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
    }
    await owner.query('DELETE FROM auth.users WHERE id = $1', [id]);
  }
});

test('rejects_unknown_appearance_ids', async () => {
  const account = await owner.query<{ id: string }>(
    'INSERT INTO game.accounts DEFAULT VALUES RETURNING id',
  );
  const accountId = account.rows[0]!.id;
  try {
    for (const field of [
      'catalog_version',
      'preset_id',
      'skin_tone_id',
      'hair_style_id',
      'hair_color_id',
    ]) {
      await expect(
        owner.query(
          `INSERT INTO game.characters(account_id, display_alias, ${field}) VALUES ($1, 'Invalid', $2)`,
          [accountId, field === 'catalog_version' ? 2 : 'unknown'],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }
    expect(
      (
        await owner.query(
          'SELECT count(*)::int AS count FROM game.characters WHERE account_id = $1',
          [accountId],
        )
      ).rows[0]?.count,
    ).toBe(0);
  } finally {
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
});

test('owner_pilot_grant_and_revoke_are_audited_and_idempotent', async () => {
  const email = `${randomUUID()}@example.test`;
  const id = await characterCandidate(email, false);
  const request = randomUUID();
  const query = 'SELECT ops.set_character_pilot_status_by_email($1, $2, $3, $4, $5) AS receipt';
  try {
    const terms = [email.toUpperCase(), true, 'owner', 'Private test', request];
    const granted = (await owner.query(query, terms)).rows[0]?.receipt;
    expect(granted).toMatchObject({
      auth_user_id: id,
      previous_enabled: false,
      enabled: true,
      requested_by: 'owner',
      reason: 'Private test',
      database_actor: 'postgres',
    });
    expect((await owner.query(query, terms)).rows[0]?.receipt).toEqual(granted);
    await expect(
      owner.query(query, [email, false, 'owner', 'Private test', request]),
    ).rejects.toMatchObject({ code: '22023' });
    expect(
      (
        await owner.query(
          'SELECT enabled FROM ops.character_pilot_access WHERE auth_user_id = $1',
          [id],
        )
      ).rows,
    ).toEqual([{ enabled: true }]);
    const revoke = (await owner.query(query, [email, false, 'owner', 'Pilot ended', randomUUID()]))
      .rows[0]?.receipt;
    expect(revoke).toMatchObject({ auth_user_id: id, previous_enabled: true, enabled: false });
    expect((await owner.query(query, terms)).rows[0]?.receipt).toEqual(granted);
    expect(
      (
        await owner.query(
          'SELECT enabled FROM ops.character_pilot_access WHERE auth_user_id = $1',
          [id],
        )
      ).rows,
    ).toEqual([{ enabled: false }]);
    await expect(
      owner.query('UPDATE ops.character_pilot_changes SET reason = $1 WHERE request_id = $2', [
        'rewrite',
        request,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await owner.query('DELETE FROM auth.users WHERE id = $1', [id]);
    expect(
      (
        await owner.query(
          'SELECT count(*)::int AS count FROM ops.character_pilot_access WHERE auth_user_id = $1',
          [id],
        )
      ).rows[0]?.count,
    ).toBe(0);
    expect(
      (
        await owner.query(
          'SELECT count(*)::int AS count FROM ops.character_pilot_changes WHERE auth_user_id = $1',
          [id],
        )
      ).rows[0]?.count,
    ).toBe(2);
  } finally {
    await owner.query('DELETE FROM auth.users WHERE id = $1', [id]);
  }
});

test('runtime_and_public_roles_cannot_change_pilot_access', async () => {
  const email = `${randomUUID()}@example.test`;
  const id = await characterCandidate(email, false);
  try {
    expect(
      (
        await owner.query(
          `SELECT function_owner.rolname AS function_owner, table_owner.rolname AS table_owner,
                  procedure.prosecdef AS security_definer, procedure.provolatile AS volatility
             FROM pg_proc procedure
             JOIN pg_roles function_owner ON function_owner.oid = procedure.proowner
             JOIN pg_class pilot_table ON pilot_table.oid = 'ops.character_pilot_access'::regclass
             JOIN pg_roles table_owner ON table_owner.oid = pilot_table.relowner
            WHERE procedure.oid = 'ops.lock_character_pilot_access(uuid)'::regprocedure`,
        )
      ).rows,
    ).toEqual([
      {
        function_owner: 'postgres',
        table_owner: 'postgres',
        security_definer: true,
        volatility: 'v',
      },
    ]);
    for (const role of ['hunter_runtime', 'anon', 'authenticated', 'service_role']) {
      const grants = (
        await owner.query(
          `SELECT has_column_privilege($1, 'ops.character_pilot_access', 'auth_user_id', 'SELECT') AS read_id, has_column_privilege($1, 'ops.character_pilot_access', 'enabled', 'SELECT') AS read_enabled, has_column_privilege($1, 'ops.character_pilot_access', 'updated_at', 'SELECT') AS read_updated_at, has_table_privilege($1, 'ops.character_pilot_access', 'INSERT,UPDATE,DELETE') AS write, has_table_privilege($1, 'ops.character_pilot_changes', 'INSERT,UPDATE,DELETE') AS audit_write, has_function_privilege($1, 'ops.set_character_pilot_status_by_email(text,boolean,text,text,uuid)', 'EXECUTE') AS execute, has_function_privilege($1, 'ops.lock_character_pilot_access(uuid)', 'EXECUTE') AS lock_execute`,
          [role],
        )
      ).rows[0];
      expect(grants).toEqual({
        read_id: role === 'hunter_runtime',
        read_enabled: role === 'hunter_runtime',
        read_updated_at: false,
        write: false,
        audit_write: false,
        execute: false,
        lock_execute: role === 'hunter_runtime',
      });
    }
    expect(
      (
        await database.pool.query('SELECT ops.lock_character_pilot_access($1::uuid) AS enabled', [
          id,
        ])
      ).rows,
    ).toEqual([{ enabled: false }]);
    await expect(
      database.pool.query(
        'SELECT enabled FROM ops.character_pilot_access WHERE auth_user_id = $1::uuid FOR SHARE',
        [id],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      database.pool.query(
        'UPDATE ops.character_pilot_access SET enabled = false WHERE auth_user_id = $1::uuid',
        [id],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await owner.query(
      "INSERT INTO ops.operator_accounts(auth_user_id, status) VALUES ($1, 'suspended')",
      [id],
    );
    await expect(
      owner.query('SELECT ops.set_character_pilot_status_by_email($1, true, $2, $3)', [
        email,
        'owner',
        'No operator grants',
      ]),
    ).rejects.toMatchObject({ code: '22023' });
  } finally {
    await owner.query('DELETE FROM ops.operator_accounts WHERE auth_user_id = $1', [id]);
    await owner.query('DELETE FROM auth.users WHERE id = $1', [id]);
  }
});

test('account access defaults active, permits owner restriction, and rejects other values', async () => {
  const accountId = (
    await owner.query<{ id: string }>('INSERT INTO game.accounts DEFAULT VALUES RETURNING id')
  ).rows[0]!.id;
  try {
    expect(
      (await owner.query('SELECT access_state FROM game.accounts WHERE id = $1', [accountId])).rows,
    ).toEqual([{ access_state: 'active' }]);
    expect(
      (
        await owner.query(
          "UPDATE game.accounts SET access_state = 'restricted' WHERE id = $1 RETURNING access_state",
          [accountId],
        )
      ).rows,
    ).toEqual([{ access_state: 'restricted' }]);
    await expect(
      owner.query("UPDATE game.accounts SET access_state = 'invalid' WHERE id = $1", [accountId]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (await owner.query('SELECT access_state FROM game.accounts WHERE id = $1', [accountId])).rows,
    ).toEqual([{ access_state: 'restricted' }]);
  } finally {
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
    const second = (
      await owner.query<{ id: string }>(
        "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Second') RETURNING id",
        [accountId],
      )
    ).rows[0]!.id;
    expect(
      (
        await owner.query('SELECT id, life_state FROM game.characters WHERE account_id = $1', [
          accountId,
        ])
      ).rows.sort((left, right) => String(left.id).localeCompare(String(right.id))),
    ).toEqual(
      [
        { id: first, life_state: 'dead' },
        { id: second, life_state: 'alive' },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
  } finally {
    await owner.query('DELETE FROM game.characters WHERE account_id = $1', [accountId]);
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
});

test('independent connections racing to create characters leave one living slot occupied', async () => {
  const accountId = (
    await owner.query<{ id: string }>('INSERT INTO game.accounts DEFAULT VALUES RETURNING id')
  ).rows[0]!.id;
  const firstConnection = await owner.connect();
  const secondConnection = await owner.connect();
  try {
    const attempts = await Promise.allSettled([
      firstConnection.query(
        "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Racer one') RETURNING id",
        [accountId],
      ),
      secondConnection.query(
        "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Racer two') RETURNING id",
        [accountId],
      ),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toMatchObject([
      { reason: { code: '23505' } },
    ]);
    expect(
      (
        await owner.query(
          "SELECT id FROM game.characters WHERE account_id = $1 AND life_state IN ('alive', 'incapacitated')",
          [accountId],
        )
      ).rowCount,
    ).toBe(1);
  } finally {
    firstConnection.release();
    secondConnection.release();
    await owner.query('DELETE FROM game.characters WHERE account_id = $1', [accountId]);
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
});

test('awakening, presence and visibility changes cannot free the living slot', async () => {
  const accountId = (
    await owner.query<{ id: string }>('INSERT INTO game.accounts DEFAULT VALUES RETURNING id')
  ).rows[0]!.id;
  try {
    const characterId = (
      await owner.query<{ id: string }>(
        "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Civilian') RETURNING id",
        [accountId],
      )
    ).rows[0]!.id;
    for (const [column, value] of [
      ['awakening_state', 'awakened'],
      ['presence_state', 'committed'],
      ['profile_visibility', 'public'],
    ]) {
      await owner.query(`UPDATE game.characters SET ${column} = $1 WHERE id = $2`, [
        value,
        characterId,
      ]);
      await expect(
        owner.query(
          "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Second')",
          [accountId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    }
    expect(
      (
        await owner.query(
          'SELECT life_state, awakening_state, presence_state, profile_visibility FROM game.characters WHERE id = $1',
          [characterId],
        )
      ).rows,
    ).toEqual([
      {
        life_state: 'alive',
        awakening_state: 'awakened',
        presence_state: 'committed',
        profile_visibility: 'public',
      },
    ]);
  } finally {
    await owner.query('DELETE FROM game.characters WHERE account_id = $1', [accountId]);
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
});

test('public roles cannot read game identity and runtime cannot change protected state', async () => {
  const accountId = (
    await owner.query<{ id: string }>('INSERT INTO game.accounts DEFAULT VALUES RETURNING id')
  ).rows[0]!.id;
  const characterId = (
    await owner.query<{ id: string }>(
      "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Private') RETURNING id",
      [accountId],
    )
  ).rows[0]!.id;
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const privileges = await owner.query(
        "SELECT has_schema_privilege($1, 'game', 'USAGE') AS schema, has_table_privilege($1, 'game.accounts', 'SELECT') AS accounts_read, has_table_privilege($1, 'game.characters', 'SELECT') AS characters_read, has_table_privilege($1, 'game.accounts', 'INSERT,UPDATE,DELETE') AS accounts_write, has_table_privilege($1, 'game.characters', 'INSERT,UPDATE,DELETE') AS characters_write",
        [role],
      );
      expect(privileges.rows).toEqual([
        {
          schema: false,
          accounts_read: false,
          characters_read: false,
          accounts_write: false,
          characters_write: false,
        },
      ]);
      expect(
        (
          await owner.query(
            "SELECT has_column_privilege($1, 'game.accounts', 'access_state', 'UPDATE') AS allowed",
            [role],
          )
        ).rows[0]?.allowed,
      ).toBe(false);
      const roleConnection = await owner.connect();
      try {
        await roleConnection.query('BEGIN');
        await roleConnection.query(`SET LOCAL ROLE ${role}`);
        for (const table of ['accounts', 'characters']) {
          await expect(roleConnection.query(`SELECT id FROM game.${table}`)).rejects.toMatchObject({
            code: '42501',
          });
          await roleConnection.query('ROLLBACK');
          await roleConnection.query('BEGIN');
          await roleConnection.query(`SET LOCAL ROLE ${role}`);
        }
        for (const [sql, id] of [
          ["UPDATE game.accounts SET access_state = 'restricted' WHERE id = $1", accountId],
          ["UPDATE game.characters SET life_state = 'dead' WHERE id = $1", characterId],
        ] as const) {
          await expect(roleConnection.query(sql, [id])).rejects.toMatchObject({ code: '42501' });
          await roleConnection.query('ROLLBACK');
          await roleConnection.query('BEGIN');
          await roleConnection.query(`SET LOCAL ROLE ${role}`);
        }
      } finally {
        await roleConnection.query('ROLLBACK');
        roleConnection.release();
      }
    }
    expect(
      (await database.pool.query('SELECT id FROM game.accounts WHERE id = $1', [accountId])).rows,
    ).toEqual([{ id: accountId }]);
    expect(
      (await database.pool.query('SELECT id FROM game.characters WHERE id = $1', [characterId]))
        .rows,
    ).toEqual([{ id: characterId }]);
    const forbiddenWrites: [string, string[]][] = [
      ['INSERT INTO game.accounts(character_creation_not_before) VALUES (now())', []],
      [
        "INSERT INTO game.characters(account_id, display_alias, life_state) VALUES ($1, 'Forbidden', 'dead')",
        [accountId],
      ],
      ['UPDATE game.accounts SET auth_user_id = $1 WHERE id = $2', [randomUUID(), accountId]],
      ["UPDATE game.accounts SET access_state = 'restricted' WHERE id = $1", [accountId]],
      ['UPDATE game.accounts SET character_creation_not_before = now() WHERE id = $1', [accountId]],
      ['UPDATE game.characters SET account_id = $1 WHERE id = $2', [randomUUID(), characterId]],
      ["UPDATE game.characters SET life_state = 'dead' WHERE id = $1", [characterId]],
      ["UPDATE game.characters SET awakening_state = 'awakened' WHERE id = $1", [characterId]],
      ["UPDATE game.characters SET presence_state = 'active' WHERE id = $1", [characterId]],
      ['UPDATE ops.feature_controls SET characters = true WHERE singleton = true', []],
      ['DELETE FROM game.characters WHERE id = $1', [characterId]],
      ['DELETE FROM game.accounts WHERE id = $1', [accountId]],
    ];
    for (const [query, values] of forbiddenWrites) {
      await expect(database.pool.query(query, values)).rejects.toMatchObject({ code: '42501' });
    }
    expect(
      (await owner.query('SELECT account_id FROM game.characters WHERE id = $1', [characterId]))
        .rows,
    ).toEqual([{ account_id: accountId }]);
    expect((await owner.query('SELECT characters FROM ops.feature_controls')).rows).toEqual([
      { characters: false },
    ]);
  } finally {
    await owner.query('DELETE FROM game.characters WHERE account_id = $1', [accountId]);
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
});

test('creation receipt is private, constrained, and keeps account and character history', async () => {
  const accountId = (
    await owner.query<{ id: string }>('INSERT INTO game.accounts DEFAULT VALUES RETURNING id')
  ).rows[0]!.id;
  const characterId = (
    await owner.query<{ id: string }>(
      "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Receipt civilian') RETURNING id",
      [accountId],
    )
  ).rows[0]!.id;
  const operationId = randomUUID();
  const fingerprint = randomBytes(32);
  try {
    await database.pool.query(
      'INSERT INTO game.character_creation_receipts(account_id, operation_id, request_fingerprint, character_id) VALUES ($1, $2, $3, $4)',
      [accountId, operationId, fingerprint, characterId],
    );
    const receipt = await database.pool.query(
      'SELECT account_id, operation_id, request_fingerprint, character_id, created_at FROM game.character_creation_receipts WHERE account_id = $1 AND operation_id = $2',
      [accountId, operationId],
    );
    expect(receipt.rows[0]).toMatchObject({
      account_id: accountId,
      operation_id: operationId,
      request_fingerprint: fingerprint,
      character_id: characterId,
    });
    expect(receipt.rows[0]?.created_at).toBeInstanceOf(Date);
    await expect(
      owner.query(
        'INSERT INTO game.character_creation_receipts(account_id, operation_id, request_fingerprint, character_id) VALUES ($1, $2, $3, $4)',
        [accountId, randomUUID(), randomBytes(31), randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      owner.query(
        'INSERT INTO game.character_creation_receipts(account_id, operation_id, request_fingerprint, character_id) VALUES ($1, $2, $3, $4)',
        [accountId, randomUUID(), fingerprint, characterId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      owner.query('DELETE FROM game.characters WHERE id = $1', [characterId]),
    ).rejects.toMatchObject({ code: '23001' });
    await expect(
      owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]),
    ).rejects.toMatchObject({ code: '23001' });
  } finally {
    await owner.query('DELETE FROM game.character_creation_receipts WHERE account_id = $1', [
      accountId,
    ]);
    await owner.query('DELETE FROM game.characters WHERE id = $1', [characterId]);
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
});

test('private Auth routine locks and accepts only currently eligible verified users', async () => {
  const ids = await Promise.all(Array.from({ length: 6 }, () => verifiedOperatorCandidate(false)));
  const [verifiedId, bannedId, deletedId, anonymousId, unverifiedId, expiredBanId] = ids as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  await owner.query(
    "UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 day' WHERE id = $1",
    [bannedId],
  );
  await owner.query('UPDATE auth.users SET deleted_at = clock_timestamp() WHERE id = $1', [
    deletedId,
  ]);
  await owner.query('UPDATE auth.users SET is_anonymous = true WHERE id = $1', [anonymousId]);
  await owner.query('UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1', [
    unverifiedId,
  ]);
  await owner.query(
    "UPDATE auth.users SET banned_until = clock_timestamp() - interval '1 day' WHERE id = $1",
    [expiredBanId],
  );
  for (const [id, expected] of [
    [verifiedId, true],
    [bannedId, false],
    [deletedId, false],
    [anonymousId, false],
    [unverifiedId, false],
    [expiredBanId, true],
    [randomUUID(), false],
  ] as const) {
    expect(
      (await database.pool.query('SELECT game.lock_eligible_auth_user($1) AS eligible', [id]))
        .rows[0]?.eligible,
    ).toBe(expected);
  }
  const functionInfo = await owner.query(
    "SELECT p.prosecdef, p.proconfig, p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'auth.users'::regclass) AS trusted_owner FROM pg_proc p WHERE p.oid = 'game.lock_eligible_auth_user(uuid)'::regprocedure",
  );
  expect(functionInfo.rows).toEqual([
    { prosecdef: true, proconfig: ['search_path=pg_catalog, auth'], trusted_owner: true },
  ]);
  expect(
    (
      await owner.query(
        "SELECT has_table_privilege('hunter_runtime', 'auth.users', 'SELECT') AS allowed",
      )
    ).rows[0]?.allowed,
  ).toBe(false);
});

test('private Auth eligibility holds its provider row lock until the transaction ends', async () => {
  const id = await verifiedOperatorCandidate(false);
  const runtime = await database.pool.connect();
  const provider = await owner.connect();
  try {
    await runtime.query('BEGIN');
    expect(
      (await runtime.query('SELECT game.lock_eligible_auth_user($1) AS eligible', [id])).rows[0]
        ?.eligible,
    ).toBe(true);
    await provider.query('BEGIN');
    await provider.query("SET LOCAL lock_timeout = '100ms'");
    await expect(
      provider.query('UPDATE auth.users SET deleted_at = clock_timestamp() WHERE id = $1', [id]),
    ).rejects.toMatchObject({ code: '55P03' });
  } finally {
    await provider.query('ROLLBACK');
    await runtime.query('ROLLBACK');
    provider.release();
    runtime.release();
  }
});

test('creation runtime has only the required column grants and can acquire both locks', async () => {
  const columns = [
    ['game.accounts', 'auth_user_id', 'INSERT', true],
    ['game.accounts', 'character_creation_not_before', 'INSERT', false],
    ['game.accounts', 'auth_user_id', 'UPDATE', false],
    ['game.accounts', 'access_state', 'UPDATE', false],
    ['game.accounts', 'revision', 'UPDATE', true],
    ['game.characters', 'account_id', 'INSERT', true],
    ['game.characters', 'display_alias', 'INSERT', true],
    ['game.characters', 'life_state', 'INSERT', false],
    ['game.characters', 'life_state', 'UPDATE', false],
    ['game.characters', 'account_id', 'UPDATE', false],
    ['game.characters', 'revision', 'UPDATE', true],
    ['game.character_creation_receipts', 'account_id', 'INSERT', true],
    ['game.character_creation_receipts', 'operation_id', 'INSERT', true],
    ['game.character_creation_receipts', 'request_fingerprint', 'INSERT', true],
    ['game.character_creation_receipts', 'character_id', 'INSERT', true],
    ['game.character_creation_receipts', 'created_at', 'INSERT', false],
    ['ops.feature_controls', 'singleton', 'UPDATE', true],
    ['ops.feature_controls', 'characters', 'UPDATE', false],
  ] as const;
  for (const [relation, column, privilege, expected] of columns) {
    expect(
      (
        await owner.query('SELECT has_column_privilege($1, $2, $3, $4) AS allowed', [
          'hunter_runtime',
          relation,
          column,
          privilege,
        ])
      ).rows[0]?.allowed,
      `${relation}.${column} ${privilege}`,
    ).toBe(expected);
  }
  const accountId = (
    await database.pool.query<{ id: string }>(
      'INSERT INTO game.accounts(auth_user_id) VALUES (NULL) RETURNING id',
    )
  ).rows[0]!.id;
  const characterId = (
    await owner.query<{ id: string }>(
      "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Lock target') RETURNING id",
      [accountId],
    )
  ).rows[0]!.id;
  try {
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      expect(
        (await client.query('SELECT id FROM game.accounts WHERE id = $1 FOR UPDATE', [accountId]))
          .rows,
      ).toEqual([{ id: accountId }]);
      expect(
        (await client.query('SELECT singleton, characters FROM ops.feature_controls FOR SHARE'))
          .rows,
      ).toEqual([{ singleton: true, characters: false }]);
      expect(
        (
          await client.query('SELECT id FROM game.characters WHERE id = $1 FOR SHARE', [
            characterId,
          ])
        ).rows,
      ).toEqual([{ id: characterId }]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await owner.query('DELETE FROM game.characters WHERE id = $1', [characterId]);
    await owner.query('DELETE FROM game.accounts WHERE id = $1', [accountId]);
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    expect(
      (
        await owner.query(
          "SELECT has_function_privilege($1, 'game.lock_eligible_auth_user(uuid)', 'EXECUTE') AS allowed",
          [role],
        )
      ).rows[0]?.allowed,
    ).toBe(false);
    expect(
      (
        await owner.query(
          "SELECT has_table_privilege($1, 'game.character_creation_receipts', 'SELECT') AS allowed",
          [role],
        )
      ).rows[0]?.allowed,
    ).toBe(false);
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${role}`);
      await expect(
        client.query('SELECT game.lock_eligible_auth_user($1)', [randomUUID()]),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
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
  expect(
    (
      await owner.query(
        "SELECT length(sha256) AS checksum_length, applied_by FROM ops.schema_migrations WHERE name = '20260928000100_character_authority.sql'",
      )
    ).rows,
  ).toEqual([{ checksum_length: 64, applied_by: 'postgres' }]);
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
    await expect(findOperatorStatus(database.pool, authUserId)).resolves.toBe('active');
    await expect(findOperatorStatus(database.pool, randomUUID())).resolves.toBeNull();
    await expect(findActiveOperator(database.pool, authUserId)).resolves.toEqual({
      authUserId,
      permissions: ['feature_controls:read'],
    });
    await owner.query(
      "UPDATE ops.operator_accounts SET status = 'suspended', updated_at = now() WHERE auth_user_id = $1",
      [authUserId],
    );
    await expect(findActiveOperator(database.pool, authUserId)).resolves.toBeNull();
    await expect(findOperatorStatus(database.pool, authUserId)).resolves.toBe('suspended');
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

const characterStore = createCharacterStore(database.pool);
const testAppearance = {
  catalogVersion: 1 as const,
  presetId: 'portrait-02' as const,
  skinToneId: 'tone-04' as const,
  hairStyleId: 'coiled' as const,
  hairColorId: 'auburn' as const,
};
const creationInput = (displayAlias: string) => ({ displayAlias, appearance: testAppearance });

async function characterCandidate(
  email = `${randomUUID()}@example.test`,
  pilot = true,
): Promise<string> {
  const id = randomUUID();
  await owner.query(
    'INSERT INTO auth.users(id, email, email_confirmed_at) VALUES ($1, $2, now())',
    [id, email],
  );
  if (pilot) await setPilotStatus(email, true);
  return id;
}

async function setPilotStatus(email: string, enabled: boolean): Promise<void> {
  await owner.query('SELECT ops.set_character_pilot_status_by_email($1, $2, $3, $4, $5)', [
    email,
    enabled,
    'integration-test-owner',
    enabled ? 'Private test fixture' : 'Private test fixture revoked',
    randomUUID(),
  ]);
}

async function removeCharacterCandidate(id: string): Promise<void> {
  const cleanup = await owner.connect();
  try {
    await cleanup.query('BEGIN');
    await cleanup.query("SET LOCAL session_replication_role = 'replica'");
    await cleanup.query(
      'DELETE FROM game.profile_operation_receipts WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id=$1)',
      [id],
    );
    await cleanup.query(
      'DELETE FROM game.profile_invitations WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id=$1)',
      [id],
    );
    await cleanup.query('COMMIT');
  } catch (error) {
    await cleanup.query('ROLLBACK');
    throw error;
  } finally {
    cleanup.release();
  }
  await owner.query(
    'DELETE FROM game.character_creation_receipts WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id = $1)',
    [id],
  );
  await owner.query(
    'DELETE FROM game.characters WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id = $1)',
    [id],
  );
  await owner.query('DELETE FROM game.accounts WHERE auth_user_id = $1', [id]);
  await owner.query('DELETE FROM ops.operator_accounts WHERE auth_user_id = $1', [id]);
  await owner.query('DELETE FROM auth.users WHERE id = $1', [id]);
}

async function authorityCheck(input: CharacterAuthorityInput) {
  return withTransaction(database.pool, (client) => authorizeCharacterOperation(client, input));
}

test('ordinary verified account remains unavailable while the global switch is on', async () => {
  const id = await characterCandidate(undefined, false);
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    expect(await authorityCheck({ authUserId: id, operation: 'character.create' })).toEqual({
      kind: 'denied',
      reason: 'pilot_unavailable',
    });
    expect(await characterStore.getMe(id)).toMatchObject({
      creation: { status: 'feature_disabled', notBefore: null },
    });
    expect(await characterStore.create(id, creationInput('Civilian'), randomUUID())).toEqual({
      kind: 'disabled',
    });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
    await owner.query(
      "INSERT INTO game.accounts(auth_user_id, access_state) VALUES ($1, 'restricted')",
      [id],
    );
    expect(await characterStore.getMe(id)).toMatchObject({
      mode: 'restricted',
      creation: { status: 'restricted' },
    });
    expect(await characterStore.create(id, creationInput('Civilian'), randomUUID())).toEqual({
      kind: 'account_restricted',
    });
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('revoked pilot cannot replay a committed creation receipt', async () => {
  const email = `${randomUUID()}@example.test`;
  const id = await characterCandidate(email);
  const key = randomUUID();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    const first = await characterStore.create(id, creationInput('Civilian'), key);
    expect(first).toMatchObject({ kind: 'created', replayed: false });
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    expect(await characterStore.create(id, creationInput('Civilian'), key)).toEqual({
      ...first,
      replayed: true,
    });
    await setPilotStatus(email, false);
    expect(await characterStore.create(id, creationInput('Civilian'), key)).toEqual({
      kind: 'disabled',
    });
    expect(await characterStore.getMe(id)).toMatchObject({
      creation: { status: 'feature_disabled' },
    });
    expect(
      (
        await owner.query(
          'SELECT count(*)::int AS count FROM game.character_creation_receipts WHERE account_id = (SELECT id FROM game.accounts WHERE auth_user_id = $1)',
          [id],
        )
      ).rows[0]?.count,
    ).toBe(1);
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

async function blockedAuthorityPid(fragment: string): Promise<number> {
  let pid: number | undefined;
  await expect
    .poll(
      async () => {
        pid = (
          await owner.query<{ pid: number }>(
            "SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND position($1 IN query) > 0 AND pid <> pg_backend_pid()",
            [fragment],
          )
        ).rows[0]?.pid;
        return pid;
      },
      { timeout: 5_000, interval: 20 },
    )
    .toBeTypeOf('number');
  return pid!;
}

test('pilot lock helper waits for the current private row without broader runtime privilege', async () => {
  const id = await characterCandidate();
  const state = await owner.connect();
  const runtime = await database.pool.connect();
  const statePid = (await state.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
    .pid;
  const runtimePid = (await runtime.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
    .rows[0]!.pid;
  let pending: Promise<unknown> | undefined;
  try {
    expect(runtimePid).not.toBe(statePid);
    await state.query('BEGIN');
    await state.query(
      'SELECT auth_user_id FROM ops.character_pilot_access WHERE auth_user_id = $1 FOR UPDATE',
      [id],
    );
    await runtime.query('BEGIN');
    pending = runtime.query('SELECT ops.lock_character_pilot_access($1::uuid) AS enabled', [id]);
    void pending.catch(() => undefined);
    expect(await blockedAuthorityPid('lock_character_pilot_access')).toBe(runtimePid);
    await state.query('COMMIT');
    expect(await pending).toMatchObject({
      rows: [{ enabled: true }],
    });
    await runtime.query('COMMIT');
  } finally {
    await state.query('ROLLBACK');
    await runtime.query('ROLLBACK');
    if (pending) await Promise.allSettled([pending]);
    state.release();
    runtime.release();
    await removeCharacterCandidate(id);
  }
}, 15_000);

test('pilot revocation committed first denies a waiting creation', async () => {
  const email = `${randomUUID()}@example.test`;
  const id = await characterCandidate(email);
  const state = await owner.connect();
  const statePid = (await state.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
    .pid;
  let pending: ReturnType<typeof characterStore.create> | undefined;
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await state.query('BEGIN');
    await state.query('SELECT ops.set_character_pilot_status_by_email($1, false, $2, $3, $4)', [
      email,
      'integration-test-owner',
      'Pilot revoked during creation',
      randomUUID(),
    ]);
    pending = characterStore.create(id, creationInput('Civilian'), randomUUID());
    void pending.catch(() => undefined);
    const createPid = await blockedAuthorityPid('operator-account:');
    expect(createPid).not.toBe(statePid);
    await state.query('COMMIT');
    expect(await pending).toEqual({ kind: 'disabled' });
    expect(
      (
        await owner.query(
          'SELECT count(*)::int AS count FROM game.characters WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id = $1)',
          [id],
        )
      ).rows[0]?.count,
    ).toBe(0);
    expect(
      (
        await owner.query(
          'SELECT count(*)::int AS count FROM game.character_creation_receipts WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id = $1)',
          [id],
        )
      ).rows[0]?.count,
    ).toBe(0);
  } finally {
    await state.query('ROLLBACK');
    state.release();
    if (pending) await Promise.allSettled([pending]);
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
}, 15_000);

test('creation committed first persists before a waiting pilot revocation', async () => {
  const email = `${randomUUID()}@example.test`;
  const id = await characterCandidate(email);
  const accountId = (
    await owner.query<{ id: string }>(
      'INSERT INTO game.accounts(auth_user_id) VALUES ($1) RETURNING id',
      [id],
    )
  ).rows[0]!.id;
  const blocker = await owner.connect();
  const state = await owner.connect();
  const blockerPid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
    .rows[0]!.pid;
  const statePid = (await state.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
    .pid;
  let pending: ReturnType<typeof characterStore.create> | undefined;
  let revoke: Promise<unknown> | undefined;
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM game.accounts WHERE id = $1 FOR UPDATE', [accountId]);
    pending = characterStore.create(id, creationInput('Civilian'), randomUUID());
    void pending.catch(() => undefined);
    const createPid = await blockedAuthorityPid('FROM game.accounts WHERE auth_user_id');
    expect(createPid).not.toBe(blockerPid);
    expect(createPid).not.toBe(statePid);
    revoke = state.query('SELECT ops.set_character_pilot_status_by_email($1, false, $2, $3, $4)', [
      email,
      'integration-test-owner',
      'Pilot revoked after creation',
      randomUUID(),
    ]);
    void revoke.catch(() => undefined);
    expect(await blockedAuthorityPid('SELECT ops.set_character_pilot_status_by_email')).toBe(
      statePid,
    );
    await blocker.query('COMMIT');
    expect(await pending).toMatchObject({ kind: 'created', replayed: false });
    await revoke;
    expect(
      (
        await owner.query(
          'SELECT count(*)::int AS count FROM game.characters WHERE account_id = $1',
          [accountId],
        )
      ).rows[0]?.count,
    ).toBe(1);
    expect(
      (
        await owner.query(
          'SELECT count(*)::int AS count FROM game.character_creation_receipts WHERE account_id = $1',
          [accountId],
        )
      ).rows[0]?.count,
    ).toBe(1);
    expect(await characterStore.create(id, creationInput('Civilian'), randomUUID())).toEqual({
      kind: 'disabled',
    });
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    if (pending) await Promise.allSettled([pending]);
    if (revoke) await Promise.allSettled([revoke]);
    state.release();
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
}, 15_000);

test('named reads remain available without an account and create reports the disabled flag', async () => {
  const id = await characterCandidate();
  try {
    expect(await authorityCheck({ authUserId: id, operation: 'account.records.read' })).toEqual({
      kind: 'allowed',
      accountId: null,
      charactersEnabled: null,
    });
    expect(await authorityCheck({ authUserId: id, operation: 'public.content.read' })).toEqual({
      kind: 'allowed',
      accountId: null,
      charactersEnabled: null,
    });
    expect(await authorityCheck({ authUserId: id, operation: 'character.create' })).toEqual({
      kind: 'allowed',
      accountId: null,
      charactersEnabled: false,
    });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
  } finally {
    await removeCharacterCandidate(id);
  }
});

test('profile authority requires an owned alive character and exact decimal revision', async () => {
  const id = await characterCandidate();
  const foreignId = await characterCandidate();
  const accountId = (
    await owner.query<{ id: string }>(
      'INSERT INTO game.accounts(auth_user_id) VALUES ($1) RETURNING id',
      [id],
    )
  ).rows[0]!.id;
  const foreignAccountId = (
    await owner.query<{ id: string }>(
      'INSERT INTO game.accounts(auth_user_id) VALUES ($1) RETURNING id',
      [foreignId],
    )
  ).rows[0]!.id;
  const characterId = (
    await owner.query<{ id: string }>(
      "INSERT INTO game.characters(account_id, display_alias, revision) VALUES ($1, 'Exact revision', 9007199254740993) RETURNING id",
      [accountId],
    )
  ).rows[0]!.id;
  const otherCharacterId = (
    await owner.query<{ id: string }>(
      "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Foreign') RETURNING id",
      [foreignAccountId],
    )
  ).rows[0]!.id;
  const profile = (target: string, revision = '9007199254740993') => ({
    authUserId: id,
    operation: 'character.profile.update' as const,
    characterId: target,
    expectedRevision: revision,
  });
  try {
    expect(await authorityCheck(profile(characterId))).toEqual({
      kind: 'allowed',
      accountId,
      charactersEnabled: null,
    });
    expect(await authorityCheck(profile(characterId, '9007199254740992'))).toEqual({
      kind: 'denied',
      reason: 'stale_revision',
    });
    expect(await authorityCheck(profile(characterId, '01'))).toEqual({
      kind: 'denied',
      reason: 'stale_revision',
    });
    expect(await authorityCheck(profile(otherCharacterId))).toEqual({
      kind: 'denied',
      reason: 'character_missing',
    });
    expect(await authorityCheck(profile(randomUUID()))).toEqual({
      kind: 'denied',
      reason: 'character_missing',
    });
    expect(await authorityCheck(profile('invalid'))).toEqual({
      kind: 'denied',
      reason: 'character_missing',
    });
    expect(
      await authorityCheck({ ...profile(characterId), operation: 'character.rescue.respond' }),
    ).toEqual({ kind: 'denied', reason: 'rescue_unavailable' });
    await owner.query("UPDATE game.characters SET life_state = 'incapacitated' WHERE id = $1", [
      characterId,
    ]);
    expect(await authorityCheck(profile(characterId))).toEqual({
      kind: 'denied',
      reason: 'incapacitated',
    });
    expect(
      await authorityCheck({ ...profile(characterId), operation: 'character.rescue.respond' }),
    ).toEqual({ kind: 'denied', reason: 'incapacitated' });
    await owner.query("UPDATE game.characters SET life_state = 'dead' WHERE id = $1", [
      characterId,
    ]);
    expect(await authorityCheck(profile(characterId))).toEqual({
      kind: 'denied',
      reason: 'dead_or_observer',
    });
    expect(
      await authorityCheck({ ...profile(characterId), operation: 'character.rescue.respond' }),
    ).toEqual({ kind: 'denied', reason: 'dead_or_observer' });
    expect(await authorityCheck({ authUserId: id, operation: 'account.records.read' })).toEqual({
      kind: 'allowed',
      accountId,
      charactersEnabled: null,
    });
    expect(await authorityCheck({ authUserId: id, operation: 'character.create' })).toEqual({
      kind: 'allowed',
      accountId,
      charactersEnabled: false,
    });
  } finally {
    await removeCharacterCandidate(id);
    await removeCharacterCandidate(foreignId);
  }
});

test('restriction keeps private and public reads but denies every named mutation', async () => {
  const id = await characterCandidate();
  const accountId = (
    await owner.query<{ id: string }>(
      'INSERT INTO game.accounts(auth_user_id, access_state) VALUES ($1, $2) RETURNING id',
      [id, 'restricted'],
    )
  ).rows[0]!.id;
  const characterId = (
    await owner.query<{ id: string }>(
      "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Restricted') RETURNING id",
      [accountId],
    )
  ).rows[0]!.id;
  try {
    for (const operation of ['account.records.read', 'public.content.read'] as const) {
      expect(await authorityCheck({ authUserId: id, operation })).toEqual({
        kind: 'allowed',
        accountId,
        charactersEnabled: null,
      });
    }
    expect(await authorityCheck({ authUserId: id, operation: 'character.create' })).toEqual({
      kind: 'denied',
      reason: 'account_restricted',
    });
    for (const operation of ['character.profile.update', 'character.rescue.respond'] as const) {
      expect(
        await authorityCheck({ authUserId: id, operation, characterId, expectedRevision: '0' }),
      ).toEqual({ kind: 'denied', reason: 'account_restricted' });
    }
  } finally {
    await removeCharacterCandidate(id);
  }
});

test('operator, unavailable Auth, malformed input and unknown operations fail closed', async () => {
  const id = await characterCandidate();
  const bannedId = await characterCandidate();
  try {
    await owner.query(prepareOperatorStatusChange(operatorRequest(id)));
    await owner.query(
      "UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 day' WHERE id = $1",
      [bannedId],
    );
    for (const operation of [
      'account.records.read',
      'public.content.read',
      'character.create',
    ] as const) {
      expect(await authorityCheck({ authUserId: id, operation })).toEqual({
        kind: 'denied',
        reason: 'operator_only',
      });
      expect(await authorityCheck({ authUserId: bannedId, operation })).toEqual({
        kind: 'denied',
        reason: 'auth_ineligible',
      });
    }
    await owner.query(
      "UPDATE ops.operator_accounts SET status = 'suspended' WHERE auth_user_id = $1",
      [id],
    );
    expect(await authorityCheck({ authUserId: id, operation: 'account.records.read' })).toEqual({
      kind: 'denied',
      reason: 'operator_only',
    });
    expect(
      await authorityCheck({ authUserId: randomUUID(), operation: 'account.records.read' }),
    ).toEqual({ kind: 'denied', reason: 'auth_ineligible' });
    expect(
      await authorityCheck({ authUserId: 'invalid', operation: 'account.records.read' }),
    ).toEqual({ kind: 'denied', reason: 'auth_ineligible' });
    await owner.query('UPDATE auth.users SET banned_until = NULL WHERE id = $1', [bannedId]);
    expect(
      await authorityCheck({
        authUserId: bannedId,
        operation: 'unknown',
      } as unknown as CharacterAuthorityInput),
    ).toEqual({ kind: 'denied', reason: 'auth_ineligible' });
    expect(
      await authorityCheck({
        authUserId: bannedId,
        operation: 'character.profile.update',
      } as CharacterAuthorityInput),
    ).toEqual({ kind: 'denied', reason: 'character_missing' });
  } finally {
    await removeCharacterCandidate(id);
    await removeCharacterCandidate(bannedId);
  }
});

async function waitForAuthorityBlock(pid: number, queryFragment: string): Promise<void> {
  await expect
    .poll(
      async () =>
        (
          await owner.query<{ waiting: boolean }>(
            "SELECT wait_event_type = 'Lock' AND position($2 IN query) > 0 AS waiting FROM pg_stat_activity WHERE pid = $1",
            [pid, queryFragment],
          )
        ).rows[0]?.waiting,
      { timeout: 5_000, interval: 20 },
    )
    .toBe(true);
}

test.each(['restriction', 'death'] as const)(
  '%s and profile actions serialize in both commit orders',
  async (transition) => {
    const id = await characterCandidate();
    const accountId = (
      await owner.query<{ id: string }>(
        'INSERT INTO game.accounts(auth_user_id) VALUES ($1) RETURNING id',
        [id],
      )
    ).rows[0]!.id;
    const characterId = (
      await owner.query<{ id: string }>(
        "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Race target') RETURNING id",
        [accountId],
      )
    ).rows[0]!.id;
    await owner.query(
      'CREATE TABLE IF NOT EXISTS game.authority_test_actions(id uuid PRIMARY KEY, character_id uuid NOT NULL)',
    );
    await owner.query('GRANT INSERT ON game.authority_test_actions TO hunter_runtime');
    const action = await database.pool.connect();
    const state = await owner.connect();
    const actionPid = (await action.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
      .rows[0]!.pid;
    const statePid = (await state.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
      .pid;
    expect(actionPid).not.toBe(statePid);
    const changeSql =
      transition === 'restriction'
        ? "UPDATE game.accounts SET access_state = 'restricted' WHERE id = $1"
        : "UPDATE game.characters SET life_state = 'dead' WHERE id = $1";
    const targetId = transition === 'restriction' ? accountId : characterId;
    const guardInput: CharacterAuthorityInput = {
      authUserId: id,
      operation: 'character.profile.update',
      characterId,
      expectedRevision: '0',
    };
    const deniedReason = transition === 'restriction' ? 'account_restricted' : 'dead_or_observer';
    try {
      await state.query('BEGIN');
      await state.query(changeSql, [targetId]);
      await action.query('BEGIN');
      const blockedGuard = authorizeCharacterOperation(action, guardInput);
      void blockedGuard.catch(() => undefined);
      await waitForAuthorityBlock(
        actionPid,
        transition === 'restriction' ? 'FROM game.accounts' : 'FROM game.characters',
      );
      await state.query('COMMIT');
      expect(await blockedGuard).toEqual({ kind: 'denied', reason: deniedReason });
      await action.query('COMMIT');
      expect(
        (
          await owner.query('SELECT id FROM game.authority_test_actions WHERE character_id = $1', [
            characterId,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await owner.query(
            transition === 'restriction'
              ? 'SELECT access_state AS state FROM game.accounts WHERE id = $1'
              : 'SELECT life_state AS state FROM game.characters WHERE id = $1',
            [targetId],
          )
        ).rows,
      ).toEqual([{ state: transition === 'restriction' ? 'restricted' : 'dead' }]);

      await owner.query(
        transition === 'restriction'
          ? "UPDATE game.accounts SET access_state = 'active' WHERE id = $1"
          : "UPDATE game.characters SET life_state = 'alive' WHERE id = $1",
        [targetId],
      );
      await action.query('BEGIN');
      expect(await authorizeCharacterOperation(action, guardInput)).toEqual({
        kind: 'allowed',
        accountId,
        charactersEnabled: null,
      });
      const markerId = randomUUID();
      await action.query(
        'INSERT INTO game.authority_test_actions(id, character_id) VALUES ($1, $2)',
        [markerId, characterId],
      );
      await state.query('BEGIN');
      const blockedTransition = state.query(changeSql, [targetId]);
      void blockedTransition.catch(() => undefined);
      await waitForAuthorityBlock(
        statePid,
        transition === 'restriction' ? 'UPDATE game.accounts' : 'UPDATE game.characters',
      );
      await action.query('COMMIT');
      await blockedTransition;
      await state.query('COMMIT');
      expect(
        (
          await owner.query('SELECT id FROM game.authority_test_actions WHERE character_id = $1', [
            characterId,
          ])
        ).rows,
      ).toEqual([{ id: markerId }]);
      expect(
        (
          await owner.query(
            transition === 'restriction'
              ? 'SELECT access_state AS state FROM game.accounts WHERE id = $1'
              : 'SELECT life_state AS state FROM game.characters WHERE id = $1',
            [targetId],
          )
        ).rows,
      ).toEqual([{ state: transition === 'restriction' ? 'restricted' : 'dead' }]);
    } finally {
      await Promise.allSettled([action.query('ROLLBACK'), state.query('ROLLBACK')]);
      action.release();
      state.release();
      await owner.query('DELETE FROM game.authority_test_actions WHERE character_id = $1', [
        characterId,
      ]);
      await removeCharacterCandidate(id);
    }
  },
  20_000,
);

test('character eligibility reads no account and respects feature state without writing', async () => {
  const id = await characterCandidate();
  try {
    expect(await characterStore.getMe(id)).toMatchObject({
      kind: 'player',
      schemaVersion: 3,
      mode: 'onboarding',
      character: null,
      creation: { status: 'feature_disabled', notBefore: null },
    });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    expect(await characterStore.getMe(id)).toMatchObject({
      schemaVersion: 3,
      mode: 'onboarding',
      character: null,
      creation: { status: 'available', notBefore: null },
    });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('private character mode follows living state and dead history without exposing history', async () => {
  const id = await characterCandidate();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    const first = await characterStore.create(id, creationInput('First life'), randomUUID());
    expect(first.kind).toBe('created');
    if (first.kind !== 'created') return;
    await owner.query('UPDATE game.characters SET revision = 9007199254740993 WHERE id = $1', [
      first.characterId,
    ]);
    expect(await characterStore.getMe(id)).toMatchObject({
      schemaVersion: 3,
      mode: 'active',
      character: { id: first.characterId, lifeState: 'alive', revision: '9007199254740993' },
      creation: { status: 'occupied' },
    });
    await owner.query("UPDATE game.characters SET life_state = 'incapacitated' WHERE id = $1", [
      first.characterId,
    ]);
    expect(await characterStore.getMe(id)).toMatchObject({
      mode: 'incapacitated',
      character: { id: first.characterId, revision: '9007199254740993' },
      creation: { status: 'occupied' },
    });
    await owner.query("UPDATE game.characters SET life_state = 'dead' WHERE id = $1", [
      first.characterId,
    ]);
    await owner.query(
      "UPDATE game.accounts SET character_creation_not_before = clock_timestamp() + interval '1 hour' WHERE auth_user_id = $1",
      [id],
    );
    expect(await characterStore.getMe(id)).toMatchObject({
      mode: 'observer',
      character: null,
      creation: { status: 'cooldown' },
    });
    await owner.query(
      "UPDATE game.accounts SET character_creation_not_before = clock_timestamp() - interval '1 hour' WHERE auth_user_id = $1",
      [id],
    );
    expect(await characterStore.getMe(id)).toEqual({
      kind: 'player',
      schemaVersion: 3,
      mode: 'observer',
      character: null,
      creation: { status: 'available', notBefore: null },
    });
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    expect(await characterStore.getMe(id)).toMatchObject({
      mode: 'observer',
      character: null,
      creation: { status: 'feature_disabled', notBefore: null },
    });
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('stored cooldown alone keeps an account in observer mode after expiry', async () => {
  const id = await characterCandidate();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await owner.query(
      "INSERT INTO game.accounts(auth_user_id, character_creation_not_before) VALUES ($1, clock_timestamp() + interval '1 hour')",
      [id],
    );
    expect(await characterStore.getMe(id)).toMatchObject({
      mode: 'observer',
      character: null,
      creation: { status: 'cooldown' },
    });
    await owner.query(
      "UPDATE game.accounts SET character_creation_not_before = clock_timestamp() - interval '1 hour' WHERE auth_user_id = $1",
      [id],
    );
    expect(await characterStore.getMe(id)).toEqual({
      kind: 'player',
      schemaVersion: 3,
      mode: 'observer',
      character: null,
      creation: { status: 'available', notBefore: null },
    });
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('game restriction takes precedence over living state, flag, and creation receipts', async () => {
  const livingId = await characterCandidate();
  const observerId = await characterCandidate();
  const operationId = randomUUID();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    const first = await characterStore.create(
      livingId,
      creationInput('Private civilian'),
      operationId,
    );
    expect(first).toMatchObject({ kind: 'created', replayed: false });
    expect(
      await characterStore.create(livingId, creationInput('Private civilian'), operationId),
    ).toMatchObject({
      kind: 'created',
      replayed: true,
    });
    await owner.query(
      "UPDATE game.accounts SET access_state = 'restricted' WHERE auth_user_id = $1",
      [livingId],
    );
    const accountId = (
      await owner.query<{ id: string }>(
        "INSERT INTO game.accounts(auth_user_id, access_state) VALUES ($1, 'restricted') RETURNING id",
        [observerId],
      )
    ).rows[0]!.id;
    for (const enabled of [true, false]) {
      await owner.query('UPDATE ops.feature_controls SET characters = $1 WHERE singleton', [
        enabled,
      ]);
      expect(await characterStore.getMe(livingId)).toMatchObject({
        schemaVersion: 3,
        mode: 'restricted',
        character: { id: first.kind === 'created' ? first.characterId : '' },
        creation: { status: 'restricted', notBefore: null },
      });
      expect(await characterStore.getMe(observerId)).toEqual({
        kind: 'player',
        schemaVersion: 3,
        mode: 'restricted',
        character: null,
        creation: { status: 'restricted', notBefore: null },
      });
      expect(
        await characterStore.create(livingId, creationInput('Private civilian'), operationId),
      ).toEqual({
        kind: 'account_restricted',
      });
      expect(await characterStore.create(livingId, creationInput('Changed'), operationId)).toEqual({
        kind: 'account_restricted',
      });
      expect(
        await characterStore.create(livingId, creationInput('Private civilian'), randomUUID()),
      ).toEqual({
        kind: 'account_restricted',
      });
      expect(
        await characterStore.create(observerId, creationInput('New civilian'), randomUUID()),
      ).toEqual({
        kind: 'account_restricted',
      });
    }
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE id = $1', [accountId])).rowCount,
    ).toBe(1);
    expect(
      (await owner.query('SELECT id FROM game.characters WHERE account_id = $1', [accountId]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await owner.query(
          'SELECT operation_id FROM game.character_creation_receipts WHERE account_id = $1',
          [accountId],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await owner.query(
          'SELECT operation_id FROM game.character_creation_receipts WHERE account_id = (SELECT id FROM game.accounts WHERE auth_user_id = $1)',
          [livingId],
        )
      ).rows,
    ).toEqual([{ operation_id: operationId }]);
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(livingId);
    await removeCharacterCandidate(observerId);
  }
});

test('restriction committed while creation waits leaves no character or receipt', async () => {
  const id = await characterCandidate();
  const accountId = (
    await owner.query<{ id: string }>(
      'INSERT INTO game.accounts(auth_user_id) VALUES ($1) RETURNING id',
      [id],
    )
  ).rows[0]!.id;
  const state = await owner.connect();
  const statePid = (await state.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
    .pid;
  let createRequest: ReturnType<typeof characterStore.create> | null = null;
  let stateOpen = false;
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await state.query('BEGIN');
    stateOpen = true;
    await state.query("UPDATE game.accounts SET access_state = 'restricted' WHERE id = $1", [
      accountId,
    ]);
    createRequest = characterStore.create(id, creationInput('Race civilian'), randomUUID());
    void createRequest.catch(() => undefined);
    await expect
      .poll(
        async () => {
          const waiting = await owner.query<{ pid: number }>(
            `SELECT pid FROM pg_stat_activity
              WHERE usename = 'hunter_runtime' AND wait_event_type = 'Lock'
                AND position('FROM game.accounts' IN query) > 0`,
          );
          return waiting.rows[0]?.pid ?? null;
        },
        { timeout: 3_000, interval: 20 },
      )
      .toBeTypeOf('number');
    // Poll asserts the wait; inspect both connections separately as race evidence.
    const blocked = await owner.query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity
        WHERE usename = 'hunter_runtime' AND wait_event_type = 'Lock'
          AND position('FROM game.accounts' IN query) > 0`,
    );
    expect(blocked.rows).toHaveLength(1);
    expect(blocked.rows[0]!.pid).not.toBe(statePid);
    await state.query('COMMIT');
    stateOpen = false;
    expect(await createRequest).toEqual({ kind: 'account_restricted' });
    expect(
      (await owner.query('SELECT access_state FROM game.accounts WHERE id = $1', [accountId])).rows,
    ).toEqual([{ access_state: 'restricted' }]);
    expect(
      (await owner.query('SELECT id FROM game.characters WHERE account_id = $1', [accountId]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await owner.query(
          'SELECT operation_id FROM game.character_creation_receipts WHERE account_id = $1',
          [accountId],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    if (stateOpen) await state.query('ROLLBACK');
    state.release();
    if (createRequest) await Promise.allSettled([createRequest]);
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('character creation links a verified UUID once and replays the same receipt after disable', async () => {
  const id = await characterCandidate();
  const operationId = randomUUID();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    const first = await characterStore.create(id, creationInput('Civilian'), operationId);
    expect(first).toMatchObject({ kind: 'created', operationId, replayed: false });
    expect(await characterStore.getMe(id)).toMatchObject({
      creation: { status: 'occupied' },
      character: {
        id: first.kind === 'created' ? first.characterId : '',
        displayAlias: 'Civilian',
        lifeState: 'alive',
        awakeningState: 'unawakened',
        presenceState: 'sheltered',
        profileVisibility: 'private',
      },
    });
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    expect(await characterStore.create(id, creationInput('Civilian'), operationId)).toEqual({
      ...first,
      replayed: true,
    });
    expect(await characterStore.create(id, creationInput('Changed'), operationId)).toEqual({
      kind: 'operation_conflict',
    });
    expect(await characterStore.getMe(id)).toMatchObject({
      character: { id: first.kind === 'created' ? first.characterId : '' },
      creation: { status: 'feature_disabled' },
    });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(1);
    expect(
      (await owner.query('SELECT id FROM game.characters')).rows.filter(
        (row) => row.id === (first.kind === 'created' ? first.characterId : ''),
      ),
    ).toHaveLength(1);
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('creation stores exact appearance atomically and replays normalized alias only', async () => {
  const id = await characterCandidate();
  const key = randomUUID();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    const first = await characterStore.create(id, creationInput('  Cafe\u0301  '), key);
    expect(first).toMatchObject({ kind: 'created', replayed: false });
    if (first.kind !== 'created') return;
    expect(
      (
        await owner.query(
          `SELECT display_alias, catalog_version, preset_id, skin_tone_id, hair_style_id, hair_color_id
         FROM game.characters WHERE id = $1`,
          [first.characterId],
        )
      ).rows,
    ).toEqual([
      {
        display_alias: 'Café',
        catalog_version: 1,
        preset_id: 'portrait-02',
        skin_tone_id: 'tone-04',
        hair_style_id: 'coiled',
        hair_color_id: 'auburn',
      },
    ]);
    expect(await characterStore.create(id, creationInput('Café'), key)).toEqual({
      ...first,
      replayed: true,
    });
    expect(
      await characterStore.create(
        id,
        {
          displayAlias: 'Café',
          appearance: {
            ...testAppearance,
            hairColorId: 'black',
          },
        },
        key,
      ),
    ).toEqual({ kind: 'operation_conflict' });
    expect(await characterStore.getMe(id)).toMatchObject({
      schemaVersion: 3,
      character: { displayAlias: 'Café', appearance: testAppearance },
    });
    expect(
      (await owner.query('SELECT count(*)::int AS count FROM game.character_creation_receipts'))
        .rows,
    ).toEqual([{ count: 1 }]);
    const receipt = await owner.query<{ request_fingerprint: Buffer }>(
      'SELECT request_fingerprint FROM game.character_creation_receipts WHERE operation_id = $1',
      [key],
    );
    expect(receipt.rows[0]?.request_fingerprint).toEqual(
      createHash('sha256')
        .update(JSON.stringify(['Café', 1, 'portrait-02', 'tone-04', 'coiled', 'auburn']))
        .digest(),
    );
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('service rejects unsupported appearance and control aliases without inserting account or receipt', async () => {
  const id = await characterCandidate();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    for (const input of [
      { displayAlias: 'Civilian', appearance: { ...testAppearance, hairStyleId: 'unknown' } },
      { displayAlias: 'Civilian\u0007', appearance: testAppearance },
      { displayAlias: '\nCivilian', appearance: testAppearance },
      { displayAlias: '   ', appearance: testAppearance },
    ]) {
      expect(
        await characterStore.create(
          id,
          input as Parameters<typeof characterStore.create>[1],
          randomUUID(),
        ),
      ).toEqual({ kind: 'invalid_request' });
    }
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
    expect(
      (await owner.query('SELECT count(*)::int AS count FROM game.character_creation_receipts'))
        .rows,
    ).toEqual([{ count: 0 }]);
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('legacy character defaults are projected privately in v3', async () => {
  const id = await characterCandidate();
  try {
    const account = await owner.query<{ id: string }>(
      'INSERT INTO game.accounts(auth_user_id) VALUES ($1) RETURNING id',
      [id],
    );
    await owner.query(
      "INSERT INTO game.characters(account_id, display_alias) VALUES ($1, 'Legacy')",
      [account.rows[0]!.id],
    );
    expect(await characterStore.getMe(id)).toMatchObject({
      schemaVersion: 3,
      character: {
        displayAlias: 'Legacy',
        appearance: {
          catalogVersion: 1,
          presetId: 'portrait-01',
          skinToneId: 'tone-03',
          hairStyleId: 'cropped',
          hairColorId: 'black',
        },
      },
    });
  } finally {
    await removeCharacterCandidate(id);
  }
});

test('runtime may insert each constrained appearance column', async () => {
  const result = await owner.query<{ column_name: string; allowed: boolean }>(
    `SELECT column_name,
            has_column_privilege('hunter_runtime', 'game.characters', column_name, 'INSERT') AS allowed
       FROM information_schema.columns
      WHERE table_schema = 'game' AND table_name = 'characters'
        AND column_name IN ('catalog_version', 'preset_id', 'skin_tone_id', 'hair_style_id', 'hair_color_id')`,
  );
  expect(result.rows).toHaveLength(5);
  expect(result.rows.every((row) => row.allowed)).toBe(true);
});

test('alias bounds count Unicode characters as PostgreSQL does', async () => {
  const acceptedId = await characterCandidate();
  const rejectedId = await characterCandidate();
  const fortyCharacters = '😀'.repeat(40);
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    const encoding = (await owner.query<{ server_encoding: string }>('SHOW server_encoding'))
      .rows[0]!.server_encoding;
    if (encoding === 'UTF8') {
      expect(
        await characterStore.create(acceptedId, creationInput(fortyCharacters), randomUUID()),
      ).toMatchObject({
        kind: 'created',
      });
      expect(await characterStore.getMe(acceptedId)).toMatchObject({
        character: { displayAlias: fortyCharacters },
      });
    } else {
      // Windows embedded PostgreSQL uses WIN1252: reaching its encoding error
      // proves the service did not reject a 40-codepoint alias as too long.
      await expect(
        characterStore.create(acceptedId, creationInput(fortyCharacters), randomUUID()),
      ).rejects.toMatchObject({ code: '22P05' });
    }
    expect(
      await characterStore.create(rejectedId, creationInput(`${fortyCharacters}😀`), randomUUID()),
    ).toEqual({
      kind: 'invalid_request',
    });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [rejectedId]))
        .rowCount,
    ).toBe(0);
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(acceptedId);
    await removeCharacterCandidate(rejectedId);
  }
});

test('active and suspended operators cannot read or create player identity', async () => {
  const id = await characterCandidate();
  try {
    await owner.query(
      "INSERT INTO ops.operator_accounts(auth_user_id, status) VALUES ($1, 'active')",
      [id],
    );
    expect(await characterStore.getMe(id)).toEqual({ kind: 'operator_only' });
    expect(await characterStore.create(id, creationInput('Civilian'), randomUUID())).toEqual({
      kind: 'operator_only',
    });
    await owner.query(
      "UPDATE ops.operator_accounts SET status = 'suspended' WHERE auth_user_id = $1",
      [id],
    );
    expect(await characterStore.getMe(id)).toEqual({ kind: 'operator_only' });
    expect(await characterStore.create(id, creationInput('Civilian'), randomUUID())).toEqual({
      kind: 'operator_only',
    });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
  } finally {
    await removeCharacterCandidate(id);
  }
});

test('same-key and different-key concurrent creates preserve one living slot', async () => {
  const id = await characterCandidate();
  const otherId = await characterCandidate();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    const sameKey = randomUUID();
    const same = await raceBlockedCharacterCreates(id, 'Civilian', [sameKey, sameKey]);
    expect(same.map((result) => result.kind)).toEqual(['created', 'created']);
    expect(same.filter((result) => result.kind === 'created' && result.replayed)).toHaveLength(1);
    const different = await raceBlockedCharacterCreates(otherId, 'Other', [
      randomUUID(),
      randomUUID(),
    ]);
    expect(different.filter((result) => result.kind === 'created')).toHaveLength(1);
    expect(different.filter((result) => result.kind === 'occupied')).toHaveLength(1);
    expect(
      (
        await owner.query(
          "SELECT id FROM game.characters WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id = $1) AND life_state IN ('alive', 'incapacitated')",
          [id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await owner.query(
          "SELECT id FROM game.characters WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id = $1) AND life_state IN ('alive', 'incapacitated')",
          [otherId],
        )
      ).rowCount,
    ).toBe(1);
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
    await removeCharacterCandidate(otherId);
  }
});

async function raceBlockedCharacterCreates(
  authUserId: string,
  alias: string,
  operationIds: [string, string],
) {
  const blocker = await owner.connect();
  let requests:
    [ReturnType<typeof characterStore.create>, ReturnType<typeof characterStore.create>] | null =
    null;
  try {
    await blocker.query('BEGIN');
    await blocker.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('operator-account:' || $1::uuid::text, 0))",
      [authUserId],
    );
    requests = [
      characterStore.create(authUserId, creationInput(alias), operationIds[0]),
      characterStore.create(authUserId, creationInput(alias), operationIds[1]),
    ];
    const backendPids = await waitForBlockedRuntimeCreates();
    expect(new Set(backendPids).size).toBe(2);
    await blocker.query('COMMIT');
    return await Promise.all(requests);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    if (requests) await Promise.allSettled(requests);
  }
}

async function waitForBlockedRuntimeCreates(): Promise<number[]> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const blocked = await owner.query<{ pid: number }>(
      `SELECT DISTINCT activity.pid
         FROM pg_stat_activity activity
         JOIN pg_locks locks ON locks.pid = activity.pid
        WHERE activity.usename = 'hunter_runtime'
          AND activity.wait_event_type = 'Lock'
          AND locks.locktype = 'advisory' AND NOT locks.granted
          AND position('operator-account:' IN activity.query) > 0`,
    );
    if (blocked.rows.length === 2) return blocked.rows.map((row) => row.pid);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Two runtime backends did not contend for the character creation lock');
}

test('unverified, banned, and missing Auth identities cannot gain or replay a receipt', async () => {
  const id = randomUUID();
  await owner.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [
    id,
    `${id}@example.test`,
  ]);
  const key = randomUUID();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    expect(await characterStore.getMe(id)).toEqual({ kind: 'auth_ineligible' });
    expect(await characterStore.create(id, creationInput('Civilian'), key)).toEqual({
      kind: 'auth_ineligible',
    });
    await owner.query('UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1', [id]);
    await setPilotStatus(`${id}@example.test`, true);
    expect(await characterStore.create(id, creationInput('Civilian'), key)).toMatchObject({
      kind: 'created',
    });
    await owner.query(
      "UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 day' WHERE id = $1",
      [id],
    );
    expect(await characterStore.getMe(id)).toEqual({ kind: 'auth_ineligible' });
    expect(await characterStore.create(id, creationInput('Civilian'), key)).toEqual({
      kind: 'auth_ineligible',
    });
    expect(
      await characterStore.create(randomUUID(), creationInput('Civilian'), randomUUID()),
    ).toEqual({
      kind: 'auth_ineligible',
    });
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('incapacitation occupies the slot; dead history stays private through cooldown', async () => {
  const id = await characterCandidate();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    const first = await characterStore.create(id, creationInput('First'), randomUUID());
    expect(first.kind).toBe('created');
    if (first.kind !== 'created') return;
    await owner.query("UPDATE game.characters SET life_state = 'incapacitated' WHERE id = $1", [
      first.characterId,
    ]);
    expect(await characterStore.getMe(id)).toMatchObject({
      character: { id: first.characterId, lifeState: 'incapacitated' },
      creation: { status: 'occupied' },
    });
    expect(await characterStore.create(id, creationInput('Second'), randomUUID())).toEqual({
      kind: 'occupied',
    });
    await owner.query("UPDATE game.characters SET life_state = 'dead' WHERE id = $1", [
      first.characterId,
    ]);
    await owner.query(
      "UPDATE game.accounts SET character_creation_not_before = clock_timestamp() + interval '1 hour' WHERE auth_user_id = $1",
      [id],
    );
    const me = await characterStore.getMe(id);
    expect(me).toMatchObject({ character: null, creation: { status: 'cooldown' } });
    expect(await characterStore.create(id, creationInput('Second'), randomUUID())).toMatchObject({
      kind: 'cooldown',
    });
    await owner.query(
      "UPDATE game.accounts SET character_creation_not_before = clock_timestamp() - interval '1 millisecond' WHERE auth_user_id = $1",
      [id],
    );
    expect(await characterStore.getMe(id)).toMatchObject({ creation: { status: 'available' } });
    const second = await characterStore.create(id, creationInput('Second'), randomUUID());
    expect(second).toMatchObject({ kind: 'created', replayed: false });
    expect(
      (
        await owner.query(
          'SELECT id, life_state FROM game.characters WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id = $1)',
          [id],
        )
      ).rows,
    ).toMatchObject([
      { id: first.characterId, life_state: 'dead' },
      { id: second.kind === 'created' ? second.characterId : '', life_state: 'alive' },
    ]);
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('a new Auth UUID with the same email never inherits detached character history', async () => {
  const email = `${randomUUID()}@example.test`;
  const oldId = await characterCandidate(email);
  let newId: string | null = null;
  let oldAccountId: string | null = null;
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    const old = await characterStore.create(oldId, creationInput('Old life'), randomUUID());
    expect(old.kind).toBe('created');
    oldAccountId = (
      await owner.query<{ id: string }>('SELECT id FROM game.accounts WHERE auth_user_id = $1', [
        oldId,
      ])
    ).rows[0]!.id;
    await owner.query('DELETE FROM auth.users WHERE id = $1', [oldId]);
    newId = await characterCandidate(email);
    expect(await characterStore.getMe(newId)).toMatchObject({
      character: null,
      creation: { status: 'available' },
    });
    const fresh = await characterStore.create(newId, creationInput('New life'), randomUUID());
    expect(fresh).toMatchObject({ kind: 'created' });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [newId])).rows[0]
        ?.id,
    ).not.toBe(oldAccountId);
    expect(
      (await owner.query('SELECT auth_user_id FROM game.accounts WHERE id = $1', [oldAccountId]))
        .rows,
    ).toEqual([{ auth_user_id: null }]);
  } finally {
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    if (newId) await removeCharacterCandidate(newId);
    if (oldAccountId) {
      await owner.query('DELETE FROM game.character_creation_receipts WHERE account_id = $1', [
        oldAccountId,
      ]);
      await owner.query('DELETE FROM game.characters WHERE account_id = $1', [oldAccountId]);
      await owner.query('DELETE FROM game.accounts WHERE id = $1', [oldAccountId]);
    }
  }
});

test('failed receipt insertion rolls back first link and character', async () => {
  const id = await characterCandidate();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await owner.query(
      `CREATE FUNCTION game.reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt rejected'; END $$`,
    );
    await owner.query(
      'CREATE TRIGGER reject_test_receipt BEFORE INSERT ON game.character_creation_receipts FOR EACH ROW EXECUTE FUNCTION game.reject_test_receipt()',
    );
    await expect(
      characterStore.create(id, creationInput('Civilian'), randomUUID()),
    ).rejects.toThrow('receipt rejected');
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
    expect(
      (await owner.query('SELECT operation_id FROM game.character_creation_receipts')).rowCount,
    ).toBe(0);
  } finally {
    await owner.query(
      'DROP TRIGGER IF EXISTS reject_test_receipt ON game.character_creation_receipts',
    );
    await owner.query('DROP FUNCTION IF EXISTS game.reject_test_receipt()');
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

async function waitForBlockedQuery(fragment: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const waiting = await owner.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'
            AND position($1 IN query) > 0
       ) AS blocked`,
      [fragment],
    );
    if (waiting.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for blocked query: ${fragment}`);
}

test('audited operator assignment ordered first denies a waiting creation', async () => {
  const id = await characterCandidate();
  const blocker = await owner.connect();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await blocker.query('BEGIN');
    await blocker.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('operator-account:' || $1::uuid::text, 0))",
      [id],
    );
    await blocker.query(prepareOperatorStatusChange(operatorRequest(id)));
    const create = characterStore.create(id, creationInput('Civilian'), randomUUID());
    await waitForBlockedQuery('operator-account:');
    await blocker.query('COMMIT');
    expect(await create).toEqual({ kind: 'operator_only' });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('creation ordered first commits before audited operator assignment', async () => {
  const id = await characterCandidate();
  const blocker = await owner.connect();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await blocker.query('BEGIN');
    await blocker.query('SELECT singleton FROM ops.feature_controls WHERE singleton FOR UPDATE');
    const create = characterStore.create(id, creationInput('Civilian'), randomUUID());
    await waitForBlockedQuery('FROM ops.feature_controls WHERE singleton FOR SHARE');
    const assignment = owner.query(prepareOperatorStatusChange(operatorRequest(id)));
    void assignment.catch(() => undefined);
    await waitForBlockedQuery('SELECT ops.set_operator_status');
    await blocker.query('COMMIT');
    expect(await create).toMatchObject({ kind: 'created' });
    await assignment;
    expect(await characterStore.getMe(id)).toEqual({ kind: 'operator_only' });
    expect(await characterStore.create(id, creationInput('Another'), randomUUID())).toEqual({
      kind: 'operator_only',
    });
    expect(
      (
        await owner.query(
          "SELECT id FROM game.characters WHERE account_id IN (SELECT id FROM game.accounts WHERE auth_user_id = $1) AND life_state IN ('alive', 'incapacitated')",
          [id],
        )
      ).rowCount,
    ).toBe(1);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('feature disable ordered first denies a waiting creation', async () => {
  const id = await characterCandidate();
  const blocker = await owner.connect();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await blocker.query('BEGIN');
    await blocker.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    const create = characterStore.create(id, creationInput('Civilian'), randomUUID());
    await waitForBlockedQuery('FROM ops.feature_controls WHERE singleton FOR SHARE');
    await blocker.query('COMMIT');
    expect(await create).toEqual({ kind: 'disabled' });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('creation ordered first commits before feature disable', async () => {
  const id = await characterCandidate();
  const blocker = await owner.connect();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await blocker.query('BEGIN');
    await blocker.query('UPDATE auth.users SET banned_until = NULL WHERE id = $1', [id]);
    const create = characterStore.create(id, creationInput('Civilian'), randomUUID());
    await waitForBlockedQuery('lock_eligible_auth_user');
    const disable = owner.query(
      'UPDATE ops.feature_controls SET characters = false WHERE singleton',
    );
    await waitForBlockedQuery('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await blocker.query('COMMIT');
    expect(await create).toMatchObject({ kind: 'created' });
    await disable;
    expect(await characterStore.getMe(id)).toMatchObject({
      creation: { status: 'feature_disabled' },
    });
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('provider ban ordered first denies a waiting creation', async () => {
  const id = await characterCandidate();
  const blocker = await owner.connect();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await blocker.query('BEGIN');
    await blocker.query(
      "UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 day' WHERE id = $1",
      [id],
    );
    const create = characterStore.create(id, creationInput('Civilian'), randomUUID());
    await waitForBlockedQuery('lock_eligible_auth_user');
    await blocker.query('COMMIT');
    expect(await create).toEqual({ kind: 'auth_ineligible' });
    expect(
      (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id = $1', [id])).rowCount,
    ).toBe(0);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

test('creation ordered first commits before provider ban', async () => {
  const id = await characterCandidate();
  const blocker = await owner.connect();
  try {
    await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
    await owner.query('INSERT INTO game.accounts(auth_user_id) VALUES ($1)', [id]);
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM game.accounts WHERE auth_user_id = $1 FOR UPDATE', [id]);
    const create = characterStore.create(id, creationInput('Civilian'), randomUUID());
    await waitForBlockedQuery('FROM game.accounts WHERE auth_user_id =');
    const ban = owner.query(
      "UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 day' WHERE id = $1",
      [id],
    );
    await waitForBlockedQuery('UPDATE auth.users SET banned_until');
    await blocker.query('COMMIT');
    expect(await create).toMatchObject({ kind: 'created' });
    await ban;
    expect(await characterStore.getMe(id)).toEqual({ kind: 'auth_ineligible' });
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await owner.query('UPDATE ops.feature_controls SET characters = false WHERE singleton');
    await removeCharacterCandidate(id);
  }
});

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
