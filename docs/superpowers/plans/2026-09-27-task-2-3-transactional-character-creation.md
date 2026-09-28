# Task 2.3 Transactional Character Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a verified, non-operator player a race-safe, retryable way to create one private unawakened character and inspect current creation eligibility.

**Architecture:** A private SQL migration adds a creation receipt and a locked Auth-eligibility routine. The existing Fastify API verifies live Supabase identity, while a database service makes the account link, operator, feature-control, cooldown, living-slot, character, and receipt decisions in one transaction. Public Supabase roles never access `game`; the managed character flag remains off until later Phase 2 work.

**Tech Stack:** PostgreSQL 17.6, Supabase Auth, canonical SQL migrations, `pg` 8.23.0, Fastify 5.12.4, TypeScript 5.9.3, Vitest 5.

**Spec:** [approved Task 2.3 design](../specs/2026-09-27-transactional-character-creation-design.md).

**Status:** Approved and executed; Task 2.3 implementation and verification completed on 2026-09-28. This plan preserves its original task checkboxes as an archival implementation guide; see [current evidence](../../testing/foundation-verification.md) and the SDD progress record.

## Global Constraints

- Work on the current `codex/foundation` branch, preserve unrelated changes, and use only `supabase/migrations` for schema history. No schema push or competing migration runner.
- `game` stays absent from selected Supabase Data API exposed schemas. `anon`, `authenticated`, `service_role`, and `PUBLIC` gain no `game` access; the runtime role gains only the explicit column privileges and private routine execution in the spec.
- A Supabase Auth UUID, never email or editable metadata, links a login to a durable game account. Auth deletion detaches the link; no automatic reassociation or character deletion.
- Any active or suspended operator record makes the login operator-only. The existing operator-assignment advisory lock must serialize first assignment with character creation.
- Recheck Auth eligibility, feature flag, cooldown, living slot, and receipt inside the creation transaction. Use database wall time after lock waits. The partial unique index remains the final one-living-slot guard, including incapacitation.
- Require a UUID `Idempotency-Key`; replay only to a currently authorized identity, with the same operation and payload. Never silently replay offline game mutations.
- Keep `ops.feature_controls.characters = false` in managed development during Task 2.3. No player onboarding, gameplay authority, class, reward, location, or public profile is added.

## Review Focus

1. **Already-issued token after a ban:** the verifier and locked database check deny creation; Task 2 and Task 3 test this.
2. **Assignment during first creation:** whichever holds the shared operator advisory lock first determines the order; an assigned operator cannot create afterward; Task 3 races both orders.
3. **Flag switched off during creation:** the `FOR SHARE` feature-control lock orders the owner update against the commit; Task 3 races both orders.
4. **Lost response then a changed state:** an authorized same-key retry returns the stored receipt, while a now-operator or banned login learns nothing from it; Tasks 3–4 test both.
5. **Same email after Auth deletion:** a new UUID cannot retrieve the detached account or its receipt; Task 3 tests this using distinct provider IDs.

---

### Task 1: Private receipt, Auth check, and narrow grants

**Files:**

- Create: `supabase/migrations/20260927000200_character_creation_service.sql`
- Modify: `tests/integration/foundation.test.ts` (schema, grants, and routine tests)

**Interfaces:**

- Consumes: Task 2.2 `game.accounts`, `game.characters`, `ops.feature_controls`, the local `auth.users` fixture, and `hunter_runtime`.
- Produces: `game.character_creation_receipts(account_id uuid, operation_id uuid, request_fingerprint bytea, character_id uuid, created_at timestamptz)` with primary key `(account_id, operation_id)`, unique `character_id`, 32-byte fingerprint check and noncascading account/character FKs; `game.lock_eligible_auth_user(p_auth_user_id uuid) RETURNS boolean`.

- [ ] **Step 1: Write failing PostgreSQL tests.** Assert the new receipt relation and routine exist with the intended trusted owner and pinned search path; an eligible verified, non-anonymous, non-banned Auth row returns true while banned/deleted/anonymous/unverified/missing rows return false; `hunter_runtime` can call the routine and lock a game-account row and feature-control singleton; public roles cannot call the routine or access receipts. Assert runtime can insert only `accounts.auth_user_id`, `characters.account_id/display_alias`, and receipt fields, but cannot update account link/cooldown, character lifecycle, or `ops.feature_controls.characters`. Update Task 2.2's old “runtime read only” assertions to this precise new privilege contract.

  ```ts
  expect(
    (await database.pool.query('SELECT game.lock_eligible_auth_user($1) AS eligible', [verifiedId]))
      .rows[0]?.eligible,
  ).toBe(true);
  expect(
    (
      await owner.query(
        "SELECT has_function_privilege('anon', 'game.lock_eligible_auth_user(uuid)', 'EXECUTE') AS allowed",
      )
    ).rows[0]?.allowed,
  ).toBe(false);
  ```

- [ ] **Step 2: Run `pnpm exec tsx scripts/test-postgres.ts` and confirm red for the absent Task 2.3 migration.** A fixture/bootstrap failure is not the expected red state.
- [ ] **Step 3: Add the one canonical SQL migration.** The private routine is `SECURITY DEFINER`, owned by the trusted migrator, has a fixed safe search path, reads and `FOR SHARE` locks `auth.users`, uses `clock_timestamp()` for an active ban, returns only boolean, and has `PUBLIC` execution revoked in the same transaction before granting `hunter_runtime` execution. Grant column-scoped `INSERT` on the new account/character fields, receipt `SELECT` and scoped `INSERT`, `UPDATE (revision)` on `game.accounts` for `FOR UPDATE`, and `UPDATE (singleton)` on `ops.feature_controls` for `FOR SHARE`; no broad `UPDATE` grant. Revoke new table/function access from public API roles. Do not alter the disabled flag.
- [ ] **Step 4: Rerun the fresh disposable PostgreSQL suite.** All existing and new tests must pass, including real runtime-role lock queries and denied public calls; migration checksum replay must still work.
- [ ] **Step 5: Review the migration's exact grants and `SECURITY DEFINER` boundary, run `git diff --check`, then commit only the owned migration/test files.** Independent review must pass before managed application; a reviewer may reject unsafe routine ownership or grants.

### Task 2: Current Auth status and operator-only session routing

**Files:**

- Modify: `packages/server/src/auth.ts`
- Modify: `packages/database/src/operator-access.ts`, `packages/database/src/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `tests/unit/auth-verifier.test.ts`, `tests/unit/api.test.ts`, `tests/unit/recovery-boundary.test.ts`
- Modify if fixture shape requires it: other existing Auth-verifier fixtures under `tests/unit`

**Interfaces:**

- Consumes: existing `AuthVerifier.verify(accessToken): Promise<AuthIdentity | null>` and operator access store.
- Produces: the same verifier interface, now rejecting current banned/deleted/anonymous or malformed status; `OperatorAccessStore.findOperatorStatus(authUserId): Promise<'active' | 'suspended' | null>` alongside existing `findActiveOperator`; `/v1/auth/session` returns 403 `OPERATOR_SUSPENDED` for suspended operators rather than `applicationRole: 'player'`.

- [ ] **Step 1: Write failing verifier and API tests.** Use an already-issued valid password token with `/auth/v1/user` returning future `banned_until`; assert rejection. Test expired ban, `deleted_at`, `is_anonymous`, malformed status fields, provider failure, active operator routing, suspended operator 403, and store failure 503. Preserve recovery/MFA behavior.

  ```ts
  expect(await verifier.verify(alreadyIssuedBannedToken)).toBeNull();
  expect((await app.inject({ url: '/v1/auth/session', headers })).json()).toMatchObject({
    error: { code: 'OPERATOR_SUSPENDED' },
  });
  ```

- [ ] **Step 2: Run `pnpm exec vitest run tests/unit/auth-verifier.test.ts tests/unit/api.test.ts tests/unit/recovery-boundary.test.ts` and confirm focused red results.**
- [ ] **Step 3: Implement the current-status parser and operator lookup.** Reject unsafe provider status before producing `AuthIdentity`; compare active ban against API server time, while Task 3 rechecks database time in its transaction. Add the status query without changing `findActiveOperator`'s active-only behavior. Update affected test stores and route `/v1/auth/session` through the new status so suspended is never called a player.
- [ ] **Step 4: Rerun the focused unit files, `pnpm typecheck`, and `pnpm lint`; repair substantive failures.**
- [ ] **Step 5: Run `git diff --check`, then commit only Task 2 files after scoped review.**

### Task 3: Transactional game-account and character service

**Files:**

- Create: `packages/database/src/character-creation.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `tests/integration/foundation.test.ts` (focused service/race section using its existing disposable database setup)

**Interfaces:**

- Consumes: Task 1's receipt/routine/grants, `withTransaction(pool, action)`, and the existing operator advisory-lock protocol.
- Produces: `createCharacterStore(pool: Pool): CharacterStore` with `getMe(authUserId: string): Promise<MeResult>` and `create(authUserId: string, displayAlias: string, operationId: string): Promise<CreateCharacterResult>`. `MeResult` is either `operator_only` or a schema-version-1 projection with a current private living character or null and one of `available | occupied | cooldown | feature_disabled` plus nullable `notBefore`; `CreateCharacterResult` is `created` (`characterId`, `operationId`, `createdAt`, `replayed`) or a typed `operator_only | auth_ineligible | disabled | occupied | cooldown | operation_conflict` denial.

- [ ] **Step 1: Write failing real-PostgreSQL service tests.** Cover read-only `getMe` with no account/flag off and flag on, `getMe` denied to active and suspended operators, its current living projection including incapacitation but excluding dead history, cooldown `notBefore`, first verified link, unchanged same-key retry even after the flag switches off, same operation ID with changed alias conflict, same-key and different-key two-connection races, incapacitated occupancy, dead history plus cooldown boundary, a detached account followed by a new UUID with the same email, and rollback with no orphan receipt. Drive creation through the actual `hunter_runtime` pool, not the owner connection.

  ```ts
  expect(await store.getMe(newAuthUserId)).toMatchObject({
    creation: { status: 'feature_disabled' },
  });
  await owner.query('UPDATE ops.feature_controls SET characters = true WHERE singleton');
  expect(await store.create(authUserId, 'Civilian', operationId)).toMatchObject({
    kind: 'created',
    replayed: false,
  });
  expect(await store.create(authUserId, 'Changed', operationId)).toMatchObject({
    kind: 'operation_conflict',
  });
  ```

- [ ] **Step 2: Add focused lock-order tests.** Hold the operator-assignment advisory lock, then race audited operator assignment against creation in each order; similarly hold the feature row and Auth row to race disabling and banning against creation. Assert one serial order, no second living character, no privileged result after committed denial, and bounded waits rather than deadlocks.
- [ ] **Step 3: Run `pnpm exec tsx scripts/test-postgres.ts` and confirm red from missing service behavior.**
- [ ] **Step 4: Implement `getMe` and `create` in the database package.** `getMe` never writes, rejects any operator row, and gives `feature_disabled` precedence. `create` obtains the canonical operator advisory lock, checks any operator row, locks the feature singleton `FOR SHARE`, calls `game.lock_eligible_auth_user`, resolves/creates the account by Auth UUID only, locks it `FOR UPDATE`, checks the receipt before new eligibility, then checks flag, cooldown with `clock_timestamp()`, and the alive/incapacitated slot. Insert character and SHA-256 fingerprinted receipt in one transaction. A same-key authorized replay returns the receipt; changed payload conflicts; PostgreSQL uniqueness is mapped to a safe typed result. Use the exact UTF-8 alias as the version-1 fingerprint input so retry comparison is deterministic; a later payload shape requires a new fingerprint version.
- [ ] **Step 5: Run the real PostgreSQL suite, then focused type/lint checks.** Every race and denied-role test must pass without relaxing assertions. Review the lock order, parameterized SQL, safe error mapping, and absence of email-based lookup, then commit only Task 3 files.

### Task 4: API contracts and authenticated routes

**Files:**

- Create: `packages/contracts/src/character.ts`, `apps/api/src/character-routes.ts`, `apps/api/src/identity.ts`, `tests/unit/character-api.test.ts`
- Modify: `packages/contracts/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`
- Modify if the shared auth-helper extraction requires it: `tests/unit/api.test.ts`, `tests/unit/recovery-boundary.test.ts`

**Interfaces:**

- Consumes: Task 3 `CharacterStore`, existing `AuthVerifier`, `errorResponseSchema`, and `request.id`.
- Produces: `meResponseSchema` (`schemaVersion: 1`, owner-only `character`, `creation.status`, nullable `creation.notBefore`) and `characterCreationResponseSchema` (`characterId`, `operationId`, `createdAt`); `registerCharacterRoutes(app: FastifyInstance, options: { auth?: AuthVerifier; characters?: CharacterStore }): void`; `GET /v1/me` and `POST /v1/characters`.

- [ ] **Step 1: Write failing API-injection tests.** Prove 401 invalid or provider-rejected banned bearer, distinct 403 recovery/restricted/unverified/operator denials, 503 missing service and disabled creation, 200 `GET /v1/me` with no account/flag off, 201 first and authorized replay with the same body, 409 occupied/cooldown/changed-operation cases, malformed alias/key rejection, no account ID, dead history, hidden fields, or SQL text in responses, and no-store/request ID headers. A now-operator replay must return 403 before any receipt; an internal store failure returns sanitized 503.

  ```ts
  const firstCreate = await app.inject({ method: 'POST', url: '/v1/characters', headers, payload });
  const replay = await app.inject({ method: 'POST', url: '/v1/characters', headers, payload });
  expect(firstCreate.statusCode).toBe(201);
  expect(replay.statusCode).toBe(201);
  expect(replay.body).toBe(firstCreate.body);
  ```

- [ ] **Step 2: Run `pnpm exec vitest run tests/unit/character-api.test.ts tests/unit/api.test.ts tests/unit/recovery-boundary.test.ts` and confirm focused red results.**
- [ ] **Step 3: Add the shared contract and routes.** Extract the existing bearer/standard-session helper into `apps/api/src/identity.ts` without weakening recovery/MFA routes. Register the character routes from `buildApp`, wire `createCharacterStore(database.pool)` in the API entry point, validate UUID key and bounded alias with JSON schema, map typed service results to documented status/error codes, and retain existing rate-limit/log redaction conventions. Return only receipt fields from POST; current life belongs to GET.
- [ ] **Step 4: Run focused unit tests, `pnpm verify`, `pnpm format:check`, and `pnpm exec tsx scripts/test-postgres.ts`.** Browser regression remains relevant; do not treat it as proof of a character UI.
- [ ] **Step 5: Review API access without a character store, direct DevTools-crafted requests, and stale sessions; repair failures and commit only Task 4 files.**

### Task 5: Independent review, managed development, and honest evidence

**Files:**

- Create: `docs/adr/0012-transactional-character-creation.md`
- Modify: `docs/testing/foundation-verification.md`, `docs/tasks/ledger.md`, `docs/plans/project-roadmap-and-goal.md`

**Interfaces:**

- Consumes: reviewed Tasks 1–4 and their exact verification outputs.
- Produces: verified Task 2.3 evidence, a deployed-development state or explicit deployment-pending record, and Task 2.4 as next dependency. Phase 2 remains active.

- [ ] **Step 1: Obtain independent Sol review against the original brief, approved spec, migrations, transaction service, auth/API paths, and real race/security tests.** Repair substantive findings and rerun affected checks before deployment. In particular, inspect routine owner/search path/EXECUTE grants and role privileges on managed Supabase.
- [ ] **Step 2: Run fresh release checks.** `pnpm verify`, `pnpm format:check`, `pnpm exec tsx scripts/test-postgres.ts`, and the available full browser regression/CI stage must pass. Record exact counts and any transient failures honestly.
- [ ] **Step 3: Preflight managed development read-only.** Confirm the eight existing canonical migration receipts still match local history, managed `auth.users` has the required status columns, the trusted migration role can `SELECT ... FOR SHARE` it, and `hunter_runtime` cannot read it directly. Confirm `game` remains unselected among exposed Data API schemas and `characters` remains false. Do not use a service key or manually create character data.
- [ ] **Step 4: Apply only the reviewed new SQL migration to managed development through the audited Supabase transport.** Read back its checksum receipt, function owner/search path/EXECUTE grants, table and column privileges, empty receipt table, disabled flag, and no public access. If transport or managed privileges fail, stop deployment and document the exact blocker; do not claim managed completion or make ad hoc SQL repairs.
- [ ] **Step 5: Push the reviewed code, confirm final-SHA CI, and inspect the actual development API deployment revision.** Exercise live anonymous denials and disabled-creation behavior where authorized test credentials are available; if a private login is needed, prepare a precise owner test without asking for passwords or tokens. Do not claim live creation while the flag is off or frontend onboarding absent.
- [ ] **Step 6: Record ADR 0012 and update evidence/ledger only to the level actually verified.** Mark Task 2.3 complete only if its implemented behavior, independent review, local/CI real PostgreSQL tests, applicable managed migration, and development API boundary checks pass. Keep Phase 2 active, Task 2.4 next, and the hosted preview labeled account-enabled foundation rather than playable.
