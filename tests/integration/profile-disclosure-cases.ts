import { describe, expect, test } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type {
  ProfileStore,
  ProfileStoreResult,
} from '../../packages/database/src/profile-disclosure.js';

export function registerProfileDisclosureTests(context: {
  owner: Pool;
  runtime: Pool;
  createCandidate: (email?: string, pilot?: boolean) => Promise<string>;
  removeCandidate: (authUserId: string) => Promise<void>;
}): void {
  const { owner, runtime } = context;
  const store = async () =>
    (await import('../../packages/database/src/index.js')).createProfileStore(runtime);
  function success<T>(result: ProfileStoreResult<T>): T {
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') throw new Error(result.kind);
    return result.value;
  }
  async function fixture(pilot = true) {
    const id = await context.createCandidate(undefined, pilot);
    const accountId = (
      await owner.query('INSERT INTO game.accounts(auth_user_id) VALUES ($1) RETURNING id', [id])
    ).rows[0].id as string;
    const characterId = (
      await owner.query(
        "INSERT INTO game.characters(account_id, display_alias) VALUES ($1,'Synthetic civilian') RETURNING id",
        [accountId],
      )
    ).rows[0].id as string;
    return { id, accountId, characterId };
  }
  const draft = (
    characterId: string,
    expectedRevision: string,
    visibility: 'private' | 'limited' | 'public' = 'public',
  ) => ({
    characterId,
    expectedRevision,
    visibility,
    showFictionalAvatar: false,
    showRegistrationDate: false,
  });
  async function withFixture(action: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
    const f = await fixture();
    try {
      await owner.query('UPDATE ops.feature_controls SET profile_disclosure=true');
      await action(f);
    } finally {
      await owner.query('UPDATE ops.feature_controls SET profile_disclosure=false');
      await context.removeCandidate(f.id);
    }
  }
  async function state(characterId: string) {
    return (
      await owner.query(
        'SELECT revision::text,disclosure_revision::text,public_reference,profile_visibility,show_fictional_avatar,show_registration_date FROM game.characters WHERE id=$1',
        [characterId],
      )
    ).rows[0];
  }
  function latch() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  }
  async function checkpoint(
    signal: Promise<void>,
    operations: readonly Promise<unknown>[],
    label: string,
  ) {
    await Promise.race([
      signal,
      ...operations.map((operation) =>
        operation.then(() => {
          throw new Error(`Operation completed before ${label}`);
        }),
      ),
    ]);
  }
  type ObservedSession = { pid: number; connection: number };
  function sessionPool(
    after: (
      session: ObservedSession,
      sql: string,
      args: unknown[],
      result: QueryResult,
    ) => Promise<void>,
  ) {
    let connections = 0;
    const wrapped = Object.create(runtime) as Pool;
    wrapped.connect = (async () => {
      const client = await runtime.connect();
      const session = {
        pid: (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid,
        connection: ++connections,
      };
      return new Proxy(client, {
        get(target, key) {
          if (key === 'query')
            return async (...args: unknown[]) => {
              const result = await (
                target.query as (...args: unknown[]) => Promise<QueryResult>
              ).apply(target, args);
              if (typeof args[0] === 'string') await after(session, args[0], args, result);
              return result;
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }) as Pool['connect'];
    return wrapped;
  }
  async function forcedMutationRace<T, U>(
    firstAction: (profiles: ProfileStore) => Promise<ProfileStoreResult<T>>,
    secondAction: (profiles: ProfileStore) => Promise<ProfileStoreResult<U>>,
    inspectUncommitted: () => Promise<void>,
  ) {
    const preflightsDone = latch();
    const receiptInserted = latch();
    const loserBegan = latch();
    const preflightRelease = [latch(), latch()];
    const winnerRelease = latch();
    const preflightMisses: number[][] = [[], []];
    const freshReceiptRows: number[][] = [[], []];
    const freshBeginCounts: number[] = [];
    const inserts = [0, 0];
    const freshPids: number[] = [];
    let committedPreflights = 0;
    const pools = [0, 1].map((side) =>
      sessionPool(async (session, sql, _args, result) => {
        if (sql.includes('FROM game.profile_operation_receipts')) {
          (session.connection === 1 ? preflightMisses : freshReceiptRows)[side]!.push(
            result.rowCount!,
          );
        }
        if (session.connection === 1 && sql === 'COMMIT') {
          expect(preflightMisses[side]).toEqual([0]);
          committedPreflights++;
          if (committedPreflights === 2) preflightsDone.release();
          // The real COMMIT has returned and released every preflight lock.
          await preflightRelease[side]!.promise;
        }
        if (session.connection === 2 && sql === 'BEGIN') {
          freshBeginCounts.push(committedPreflights);
          freshPids[side] = session.pid;
          if (side === 1) loserBegan.release();
        }
        if (sql.includes('INSERT INTO game.profile_operation_receipts')) {
          inserts[side]!++;
          if (side === 0) {
            receiptInserted.release();
            await winnerRelease.promise;
          }
        }
      }),
    );
    const module = await import('../../packages/database/src/index.js');
    const first = firstAction(module.createProfileStore(pools[0]!));
    const second = secondAction(module.createProfileStore(pools[1]!));
    void first.catch(() => undefined);
    void second.catch(() => undefined);
    try {
      await checkpoint(preflightsDone.promise, [first, second], 'both absent preflight commits');
      expect(preflightMisses).toEqual([[0], [0]]);
      expect(freshBeginCounts).toEqual([]);
      preflightRelease[0]!.release();
      await checkpoint(receiptInserted.promise, [first, second], 'fresh winner receipt insert');
      expect(freshReceiptRows[0]).toEqual([0]);
      expect(inserts).toEqual([1, 0]);
      await inspectUncommitted();
      preflightRelease[1]!.release();
      await checkpoint(loserBegan.promise, [first, second], 'fresh contender BEGIN');
      await expect
        .poll(
          async () =>
            (
              await owner.query<{ blockers: number[]; query: string }>(
                "SELECT pg_blocking_pids(pid) AS blockers,query FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",
                [freshPids[1]],
              )
            ).rows[0]?.blockers,
          { timeout: 3000, interval: 20 },
        )
        .toContain(freshPids[0]);
      const waiting = (
        await owner.query<{ query: string }>(
          "SELECT query FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",
          [freshPids[1]],
        )
      ).rows[0]!;
      expect(waiting.query).toContain('operator-account:');
      expect(
        (
          await owner.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND granted",
            [freshPids[1]],
          )
        ).rows[0]!.n,
      ).toBe(0);
      winnerRelease.release();
      const results = await Promise.all([first, second]);
      expect(freshBeginCounts).toEqual([2, 2]);
      expect(inserts).toEqual([1, 0]);
      expect(freshReceiptRows[0]).toEqual([0, 1]);
      expect(freshReceiptRows[1]).toHaveLength(1);
      return { results, freshReceiptRows };
    } finally {
      for (const gate of preflightRelease) gate.release();
      winnerRelease.release();
      await Promise.allSettled([first, second]);
    }
  }
  function barrierStore(fragment: string) {
    let arrived!: () => void;
    let resume!: () => void;
    const atBarrier = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const released = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let used = false;
    const wrapped = Object.create(runtime) as Pool;
    wrapped.connect = (async () => {
      const client = await runtime.connect();
      return new Proxy(client, {
        get(target, key) {
          if (key === 'query')
            return async (...args: unknown[]) => {
              const result = await (target.query as (...args: unknown[]) => Promise<unknown>).apply(
                target,
                args,
              );
              if (!used && typeof args[0] === 'string' && args[0].includes(fragment)) {
                used = true;
                arrived();
                await released;
              }
              return result;
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }) as Pool['connect'];
    return { wrapped, atBarrier, resume };
  }
  async function blocked(fragment: string) {
    await expect
      .poll(
        async () =>
          (
            await owner.query(
              "SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename IN ('hunter_runtime','postgres') AND wait_event_type='Lock' AND position($1 IN query)>0",
              [fragment],
            )
          ).rows[0].n,
        { timeout: 3000, interval: 20 },
      )
      .toBeGreaterThan(0);
  }
  async function trustedChange(
    f: Awaited<ReturnType<typeof fixture>>,
    kind: string,
    client: PoolClient,
  ) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('operator-account:' || $1::uuid::text,0))",
      [f.id],
    );
    if (kind === 'gate')
      await client.query('UPDATE ops.feature_controls SET profile_disclosure=false');
    await client.query('SELECT id FROM auth.users WHERE id=$1::uuid FOR UPDATE', [f.id]);
    if (kind === 'provider')
      await client.query('UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id=$1', [f.id]);
    if (kind === 'grant')
      await client.query(
        'UPDATE ops.character_pilot_access SET enabled=false WHERE auth_user_id=$1',
        [f.id],
      );
    await client.query('SELECT id FROM game.accounts WHERE id=$1 FOR UPDATE', [f.accountId]);
    if (kind === 'restriction')
      await client.query("UPDATE game.accounts SET access_state='restricted' WHERE id=$1", [
        f.accountId,
      ]);
    if (kind === 'death')
      await client.query(
        "UPDATE game.characters SET life_state='dead',revision=revision+1 WHERE id=$1",
        [f.characterId],
      );
    if (kind === 'operator')
      await client.query(
        "INSERT INTO ops.operator_accounts(auth_user_id,status) VALUES ($1,'active')",
        [f.id],
      );
    if (kind === 'detach')
      await client.query('UPDATE game.accounts SET auth_user_id=NULL WHERE id=$1', [f.accountId]);
  }
  describe('profile-disclosure', () => {
    test('schema_defaults_and_private_runtime_boundary', async () => {
      const columns = await context.owner.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='game' AND table_name='characters' AND column_name IN ('show_fictional_avatar','show_registration_date','disclosure_revision','public_reference')",
      );
      expect(columns.rowCount).toBe(4);
      expect(
        (await context.owner.query('SELECT profile_disclosure FROM ops.feature_controls')).rows,
      ).toEqual([{ profile_disclosure: false }]);
      expect(
        (await context.owner.query("SELECT to_regclass('game.profile_invitations')::text AS name"))
          .rows[0]?.name,
      ).toBe('game.profile_invitations');
    });
    test('owner_defaults_are_photo_free_and_no_account_is_created', async () => {
      const id = await context.createCandidate(undefined, false);
      try {
        const { createProfileStore } = await import('../../packages/database/src/index.js');
        expect(await createProfileStore(context.runtime).getOwner(id)).toMatchObject({
          kind: 'success',
          value: { status: 'no_living_profile', profile: null, controls: { canWithdraw: false } },
        });
        expect(
          (await context.owner.query('SELECT id FROM game.accounts WHERE auth_user_id=$1', [id]))
            .rowCount,
        ).toBe(0);
      } finally {
        await context.removeCandidate(id);
      }
    });
    test('same_revision_has_one_winner', async () =>
      withFixture(async (f) => {
        const before = await state(f.characterId);
        const winnerOp = randomUUID();
        const { results, freshReceiptRows } = await forcedMutationRace(
          (s) => s.update(f.id, draft(f.characterId, '0'), winnerOp),
          (s) => s.update(f.id, draft(f.characterId, '0', 'limited'), randomUUID()),
          async () => {
            expect(await state(f.characterId)).toEqual(before);
            expect(
              (
                await owner.query(
                  'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                  [f.accountId],
                )
              ).rowCount,
            ).toBe(0);
          },
        );
        expect(results.map((r) => r.kind)).toEqual(['success', 'stale_revision']);
        expect(freshReceiptRows[1]).toEqual([0]);
        expect(await state(f.characterId)).toMatchObject({
          revision: '1',
          disclosure_revision: '1',
        });
        expect(
          (
            await owner.query(
              'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
              [f.accountId],
            )
          ).rowCount,
        ).toBe(1);
        expect((await state(f.characterId)).public_reference).not.toBe(before.public_reference);
        expect(success(results[0]).receipt.operationId).toBe(winnerOp);
      }));
    test('identical_uuid_replays_once', async () =>
      withFixture(async (f) => {
        const s = await store();
        const op = randomUUID();
        const input = draft(f.characterId, '0');
        const before = await state(f.characterId);
        const { results, freshReceiptRows } = await forcedMutationRace(
          (target) => target.update(f.id, input, op),
          (target) => target.update(f.id, input, op.toUpperCase()),
          async () => {
            expect(await state(f.characterId)).toEqual(before);
            expect(
              (
                await owner.query(
                  'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                  [f.accountId],
                )
              ).rowCount,
            ).toBe(0);
          },
        );
        expect(freshReceiptRows[1]).toEqual([1]);
        expect(results.map((r) => success(r).replayed)).toEqual([false, true]);
        expect(success(results[1]).receipt).toEqual(success(results[0]).receipt);
        expect(success(results[1]).current).toEqual(success(results[0]).current);
        expect(await state(f.characterId)).toMatchObject({
          revision: '1',
          disclosure_revision: '1',
        });
        const stored = (
          await owner.query(
            'SELECT request_digest FROM game.profile_operation_receipts WHERE account_id=$1 AND operation_id=$2',
            [f.accountId, op],
          )
        ).rows[0];
        expect(stored.request_digest).toEqual(
          createHash('sha256')
            .update(
              JSON.stringify([
                'civilian-profile-v1',
                'profile.update',
                f.characterId,
                '0',
                'public',
                false,
                false,
                null,
                null,
              ]),
            )
            .digest(),
        );
        expect(
          success(await s.update(f.id, { ...input, characterId: f.characterId.toUpperCase() }, op))
            .replayed,
        ).toBe(true);
        expect(await s.update(f.id, { ...input, showFictionalAvatar: true }, op)).toEqual({
          kind: 'operation_conflict',
        });
      }));
    test('same_uuid_changed_terms_conflict_in_fresh_recheck', async () =>
      withFixture(async (f) => {
        const op = randomUUID();
        const before = await state(f.characterId);
        const { results, freshReceiptRows } = await forcedMutationRace(
          (s) => s.update(f.id, draft(f.characterId, '0'), op),
          (s) => s.update(f.id, draft(f.characterId, '0', 'limited'), op),
          async () => {
            expect(await state(f.characterId)).toEqual(before);
            expect(
              (
                await owner.query(
                  'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                  [f.accountId],
                )
              ).rowCount,
            ).toBe(0);
          },
        );
        expect(results.map((r) => r.kind)).toEqual(['success', 'operation_conflict']);
        expect(freshReceiptRows[1]).toEqual([1]);
        expect(await state(f.characterId)).toMatchObject({
          revision: '1',
          disclosure_revision: '1',
          profile_visibility: 'public',
        });
        expect((await state(f.characterId)).public_reference).not.toBe(before.public_reference);
        expect(
          (
            await owner.query(
              'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
              [f.accountId],
            )
          ).rows,
        ).toEqual([{ operation_id: op }]);
      }));
    test('replay_never_reapplies', async () =>
      withFixture(async (f) => {
        const s = await store();
        const op = randomUUID();
        const input = draft(f.characterId, '0');
        const first = success(await s.update(f.id, input, op));
        success(await s.withdraw(f.id, { scope: 'all-owned-profiles' }, randomUUID()));
        const reduced = await state(f.characterId);
        await owner.query("UPDATE game.accounts SET access_state='restricted' WHERE id=$1", [
          f.accountId,
        ]);
        await owner.query('UPDATE ops.feature_controls SET profile_disclosure=false');
        const replay = success(await s.update(f.id, input, op));
        expect(replay.receipt).toEqual(first.receipt);
        expect(replay.replayed).toBe(true);
        expect(replay.current.profile?.visibility).toBe('private');
        expect(await state(f.characterId)).toEqual(reduced);
      }));
    test('withdrawal_is_refusal_barrier', async () =>
      withFixture(async (f) => {
        const s = await store();
        const before = await state(f.characterId);
        const op = randomUUID();
        const stopped = success(await s.withdraw(f.id, { scope: 'all-owned-profiles' }, op));
        expect(stopped.receipt).toMatchObject({
          subject: 'account',
          character: null,
          invitation: null,
          affectedProfileCount: 1,
        });
        expect(await state(f.characterId)).toMatchObject({
          revision: '1',
          disclosure_revision: '1',
          profile_visibility: 'private',
        });
        expect((await state(f.characterId)).public_reference).not.toBe(before.public_reference);
        expect(await s.update(f.id, draft(f.characterId, '0'), randomUUID())).toEqual({
          kind: 'stale_revision',
        });
        success(await s.update(f.id, draft(f.characterId, '1'), randomUUID()));
        const fresh = await state(f.characterId);
        expect(success(await s.withdraw(f.id, { scope: 'all-owned-profiles' }, op)).replayed).toBe(
          true,
        );
        expect(await state(f.characterId)).toEqual(fresh);
      }));
    test('withdrawal_is_refusal_barrier_for_pending_publication', async () =>
      withFixture(async (f) => {
        const barrier = barrierStore('INSERT INTO game.profile_operation_receipts');
        const paused = (await import('../../packages/database/src/index.js')).createProfileStore(
          barrier.wrapped,
        );
        const s = await store();
        const before = await state(f.characterId);
        const withdrawal = paused.withdraw(f.id, { scope: 'all-owned-profiles' }, randomUUID());
        let publication: ReturnType<typeof s.update> | undefined;
        try {
          await barrier.atBarrier;
          publication = s.update(f.id, draft(f.characterId, '0'), randomUUID());
          await blocked('operator-account:');
          barrier.resume();
          success(await withdrawal);
          expect(await publication).toEqual({ kind: 'stale_revision' });
          expect(await state(f.characterId)).toMatchObject({
            revision: '1',
            disclosure_revision: '1',
            profile_visibility: 'private',
          });
          expect((await state(f.characterId)).public_reference).not.toBe(before.public_reference);
          expect(
            (
              await owner.query(
                'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                [f.accountId],
              )
            ).rowCount,
          ).toBe(1);
        } finally {
          barrier.resume();
          await Promise.allSettled([withdrawal, ...(publication ? [publication] : [])]);
        }
      }));
    test('pure_replay_needs_no_character_write_lock_and_fresh_action_starts_with_update', async () =>
      withFixture(async (f) => {
        const s = await store();
        const op = randomUUID();
        const input = draft(f.characterId, '0');
        success(await s.update(f.id, input, op));
        const probe = await owner.connect();
        let open = false;
        let pending: ReturnType<typeof s.update> | undefined;
        try {
          await probe.query('BEGIN');
          open = true;
          await probe.query('SELECT id FROM game.accounts WHERE id=$1 FOR SHARE', [f.accountId]);
          await probe.query('SELECT id FROM game.characters WHERE id=$1 FOR SHARE', [
            f.characterId,
          ]);
          expect(success(await s.update(f.id, input, op)).replayed).toBe(true);
          expect(await s.update(f.id, { ...input, showRegistrationDate: true }, op)).toEqual({
            kind: 'operation_conflict',
          });
          pending = s.update(f.id, draft(f.characterId, '1'), randomUUID());
          await blocked('FROM game.accounts WHERE auth_user_id');
          const query = (
            await owner.query(
              "SELECT query FROM pg_stat_activity WHERE usename='hunter_runtime' AND wait_event_type='Lock' AND position('FROM game.accounts WHERE auth_user_id' IN query)>0",
            )
          ).rows[0].query;
          expect(query).toContain('FOR UPDATE');
          await probe.query('COMMIT');
          open = false;
          success(await pending);
          expect(await state(f.characterId)).toMatchObject({
            revision: '2',
            disclosure_revision: '2',
          });
        } finally {
          if (open) await probe.query('ROLLBACK');
          if (pending) await Promise.allSettled([pending]);
          probe.release();
        }
      }));
    test('reference_and_policy_transitions', async () =>
      withFixture(async (f) => {
        const s = await store();
        let previous = await state(f.characterId);
        for (const visibility of ['limited', 'public', 'private', 'public'] as const) {
          success(
            await s.update(f.id, draft(f.characterId, previous.revision, visibility), randomUUID()),
          );
          const next = await state(f.characterId);
          expect(next.public_reference).not.toBe(previous.public_reference);
          previous = next;
        }
        const updated = success(
          await s.update(
            f.id,
            {
              ...draft(f.characterId, previous.revision),
              showFictionalAvatar: true,
              showRegistrationDate: true,
            },
            randomUUID(),
          ),
        );
        expect(updated.current.profile?.publicReference).toBe(previous.public_reference);
        const outward = success(await s.getPublic(f.id, previous.public_reference));
        expect(Object.keys(outward).sort()).toEqual([
          'appearance',
          'displayAlias',
          'identityLabel',
          'registrationDate',
          'schemaVersion',
        ]);
        expect(outward.registrationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const revoked = success(
          await s.revoke(
            f.id,
            {
              characterId: f.characterId,
              expectedRevision: updated.current.profile!.characterRevision,
            },
            randomUUID(),
          ),
        );
        expect(revoked.current.profile?.visibility).toBe('public');
        expect(revoked.current.profile?.publicReference).not.toBe(previous.public_reference);
        expect(await s.getPublic(f.id, previous.public_reference)).toEqual({
          kind: 'profile_unavailable',
        });
      }));
    test('issue_digest_only_ten_server_minutes_and_raw_once', async () =>
      withFixture(async (f) => {
        const s = await store();
        success(await s.update(f.id, draft(f.characterId, '0', 'limited'), randomUUID()));
        const op = randomUUID();
        const input = {
          characterId: f.characterId,
          expectedRevision: '1',
          scope: 'profile.view' as const,
          mode: 'generate' as const,
        };
        const issued = success(await s.issue(f.id, input, op));
        expect(issued.tokenDelivery.status).toBe('delivered');
        if (issued.tokenDelivery.status !== 'delivered') throw new Error('missing token');
        const row = (
          await owner.query('SELECT * FROM game.profile_invitations WHERE character_id=$1', [
            f.characterId,
          ])
        ).rows[0];
        expect(row.token_digest).toEqual(
          createHash('sha256').update(issued.tokenDelivery.token).digest(),
        );
        expect(row.expires_at - row.issued_at).toBe(600000);
        expect(JSON.stringify(row)).not.toContain(issued.tokenDelivery.token);
        expect(
          success(await s.resolve(f.id, { token: issued.tokenDelivery.token })).profile
            .identityLabel,
        ).toBe('Civilian');
        expect(success(await s.issue(f.id, input, op)).tokenDelivery).toEqual({
          status: 'unavailable',
        });
        expect(await s.issue(f.id, { ...input, expectedRevision: '2' }, randomUUID())).toEqual({
          kind: 'invitation_exists',
        });
        success(
          await s.revoke(f.id, { characterId: f.characterId, expectedRevision: '2' }, randomUUID()),
        );
        expect(await s.resolve(f.id, { token: issued.tokenDelivery.token })).toEqual({
          kind: 'profile_unavailable',
        });
      }));
    test('gate_grant_life_provider_operator_and_foreign_boundaries', async () =>
      withFixture(async (f) => {
        const s = await store();
        await owner.query('UPDATE ops.feature_controls SET profile_disclosure=false');
        expect(await s.update(f.id, draft(f.characterId, '0', 'private'), randomUUID())).toEqual({
          kind: 'sharing_unavailable',
        });
        expect(success(await s.getOwner(f.id)).controls.canWithdraw).toBe(true);
        success(await s.withdraw(f.id, { scope: 'all-owned-profiles' }, randomUUID()));
        await owner.query('UPDATE ops.feature_controls SET profile_disclosure=true');
        await owner.query("UPDATE game.characters SET awakening_state='awakened' WHERE id=$1", [
          f.characterId,
        ]);
        expect(success(await s.getOwner(f.id))).toMatchObject({
          status: 'unsupported_official_id',
          profile: null,
        });
        expect(await s.update(f.id, draft(f.characterId, '1'), randomUUID())).toEqual({
          kind: 'character_unavailable',
        });
        await owner.query(
          "UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=$1",
          [f.id],
        );
        expect(await s.withdraw(f.id, { scope: 'all-owned-profiles' }, randomUUID())).toEqual({
          kind: 'auth_ineligible',
        });
      }));
    test('exact_legacy_backfill_in_rolled_back_prior_schema', async () => {
      const sql = await readFile(
        new URL('../../supabase/migrations/20261002000100_profile_disclosure.sql', import.meta.url),
        'utf8',
      );
      const client = await owner.connect();
      try {
        await client.query('BEGIN');
        await client.query('DROP TABLE game.profile_operation_receipts');
        await client.query('DROP FUNCTION game.prevent_profile_receipt_rewrite()');
        await client.query('DROP TABLE game.profile_invitations');
        await client.query(
          'ALTER TABLE game.characters DROP COLUMN show_fictional_avatar,DROP COLUMN show_registration_date,DROP COLUMN disclosure_revision,DROP COLUMN public_reference,DROP CONSTRAINT characters_id_account_unique',
        );
        await client.query('ALTER TABLE ops.feature_controls DROP COLUMN profile_disclosure');
        const account = (
          await client.query('INSERT INTO game.accounts DEFAULT VALUES RETURNING id')
        ).rows[0].id;
        const legacy = (
          await client.query(
            "INSERT INTO game.characters(account_id,display_alias,profile_visibility) VALUES ($1,'Legacy synthetic','public') RETURNING id,life_state,revision::text",
            [account],
          )
        ).rows[0];
        await client.query(sql);
        const row = (await client.query('SELECT * FROM game.characters WHERE id=$1', [legacy.id]))
          .rows[0];
        expect(row).toMatchObject({
          profile_visibility: 'private',
          show_fictional_avatar: false,
          show_registration_date: false,
          disclosure_revision: '0',
          life_state: legacy.life_state,
          revision: legacy.revision,
        });
        expect(row.public_reference).not.toBe(legacy.id);
        expect(row.public_reference).toMatch(/^[\da-f-]{14}4/);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
      expect(
        (
          await owner.query(
            "SELECT has_column_privilege('hunter_runtime','game.characters','public_reference','UPDATE') AS allowed,to_regclass('game.profile_operation_receipts')::text AS receipts",
          )
        ).rows,
      ).toEqual([{ allowed: true, receipts: 'game.profile_operation_receipts' }]);
    });
    for (const pair of ['update-issue', 'generate-generate', 'replace-replace'] as const)
      test(`same_revision_has_one_winner_${pair}`, async () =>
        withFixture(async (f) => {
          const s = await store();
          success(await s.update(f.id, draft(f.characterId, '0'), randomUUID()));
          let revision = '1';
          if (pair === 'replace-replace') {
            success(
              await s.issue(
                f.id,
                {
                  characterId: f.characterId,
                  expectedRevision: revision,
                  scope: 'profile.view',
                  mode: 'generate',
                },
                randomUUID(),
              ),
            );
            revision = '2';
          }
          const before = await state(f.characterId);
          const issue = (target: ProfileStore) =>
            target.issue(
              f.id,
              {
                characterId: f.characterId,
                expectedRevision: revision,
                scope: 'profile.view',
                mode: pair === 'replace-replace' ? 'replace' : 'generate',
              },
              randomUUID(),
            );
          const oldInvitations = (
            await owner.query(
              'SELECT * FROM game.profile_invitations WHERE character_id=$1 ORDER BY id',
              [f.characterId],
            )
          ).rows;
          const { results, freshReceiptRows } = await forcedMutationRace(
            issue,
            (target) =>
              pair === 'update-issue'
                ? target.update(f.id, draft(f.characterId, revision), randomUUID())
                : issue(target),
            async () => {
              expect(await state(f.characterId)).toEqual(before);
              expect(
                (
                  await owner.query(
                    'SELECT * FROM game.profile_invitations WHERE character_id=$1 ORDER BY id',
                    [f.characterId],
                  )
                ).rows,
              ).toEqual(oldInvitations);
              expect(
                (
                  await owner.query(
                    'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                    [f.accountId],
                  )
                ).rowCount,
              ).toBe(Number(revision));
            },
          );
          expect(results.map((r) => r.kind)).toEqual(['success', 'stale_revision']);
          expect(freshReceiptRows[1]).toEqual([0]);
          expect(await state(f.characterId)).toMatchObject({
            revision: (BigInt(revision) + 1n).toString(),
            disclosure_revision: (BigInt(revision) + 1n).toString(),
            public_reference: before.public_reference,
          });
          expect(
            (
              await owner.query(
                'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                [f.accountId],
              )
            ).rowCount,
          ).toBe(Number(revision) + 1);
          const invitations = (
            await owner.query(
              'SELECT id,token_digest,disclosure_revision::text,revoked_at FROM game.profile_invitations WHERE character_id=$1',
              [f.characterId],
            )
          ).rows;
          const winnerInvitations = invitations.filter((i) => !i.revoked_at);
          expect(winnerInvitations).toHaveLength(1);
          const winner = success(results[0]);
          if (winner.tokenDelivery.status !== 'delivered') throw new Error('Winner token missing');
          expect(winnerInvitations[0]).toMatchObject({
            id: winner.receipt.invitation.invitationId,
            disclosure_revision: (BigInt(revision) + 1n).toString(),
            token_digest: createHash('sha256').update(winner.tokenDelivery.token).digest(),
          });
          if (pair === 'replace-replace')
            expect(invitations.filter((i) => i.revoked_at)).toHaveLength(1);
        }));
    for (const kind of ['issue', 'withdraw'] as const)
      test(`identical_uuid_replays_once_${kind}`, async () =>
        withFixture(async (f) => {
          const s = await store();
          success(await s.update(f.id, draft(f.characterId, '0'), randomUUID()));
          const op = randomUUID();
          const issueInput = {
            characterId: f.characterId,
            expectedRevision: '1',
            scope: 'profile.view' as const,
            mode: 'generate' as const,
          };
          const act = (target: ProfileStore) =>
            kind === 'issue'
              ? target.issue(f.id, issueInput, op)
              : target.withdraw(f.id, { scope: 'all-owned-profiles' }, op);
          const before = await state(f.characterId);
          const { results, freshReceiptRows } = await forcedMutationRace(act, act, async () => {
            expect(await state(f.characterId)).toEqual(before);
            expect(
              (
                await owner.query(
                  'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                  [f.accountId],
                )
              ).rowCount,
            ).toBe(1);
            expect(
              (
                await owner.query('SELECT id FROM game.profile_invitations WHERE character_id=$1', [
                  f.characterId,
                ])
              ).rowCount,
            ).toBe(0);
          });
          expect(freshReceiptRows[1]).toEqual([1]);
          expect(results.map((r) => success(r).replayed)).toEqual([false, true]);
          expect(success(results[1]).receipt).toEqual(success(results[0]).receipt);
          expect(success(results[1]).current).toEqual(success(results[0]).current);
          expect(await state(f.characterId)).toMatchObject({
            revision: '2',
            disclosure_revision: '2',
          });
          expect(
            (
              await owner.query(
                'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                [f.accountId],
              )
            ).rowCount,
          ).toBe(2);
          if (kind === 'issue') {
            expect(success(results[0])).toHaveProperty('tokenDelivery.status', 'delivered');
            expect(success(results[1])).toHaveProperty('tokenDelivery.status', 'unavailable');
            expect((await state(f.characterId)).public_reference).toBe(before.public_reference);
            expect(success(await s.issue(f.id, issueInput, op)).tokenDelivery.status).toBe(
              'unavailable',
            );
            expect(
              (
                await owner.query('SELECT id FROM game.profile_invitations WHERE character_id=$1', [
                  f.characterId,
                ])
              ).rowCount,
            ).toBe(1);
            expect(
              (
                await owner.query(
                  'SELECT id FROM game.profile_invitations WHERE character_id=$1 AND revoked_at IS NULL',
                  [f.characterId],
                )
              ).rowCount,
            ).toBe(1);
          } else
            expect((await state(f.characterId)).public_reference).not.toBe(before.public_reference);
          expect(
            await s.revoke(f.id, { characterId: f.characterId, expectedRevision: '2' }, op),
          ).toEqual({ kind: 'operation_conflict' });
        }));
    for (const reduction of ['revoke', 'withdraw', 'gate'] as const)
      for (const first of ['reader', 'reduction'] as const)
        test(`resolution_linearizes_with_reductions_${reduction}_${first}`, async () =>
          withFixture(async (f) => {
            const s = await store();
            success(await s.update(f.id, draft(f.characterId, '0'), randomUUID()));
            const issued = success(
              await s.issue(
                f.id,
                {
                  characterId: f.characterId,
                  expectedRevision: '1',
                  scope: 'profile.view',
                  mode: 'generate',
                },
                randomUUID(),
              ),
            );
            if (issued.tokenDelivery.status !== 'delivered') throw new Error('token missing');
            const token = issued.tokenDelivery.token;
            const module = await import('../../packages/database/src/index.js');
            const barrier = barrierStore(
              first === 'reader'
                ? 'SELECT expires_at > clock_timestamp()'
                : 'INSERT INTO game.profile_operation_receipts',
            );
            const paused = module.createProfileStore(barrier.wrapped);
            const gate = await owner.connect();
            let gateOpen = false;
            const reduce = (target = s) =>
              reduction === 'revoke'
                ? target.revoke(
                    f.id,
                    { characterId: f.characterId, expectedRevision: '2' },
                    randomUUID(),
                  )
                : target.withdraw(f.id, { scope: 'all-owned-profiles' }, randomUUID());
            const pending: Promise<unknown>[] = [];
            try {
              if (first === 'reader') {
                const read = paused.resolve(f.id, { token });
                pending.push(read);
                await barrier.atBarrier;
                const reduced =
                  reduction === 'gate'
                    ? gate.query('UPDATE ops.feature_controls SET profile_disclosure=false')
                    : reduce();
                pending.push(reduced);
                await blocked(reduction === 'gate' ? '' : 'operator-account:');
                barrier.resume();
                expect((await read).kind).toBe('success');
                await reduced;
              } else if (reduction === 'gate') {
                await gate.query('BEGIN');
                gateOpen = true;
                await gate.query('UPDATE ops.feature_controls SET profile_disclosure=false');
                const read = s.resolve(f.id, { token });
                pending.push(read);
                await blocked('FROM ops.feature_controls');
                await gate.query('COMMIT');
                gateOpen = false;
                expect(await read).toEqual({ kind: 'profile_unavailable' });
              } else {
                const reduced = reduce(paused);
                pending.push(reduced);
                await barrier.atBarrier;
                const read = s.resolve(f.id, { token });
                pending.push(read);
                await blocked('operator-account:');
                barrier.resume();
                await reduced;
                expect(await read).toEqual({ kind: 'profile_unavailable' });
              }
              expect(await s.resolve(f.id, { token })).toEqual({ kind: 'profile_unavailable' });
            } finally {
              barrier.resume();
              if (gateOpen) await gate.query('ROLLBACK');
              await Promise.allSettled(pending);
              gate.release();
            }
          }));
    for (const change of [
      'restriction',
      'death',
      'operator',
      'detach',
      'provider',
      'gate',
      'grant',
    ] as const)
      for (const first of ['authority', 'issue'] as const)
        test(`issuance_linearizes_with_authority_${change}_${first}`, async () =>
          withFixture(async (f) => {
            const s = await store();
            success(await s.update(f.id, draft(f.characterId, '0'), randomUUID()));
            const observer = await context.createCandidate(undefined, false);
            const client = await owner.connect();
            let open = false;
            const barrier = barrierStore('INSERT INTO game.profile_operation_receipts');
            const paused = (
              await import('../../packages/database/src/index.js')
            ).createProfileStore(barrier.wrapped);
            const input = {
              characterId: f.characterId,
              expectedRevision: '1',
              scope: 'profile.view' as const,
              mode: 'generate' as const,
            };
            const pending: Promise<unknown>[] = [];
            try {
              let result;
              if (first === 'authority') {
                await client.query('BEGIN');
                open = true;
                await trustedChange(f, change, client);
                const issued = s.issue(f.id, input, randomUUID());
                pending.push(issued);
                await blocked('operator-account:');
                await client.query('COMMIT');
                open = false;
                result = await issued;
                expect(result.kind).not.toBe('success');
                expect(
                  (
                    await owner.query(
                      'SELECT id FROM game.profile_invitations WHERE character_id=$1',
                      [f.characterId],
                    )
                  ).rowCount,
                ).toBe(0);
                expect(
                  (
                    await owner.query(
                      'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                      [f.accountId],
                    )
                  ).rowCount,
                ).toBe(1);
              } else {
                const issued = paused.issue(f.id, input, randomUUID());
                pending.push(issued);
                await barrier.atBarrier;
                await client.query('BEGIN');
                open = true;
                const changed = trustedChange(f, change, client);
                pending.push(changed);
                await expect
                  .poll(
                    async () =>
                      (
                        await owner.query(
                          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='postgres' AND wait_event_type='Lock' AND position('operator-account:' IN query)>0",
                        )
                      ).rows[0].n,
                    { timeout: 3000, interval: 20 },
                  )
                  .toBe(1);
                barrier.resume();
                result = await issued;
                await changed;
                await client.query('COMMIT');
                open = false;
                const value = success(result);
                if (value.tokenDelivery.status !== 'delivered') throw new Error('token missing');
                const resolved = await s.resolve(observer, { token: value.tokenDelivery.token });
                expect(resolved.kind).toBe(
                  change === 'restriction' || change === 'grant'
                    ? 'success'
                    : 'profile_unavailable',
                );
                expect(
                  (
                    await owner.query(
                      'SELECT id FROM game.profile_invitations WHERE character_id=$1',
                      [f.characterId],
                    )
                  ).rowCount,
                ).toBe(1);
                expect(
                  (
                    await owner.query(
                      'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                      [f.accountId],
                    )
                  ).rowCount,
                ).toBe(2);
              }
            } finally {
              barrier.resume();
              if (open) await client.query('ROLLBACK');
              await Promise.allSettled(pending);
              client.release();
              if (change === 'detach')
                await owner.query('UPDATE game.accounts SET auth_user_id=$1 WHERE id=$2', [
                  f.id,
                  f.accountId,
                ]);
              await context.removeCandidate(observer);
            }
          }));
    test('canonical_reciprocal_reads_do_not_deadlock', async () =>
      withFixture(async (a) => {
        const b = await fixture();
        const releaseFirst = latch();
        const pending: Promise<unknown>[] = [];
        try {
          const s = await store();
          const one = success(await s.update(a.id, draft(a.characterId, '0'), randomUUID()));
          const two = success(await s.update(b.id, draft(b.characterId, '0'), randomUUID()));
          const [low, high] = a.id < b.id ? [a, b] : [b, a];
          const reference = (id: string) =>
            id === a.id
              ? one.current.profile!.publicReference!
              : two.current.profile!.publicReference!;
          const firstLock = latch();
          const reverseBegan = latch();
          const sameBegan = latch();
          const withdrawalBegan = latch();
          let firstPid = 0;
          let reversePid = 0;
          let samePid = 0;
          let withdrawalPid = 0;
          const firstIdentities: string[] = [];
          const reverseIdentities: string[] = [];
          const sameIdentities: string[] = [];
          const identity = (args: unknown[]) => String((args[1] as string[])[0]).toLowerCase();
          const module = await import('../../packages/database/src/index.js');
          const firstStore = module.createProfileStore(
            sessionPool(async (session, sql, args) => {
              if (sql.includes('operator-account:')) {
                firstIdentities.push(identity(args));
                if (firstIdentities.length === 1) {
                  firstPid = session.pid;
                  firstLock.release();
                  await releaseFirst.promise;
                }
              }
            }),
          );
          const reverseStore = module.createProfileStore(
            sessionPool(async (session, sql, args) => {
              if (sql === 'BEGIN') {
                reversePid = session.pid;
                reverseBegan.release();
              }
              if (sql.includes('operator-account:')) reverseIdentities.push(identity(args));
            }),
          );
          const sameStore = module.createProfileStore(
            sessionPool(async (session, sql, args) => {
              if (sql === 'BEGIN') {
                samePid = session.pid;
                sameBegan.release();
              }
              if (sql.includes('operator-account:')) sameIdentities.push(identity(args));
            }),
          );
          const withdrawalStore = module.createProfileStore(
            sessionPool(async (session, sql) => {
              if (session.connection === 1 && sql === 'BEGIN') {
                withdrawalPid = session.pid;
                withdrawalBegan.release();
              }
            }),
          );
          const first = firstStore.getPublic(high.id, reference(low.id));
          pending.push(first);
          void first.catch(() => undefined);
          await checkpoint(firstLock.promise, [first], 'first canonical identity lock');
          expect(firstIdentities).toEqual([low.id]);
          const held = (
            await owner.query(
              "SELECT classid::text,objid::text,objsubid,mode,granted FROM pg_locks WHERE pid=$1 AND locktype='advisory'",
              [firstPid],
            )
          ).rows;
          expect(held).toHaveLength(1);
          expect(held[0]).toMatchObject({ mode: 'ExclusiveLock', granted: true });
          async function waitOnFirst(pid: number) {
            await expect
              .poll(
                async () =>
                  (
                    await owner.query<{ blockers: number[] }>(
                      "SELECT pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",
                      [pid],
                    )
                  ).rows[0]?.blockers,
                { timeout: 3000, interval: 20 },
              )
              .toContain(firstPid);
            const locks = (
              await owner.query(
                "SELECT classid::text,objid::text,objsubid,mode,granted FROM pg_locks WHERE pid=$1 AND locktype='advisory'",
                [pid],
              )
            ).rows;
            // No granted opposite-identity lock: only the canonical first key is requested.
            expect(locks).toEqual([{ ...held[0], granted: false }]);
          }
          const reverse = reverseStore.getPublic(low.id, reference(high.id));
          pending.push(reverse);
          void reverse.catch(() => undefined);
          await checkpoint(reverseBegan.promise, [first, reverse], 'reverse reader BEGIN');
          await waitOnFirst(reversePid);
          expect(reverseIdentities).toEqual([]);
          const same = sameStore.getPublic(low.id, reference(low.id));
          pending.push(same);
          void same.catch(() => undefined);
          await checkpoint(sameBegan.promise, [first, reverse, same], 'same-identity reader BEGIN');
          await waitOnFirst(samePid);
          const withdrawn = withdrawalStore.withdraw(
            low.id,
            { scope: 'all-owned-profiles' },
            randomUUID(),
          );
          pending.push(withdrawn);
          void withdrawn.catch(() => undefined);
          await checkpoint(
            withdrawalBegan.promise,
            [first, reverse, same, withdrawn],
            'competing withdrawal preflight BEGIN',
          );
          await waitOnFirst(withdrawalPid);
          releaseFirst.release();
          const results = await Promise.all([first, reverse, same, withdrawn]);
          expect(results.map((result) => result.kind)).toEqual([
            'success',
            'success',
            'success',
            'success',
          ]);
          expect(firstIdentities).toEqual([low.id, high.id]);
          expect(reverseIdentities).toEqual([low.id, high.id]);
          expect(sameIdentities).toEqual([low.id]);
          expect(await state(low.characterId)).toMatchObject({
            revision: '2',
            disclosure_revision: '2',
            profile_visibility: 'private',
          });
          expect(await state(high.characterId)).toMatchObject({
            revision: '1',
            disclosure_revision: '1',
            profile_visibility: 'public',
          });
        } finally {
          releaseFirst.release();
          await Promise.allSettled(pending);
          await context.removeCandidate(b.id);
        }
      }));
    test('all_visibility_and_field_choices_are_exact', async () =>
      withFixture(async (f) => {
        const s = await store();
        const reader = await context.createCandidate(undefined, false);
        let revision = '0';
        try {
          await owner.query(
            "UPDATE game.characters SET created_at='2026-01-02T00:30:00Z' WHERE id=$1",
            [f.characterId],
          );
          for (const visibility of ['private', 'limited', 'public'] as const)
            for (const avatar of [false, true])
              for (const date of [false, true]) {
                const result = success(
                  await s.update(
                    f.id,
                    {
                      ...draft(f.characterId, revision, visibility),
                      showFictionalAvatar: avatar,
                      showRegistrationDate: date,
                    },
                    randomUUID(),
                  ),
                );
                revision = result.current.profile!.characterRevision;
                const expectedKeys = [
                  'schemaVersion',
                  'displayAlias',
                  'identityLabel',
                  ...(avatar ? ['appearance'] : []),
                  ...(date ? ['registrationDate'] : []),
                ].sort();
                expect(Object.keys(result.current.profile!.preview).sort()).toEqual(expectedKeys);
                expect(result.current.profile!.publicReference === null).toBe(
                  visibility !== 'public',
                );
                if (date)
                  expect(result.current.profile!.preview.registrationDate).toBe('2026-01-02');
                if (visibility === 'public')
                  expect(
                    Object.keys(
                      success(await s.getPublic(reader, result.current.profile!.publicReference!)),
                    ).sort(),
                  ).toEqual(expectedKeys);
              }
          expect(
            (await owner.query('SELECT id FROM game.accounts WHERE auth_user_id=$1', [reader]))
              .rowCount,
          ).toBe(0);
          await owner.query("UPDATE game.accounts SET access_state='restricted' WHERE id=$1", [
            f.accountId,
          ]);
          const ref = success(await s.getOwner(f.id)).profile!.publicReference!;
          expect((await s.getPublic(f.id, ref)).kind).toBe('success');
          await owner.query("UPDATE game.characters SET life_state='incapacitated' WHERE id=$1", [
            f.characterId,
          ]);
          expect((await s.getPublic(reader, ref)).kind).toBe('success');
        } finally {
          await context.removeCandidate(reader);
        }
      }));
    test('decimal_revisions_remain_exact_above_safe_integer', async () =>
      withFixture(async (f) => {
        const s = await store();
        await owner.query(
          'UPDATE game.characters SET revision=9007199254740993,disclosure_revision=9007199254740994 WHERE id=$1',
          [f.characterId],
        );
        const value = success(
          await s.update(f.id, draft(f.characterId, '9007199254740993'), randomUUID()),
        );
        expect(value.receipt.character).toMatchObject({
          characterRevision: '9007199254740994',
          disclosureRevision: '9007199254740995',
        });
        expect(value.current.profile!.characterRevision).toBe('9007199254740994');
      }));
    test('expiry_generate_replace_and_policy_revoke', async () =>
      withFixture(async (f) => {
        const s = await store();
        success(await s.update(f.id, draft(f.characterId, '0', 'limited'), randomUUID()));
        expect(
          await s.issue(
            f.id,
            {
              characterId: f.characterId,
              expectedRevision: '1',
              scope: 'profile.view',
              mode: 'replace',
            },
            randomUUID(),
          ),
        ).toEqual({ kind: 'invitation_missing' });
        const first = success(
          await s.issue(
            f.id,
            {
              characterId: f.characterId,
              expectedRevision: '1',
              scope: 'profile.view',
              mode: 'generate',
            },
            randomUUID(),
          ),
        );
        if (first.tokenDelivery.status !== 'delivered') throw new Error('missing token');
        await owner.query(
          "UPDATE game.profile_invitations SET issued_at=t-interval '11 minutes',expires_at=t-interval '1 minute' FROM (SELECT clock_timestamp() AS t) n WHERE character_id=$1",
          [f.characterId],
        );
        expect(success(await s.getOwner(f.id)).profile?.invitation?.status).toBe('expired');
        expect(await s.resolve(f.id, { token: first.tokenDelivery.token })).toEqual({
          kind: 'profile_unavailable',
        });
        const replaced = success(
          await s.issue(
            f.id,
            {
              characterId: f.characterId,
              expectedRevision: '2',
              scope: 'profile.view',
              mode: 'replace',
            },
            randomUUID(),
          ),
        );
        if (replaced.tokenDelivery.status !== 'delivered') throw new Error('missing token');
        success(await s.update(f.id, draft(f.characterId, '3', 'limited'), randomUUID()));
        expect(await s.resolve(f.id, { token: replaced.tokenDelivery.token })).toEqual({
          kind: 'profile_unavailable',
        });
        expect(success(await s.getOwner(f.id)).profile?.invitation?.status).toBe('revoked');
        expect(
          (
            await owner.query(
              'SELECT revoked_at FROM game.profile_invitations WHERE character_id=$1',
              [f.characterId],
            )
          ).rows.every((r) => r.revoked_at),
        ).toBe(true);
      }));
    test('generate_replaces_expired_nonrevoked_invitation', async () =>
      withFixture(async (f) => {
        const s = await store();
        success(await s.update(f.id, draft(f.characterId, '0', 'limited'), randomUUID()));
        const first = success(
          await s.issue(
            f.id,
            {
              characterId: f.characterId,
              expectedRevision: '1',
              scope: 'profile.view',
              mode: 'generate',
            },
            randomUUID(),
          ),
        );
        await owner.query(
          "UPDATE game.profile_invitations SET issued_at=t-interval '11 minutes',expires_at=t-interval '1 minute' FROM (SELECT clock_timestamp() AS t) n WHERE character_id=$1",
          [f.characterId],
        );
        const next = success(
          await s.issue(
            f.id,
            {
              characterId: f.characterId,
              expectedRevision: '2',
              scope: 'profile.view',
              mode: 'generate',
            },
            randomUUID(),
          ),
        );
        expect(next.receipt.invitation.invitationId).not.toBe(
          first.receipt.invitation.invitationId,
        );
        expect(
          (
            await owner.query(
              'SELECT revoked_at FROM game.profile_invitations WHERE character_id=$1 ORDER BY issued_at',
              [f.characterId],
            )
          ).rows.map((row) => !!row.revoked_at),
        ).toEqual([true, false]);
        expect(await state(f.characterId)).toMatchObject({
          revision: '3',
          disclosure_revision: '3',
        });
      }));
    for (const later of ['restricted', 'incapacitated', 'dead', 'gate', 'grant'] as const)
      test(`replay_never_reapplies_after_${later}`, async () =>
        withFixture(async (f) => {
          const s = await store();
          success(await s.update(f.id, draft(f.characterId, '0'), randomUUID()));
          const op = randomUUID();
          const input = {
            characterId: f.characterId,
            expectedRevision: '1',
            scope: 'profile.view' as const,
            mode: 'generate' as const,
          };
          const first = success(await s.issue(f.id, input, op));
          success(await s.withdraw(f.id, { scope: 'all-owned-profiles' }, randomUUID()));
          if (later === 'restricted')
            await owner.query("UPDATE game.accounts SET access_state='restricted' WHERE id=$1", [
              f.accountId,
            ]);
          if (later === 'incapacitated' || later === 'dead')
            await owner.query('UPDATE game.characters SET life_state=$2 WHERE id=$1', [
              f.characterId,
              later,
            ]);
          if (later === 'gate')
            await owner.query('UPDATE ops.feature_controls SET profile_disclosure=false');
          if (later === 'grant')
            await owner.query(
              'UPDATE ops.character_pilot_access SET enabled=false WHERE auth_user_id=$1',
              [f.id],
            );
          const before = await state(f.characterId);
          const replay = success(await s.issue(f.id, input, op));
          expect(replay.receipt).toEqual(first.receipt);
          expect(replay.tokenDelivery).toEqual({ status: 'unavailable' });
          expect(replay.replayed).toBe(true);
          expect(replay.current.profile?.visibility ?? null).toBe(
            later === 'dead' ? null : 'private',
          );
          expect(await state(f.characterId)).toEqual(before);
          expect(await s.issue(f.id, { ...input, expectedRevision: '2' }, op)).toEqual({
            kind: 'operation_conflict',
          });
          expect(
            (
              await owner.query('SELECT id FROM game.profile_invitations WHERE character_id=$1', [
                f.characterId,
              ])
            ).rowCount,
          ).toBe(1);
          expect(
            (
              await owner.query(
                'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                [f.accountId],
              )
            ).rowCount,
          ).toBe(3);
        }));
    test('withdrawal_reduces_all_historical_rows_without_dossier', async () =>
      withFixture(async (f) => {
        const s = await store();
        success(await s.update(f.id, draft(f.characterId, '0'), randomUUID()));
        success(
          await s.issue(
            f.id,
            {
              characterId: f.characterId,
              expectedRevision: '1',
              scope: 'profile.view',
              mode: 'generate',
            },
            randomUUID(),
          ),
        );
        await owner.query(
          "UPDATE game.characters SET life_state='dead',profile_visibility='public',show_fictional_avatar=true,show_registration_date=true WHERE id=$1",
          [f.characterId],
        );
        const historical = (
          await owner.query(
            "INSERT INTO game.characters(account_id,display_alias,life_state,profile_visibility,show_fictional_avatar,show_registration_date) VALUES ($1,'Historical synthetic','dead','limited',true,true) RETURNING id,public_reference",
            [f.accountId],
          )
        ).rows[0];
        await owner.query("UPDATE game.accounts SET access_state='restricted' WHERE id=$1", [
          f.accountId,
        ]);
        await owner.query('UPDATE ops.feature_controls SET profile_disclosure=false');
        const value = success(
          await s.withdraw(f.id, { scope: 'all-owned-profiles' }, randomUUID()),
        );
        expect(value.receipt.affectedProfileCount).toBe(2);
        expect(value.current).toMatchObject({
          status: 'no_living_profile',
          profile: null,
          mode: 'restricted',
          controls: { canWithdraw: true },
        });
        for (const id of [f.characterId, historical.id])
          expect(await state(id)).toMatchObject({
            revision: id === f.characterId ? '3' : '1',
            disclosure_revision: id === f.characterId ? '3' : '1',
            profile_visibility: 'private',
            show_fictional_avatar: false,
            show_registration_date: false,
          });
        expect((await state(historical.id)).public_reference).not.toBe(historical.public_reference);
        expect(
          (
            await owner.query(
              'SELECT revoked_at FROM game.profile_invitations WHERE character_id=$1',
              [f.characterId],
            )
          ).rows.every((row) => row.revoked_at),
        ).toBe(true);
      }));
    test('foreign_account_receipts_subjects_and_auth_fail_closed', async () =>
      withFixture(async (f) => {
        const s = await store();
        const other = await fixture(false);
        try {
          const op = randomUUID();
          success(await s.update(f.id, draft(f.characterId, '0'), op));
          expect(await s.update(other.id, draft(f.characterId, '0'), op)).toEqual({
            kind: 'character_unavailable',
          });
          expect(await s.update(other.id, draft(other.characterId, '0', 'private'), op)).toEqual({
            kind: 'sharing_unavailable',
          });
          expect(
            (
              await owner.query(
                'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                [other.accountId],
              )
            ).rowCount,
          ).toBe(0);
          expect(await s.update(f.id, draft(other.characterId, '0'), op)).toEqual({
            kind: 'operation_conflict',
          });
          await owner.query(
            "INSERT INTO ops.operator_accounts(auth_user_id,status) VALUES ($1,'suspended')",
            [other.id],
          );
          expect(await s.getOwner(other.id)).toEqual({ kind: 'operator_only' });
          expect(
            await s.getPublic(other.id, success(await s.getOwner(f.id)).profile!.publicReference!),
          ).toEqual({ kind: 'operator_only' });
          expect(await s.resolve(f.id, { token: 'invalid' })).toEqual({ kind: 'invalid_request' });
          expect(await s.resolve(f.id, { token: 'A'.repeat(43) })).toEqual({
            kind: 'profile_unavailable',
          });
        } finally {
          await context.removeCandidate(other.id);
        }
      }));
    test('rollback_and_runtime_grants', async () =>
      withFixture(async (f) => {
        const s = await store();
        success(await s.update(f.id, draft(f.characterId, '0'), randomUUID()));
        const before = await state(f.characterId);
        await owner.query(
          `CREATE FUNCTION game.test_profile_late_failure() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF NEW.account_id='${f.accountId}'::uuid THEN RAISE EXCEPTION 'synthetic late failure'; END IF; RETURN NEW; END $$`,
        );
        await owner.query('REVOKE ALL ON FUNCTION game.test_profile_late_failure() FROM PUBLIC');
        await owner.query(
          'CREATE TRIGGER test_profile_late_failure AFTER INSERT ON game.profile_operation_receipts FOR EACH ROW EXECUTE FUNCTION game.test_profile_late_failure()',
        );
        try {
          await expect(
            s.issue(
              f.id,
              {
                characterId: f.characterId,
                expectedRevision: '1',
                scope: 'profile.view',
                mode: 'generate',
              },
              randomUUID(),
            ),
          ).rejects.toThrow('synthetic late failure');
          expect(await state(f.characterId)).toEqual(before);
          expect(
            (
              await owner.query('SELECT id FROM game.profile_invitations WHERE character_id=$1', [
                f.characterId,
              ])
            ).rowCount,
          ).toBe(0);
          expect(
            (
              await owner.query(
                'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                [f.accountId],
              )
            ).rowCount,
          ).toBe(1);
          await expect(
            s.withdraw(f.id, { scope: 'all-owned-profiles' }, randomUUID()),
          ).rejects.toThrow('synthetic late failure');
          expect(await state(f.characterId)).toEqual(before);
        } finally {
          await owner.query(
            'DROP TRIGGER test_profile_late_failure ON game.profile_operation_receipts',
          );
          await owner.query('DROP FUNCTION game.test_profile_late_failure()');
        }
        const issued = success(
          await s.issue(
            f.id,
            {
              characterId: f.characterId,
              expectedRevision: '1',
              scope: 'profile.view',
              mode: 'generate',
            },
            randomUUID(),
          ),
        );
        if (issued.tokenDelivery.status !== 'delivered') throw new Error('missing token');
        const existing = await state(f.characterId);
        const oldInvitation = (
          await owner.query('SELECT * FROM game.profile_invitations WHERE character_id=$1', [
            f.characterId,
          ])
        ).rows;
        await owner.query(
          `CREATE FUNCTION game.test_profile_late_failure() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF NEW.account_id='${f.accountId}'::uuid THEN RAISE EXCEPTION 'synthetic late failure'; END IF; RETURN NEW; END $$`,
        );
        await owner.query('REVOKE ALL ON FUNCTION game.test_profile_late_failure() FROM PUBLIC');
        await owner.query(
          'CREATE TRIGGER test_profile_late_failure AFTER INSERT ON game.profile_operation_receipts FOR EACH ROW EXECUTE FUNCTION game.test_profile_late_failure()',
        );
        try {
          await expect(
            s.issue(
              f.id,
              {
                characterId: f.characterId,
                expectedRevision: '2',
                scope: 'profile.view',
                mode: 'replace',
              },
              randomUUID(),
            ),
          ).rejects.toThrow('synthetic late failure');
          await expect(
            s.withdraw(f.id, { scope: 'all-owned-profiles' }, randomUUID()),
          ).rejects.toThrow('synthetic late failure');
          expect(await state(f.characterId)).toEqual(existing);
          expect(
            (
              await owner.query('SELECT * FROM game.profile_invitations WHERE character_id=$1', [
                f.characterId,
              ])
            ).rows,
          ).toEqual(oldInvitation);
          expect(
            (
              await owner.query(
                'SELECT operation_id FROM game.profile_operation_receipts WHERE account_id=$1',
                [f.accountId],
              )
            ).rowCount,
          ).toBe(2);
          expect((await s.resolve(f.id, { token: issued.tokenDelivery.token })).kind).toBe(
            'success',
          );
        } finally {
          await owner.query(
            'DROP TRIGGER test_profile_late_failure ON game.profile_operation_receipts',
          );
          await owner.query('DROP FUNCTION game.test_profile_late_failure()');
        }
        for (const column of [
          'account_id',
          'life_state',
          'awakening_state',
          'presence_state',
          'display_alias',
          'preset_id',
        ]) {
          expect(
            (
              await owner.query(
                "SELECT has_column_privilege('hunter_runtime','game.characters',$1,'UPDATE') AS allowed",
                [column],
              )
            ).rows[0].allowed,
          ).toBe(false);
        }
        expect(
          (
            await owner.query(
              "SELECT has_column_privilege('hunter_runtime','game.accounts','access_state','UPDATE') AS restriction,has_table_privilege('hunter_runtime','game.profile_operation_receipts','UPDATE,DELETE') AS receipt_write,has_table_privilege('hunter_runtime','game.profile_invitations','DELETE') AS invitation_delete",
            )
          ).rows,
        ).toEqual([{ restriction: false, receipt_write: false, invitation_delete: false }]);
        await expect(
          runtime.query("UPDATE game.characters SET life_state='dead' WHERE id=$1", [
            f.characterId,
          ]),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          runtime.query('DELETE FROM game.profile_operation_receipts WHERE account_id=$1', [
            f.accountId,
          ]),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          owner.query('DELETE FROM game.profile_operation_receipts WHERE account_id=$1', [
            f.accountId,
          ]),
        ).rejects.toMatchObject({ code: '42501' });
        for (const role of ['anon', 'authenticated', 'service_role'])
          expect(
            (
              await owner.query(
                "SELECT has_schema_privilege($1,'game','USAGE') AS schema,has_table_privilege($1,'game.profile_invitations','SELECT,INSERT,UPDATE,DELETE') AS invitations,has_table_privilege($1,'game.profile_operation_receipts','SELECT,INSERT,UPDATE,DELETE') AS receipts,has_function_privilege($1,'game.prevent_profile_receipt_rewrite()','EXECUTE') AS function",
                [role],
              )
            ).rows,
          ).toEqual([{ schema: false, invitations: false, receipts: false, function: false }]);
        const fn = (
          await owner.query(
            "SELECT proconfig,prosecdef,proowner=(SELECT relowner FROM pg_class WHERE oid='game.profile_operation_receipts'::regclass) AS trusted_owner FROM pg_proc WHERE oid='game.prevent_profile_receipt_rewrite()'::regprocedure",
          )
        ).rows[0];
        expect(fn).toEqual({
          proconfig: ['search_path=pg_catalog, game'],
          prosecdef: false,
          trusted_owner: true,
        });
        const sql = await readFile(
          new URL(
            '../../supabase/migrations/20261002000100_profile_disclosure.sql',
            import.meta.url,
          ),
          'utf8',
        );
        expect(
          (
            await owner.query(
              "SELECT sha256,applied_by FROM ops.schema_migrations WHERE name='20261002000100_profile_disclosure.sql'",
            )
          ).rows,
        ).toEqual([
          { sha256: createHash('sha256').update(sql).digest('hex'), applied_by: 'postgres' },
        ]);
        const version = (await owner.query('SHOW server_version')).rows[0].server_version;
        expect(typeof version).toBe('string');
        console.info('Disposable profile PostgreSQL version:', version);
        const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url);
        const files = (await readdir(migrationDirectory))
          .filter((name) => name.endsWith('.sql'))
          .sort();
        const history = (
          await owner.query('SELECT name,sha256 FROM ops.schema_migrations ORDER BY name')
        ).rows;
        expect(history.map((row) => row.name)).toEqual(files);
        for (const file of files)
          expect(history.find((row) => row.name === file)?.sha256).toBe(
            createHash('sha256')
              .update(await readFile(new URL(file, migrationDirectory), 'utf8'))
              .digest('hex'),
          );
        const controls = (await import('../../packages/database/src/index.js')).getFeatureControls;
        expect(Object.keys(await controls(runtime)).sort()).toEqual([
          'characters',
          'commerce',
          'encounters',
          'registration',
        ]);
      }));
  });
}
