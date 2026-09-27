# Task 2.2 Game Identity Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable game accounts and characters with a detachable Supabase Auth link and a PostgreSQL-enforced one-living-character rule.

**Architecture:** One canonical SQL migration creates a private `game` schema; stable game-account IDs survive Auth-user deletion and character IDs survive death. A partial unique index makes both `alive` and `incapacitated` characters occupy the living slot. Disposable PostgreSQL integration tests exercise the migration and privileges; application creation and authorization remain in Tasks 2.3–2.4.

**Tech Stack:** PostgreSQL 17, Supabase Auth `auth.users(id)`, canonical SQL migrations, TypeScript 5.9, `pg` 8.23.0, Vitest 5.

**Spec:** [2026-09-27 game-account and character schema design](../specs/2026-09-27-game-account-character-schema-design.md).

## Global Constraints

- Use only `supabase/migrations` and `scripts/migrate.ts` for schema changes; do not add Drizzle migration execution or schema push.
- Keep `ops.feature_controls.characters = false`; Task 2.2 adds persistence, not playable character creation or UI authority.
- Keep game account, character life, awakening, presence, profile visibility, cooldown and future standing distinct.
- `alive` and `incapacitated` occupy the same living slot; dead characters remain as private history.
- Auth-user deletion sets only the nullable account login link to null; never cascade-delete the game account or characters or reassociate by email.
- `anon`, `authenticated` and `PUBLIC` have no direct `game` access; `hunter_runtime` has read-only access in Task 2.2.
- No client time, email, user metadata, public profile or cached session becomes gameplay authority.
- Use real disposable PostgreSQL tests; do not apply the migration to managed Supabase before local checks and independent review.

## Review Focus

1. A second Auth user with the same email as a deleted one must not regain the detached game account; Task 1 tests lookup by the new UUID after deletion.
2. A duplicate live Auth-user link must be rejected while multiple detached accounts are allowed; Task 1 tests both unique and null behavior.
3. Invalid lifecycle values or an orphaned character must fail rather than enter an ambiguous state; Task 1 tests checks and the parent foreign key.
4. Simultaneous creation from separate database connections must leave one living row, including when the existing row is incapacitated; Task 2 tests the race and state transition.
5. Direct reads/writes through Supabase public roles and runtime writes must be denied; Task 2 tests actual role access and privileges.

---

### Task 1: Canonical game identity migration and retention

**Files:**

- Create: `supabase/migrations/20260927000100_game_accounts_characters.sql`
- Modify: `tests/integration/foundation.test.ts` (`beforeAll` Auth fixture and focused schema tests)

**Interfaces:**

- Consumes: `migrate(connectionString): Promise<string[]>`, the existing `hunter_runtime` role, and Supabase's `auth.users(id)` UUID primary key.
- Produces: `game.accounts(id, auth_user_id, character_creation_not_before, revision, created_at, updated_at)` and `game.characters(id, account_id, display_alias, life_state, awakening_state, presence_state, profile_visibility, revision, created_at, updated_at)`; `game.one_living_character_per_account` partial unique index.

- [ ] **Step 1: Move the disposable Auth fixture before migration and write failing schema tests.** In `tests/integration/foundation.test.ts`, create the existing minimal `auth.users` and `auth.mfa_factors` fixture after role creation but before `migrate(connectionString)`; leave seed execution after migration. Add tests asserting `game` and both tables exist; a new character defaults to `alive`, `unawakened`, `sheltered`, `private`; a second serial living insert fails `23505`; invalid life/awakening/presence/visibility and missing account fail database checks; two linked accounts cannot share one Auth UUID while two null links are allowed; deletion of an Auth user nulls only its link and preserves character IDs; deleting an account with a character is rejected; and a new Auth UUID with the old email finds no linked game account. Use generated UUIDs and clean up test rows without touching other fixtures.

- [ ] **Step 2: Run the disposable PostgreSQL suite and confirm a meaningful red state.** Run `pnpm exec tsx scripts/test-postgres.ts`. Expected: the new schema test fails because `game` has not been migrated; existing fixture/bootstrap failures are not acceptable.

- [ ] **Step 3: Implement the single migration.** Create private schema `game`; revoke schema/table/sequence/function defaults and explicit `anon`/`authenticated` privileges, and grant `hunter_runtime` schema usage plus `SELECT` on both tables only. Use UUID primary keys with `gen_random_uuid()` defaults; `game.accounts.auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL`, nullable cooldown timestamp, nonnegative `bigint` revision and server timestamps. Use `game.characters.account_id uuid NOT NULL REFERENCES game.accounts(id) ON DELETE RESTRICT`, nonblank 1–40-character alias, nonnegative revision, and four independently constrained text columns: `life_state` (`alive`, `incapacitated`, `dead`; default `alive`), `awakening_state` (`unawakened`, `awakened`; default `unawakened`), `presence_state` (`sheltered`, `active`, `committed`; default `sheltered`) and `profile_visibility` (`private`, `limited`, `public`; default `private`). Create the partial unique index on `(account_id)` for `life_state IN ('alive', 'incapacitated')`. Do not grant runtime UPDATE of `account_id` or any other mutation in this task.

- [ ] **Step 4: Confirm the core schema tests pass.** Run `pnpm exec tsx scripts/test-postgres.ts`. Expected: all existing and new integration tests pass, including the existing canonical-migration retry test; `characters` remains false.

- [ ] **Step 5: Commit the tested migration and fixture/tests.** Run `git diff --check` and `pnpm exec prettier --check tests/integration/foundation.test.ts`; commit only the two owned files with message `Add durable game account and character schema`. Do not apply the migration to managed Supabase yet.

### Task 2: Concurrent-slot and privilege regression coverage

**Files:**

- Modify: `tests/integration/foundation.test.ts` (race, role and lifecycle-independence tests)
- Modify only if a test exposes a defect: `supabase/migrations/20260927000100_game_accounts_characters.sql` (still unshipped; rerun a fresh disposable database after any edit)

**Interfaces:**

- Consumes: Task 1's two tables and partial unique index, `owner: Pool`, `database.pool` using `hunter_runtime`, and PostgreSQL role names `anon` and `authenticated`.
- Produces: integration evidence for concurrency, privilege isolation, detached history and independent lifecycle dimensions; no new application API.

- [ ] **Step 1: Add adversarial tests.** Use two independently acquired `owner` connections and launch synchronized auto-commit inserts for the same account; assert one success, one `23505`, and exactly one living row without waiting for both inserts inside open transactions. Update that row to `incapacitated` and assert another insert still fails; update it to `dead` and assert a later character can be inserted while the dead ID persists. Update only awakening, presence or visibility on a living row and assert the slot stays occupied. Query privileges for `anon` and `authenticated`, attempt a direct public-role read, and assert `hunter_runtime` can read but receives `42501` for insert/update/delete. Confirm runtime cannot update `account_id`, and that operator/ops access remains as before.

- [ ] **Step 2: Run focused real PostgreSQL verification.** Run `pnpm exec tsx scripts/test-postgres.ts`. Expected: all integration tests pass; if a security/concurrency test fails, fix the migration and rerun on a newly created disposable database before committing. Do not weaken an assertion to match an unsafe grant.

- [ ] **Step 3: Commit the regression tests and any repair.** Run `git diff --check` and `pnpm exec prettier --check tests/integration/foundation.test.ts`; commit with message `Verify game identity concurrency and database isolation`.

### Task 3: Review, evidence and task closure

**Files:**

- Create: `docs/adr/0011-durable-game-account-identity.md`
- Modify: `docs/testing/foundation-verification.md`, `docs/tasks/ledger.md`, `docs/plans/project-roadmap-and-goal.md`

**Interfaces:**

- Consumes: Tasks 1–2's migration and actual verification results.
- Produces: decision record and honest Task 2.2 completion evidence; does not claim Task 2.3 or Phase 2 complete.

- [ ] **Step 1: Run full relevant checks.** Run `pnpm verify`, `pnpm format:check`, and `pnpm exec tsx scripts/test-postgres.ts`; run `pnpm test:e2e` if the test server/browser setup is available, or use the CI browser stage. Expected: all pass; record exact counts and failures honestly. No UI behavior has changed, so browser success supports regression only.

- [ ] **Step 2: Obtain independent Sol review against the original Task 2.2 brief, approved spec, migration and test evidence.** Check FK deletion, privileges, race, history, fixture order and migration checksum behavior. Repair substantive findings and rerun affected checks before closure.

- [ ] **Step 3: Apply to managed development only after review.** Verify the existing seven managed checksum receipts match the local history and inspect the managed `auth.users(id)`/PostgreSQL version. Use the established audited Supabase migration transport with the exact reviewed SQL file, record its SHA-256 in `ops.schema_migrations`, and read back the new tables, index, grants, disabled feature flag and receipt. Confirm `game` is absent from Supabase's exposed API schemas. If transport or owner access is unavailable, invoke H0 with the prepared SQL and evidence; record managed deployment as pending without claiming it passed.

- [ ] **Step 4: Record the durable-identity decision and verification.** ADR 0011 records the detached-login decision and alternatives; verification records local/CI PostgreSQL evidence and managed migration status. Mark ledger Task 2.2 complete only if its required behavior, independent review and applicable deployment checks pass. Keep Phase 2 active with Task 2.3 next, and state that no character API/UI or gameplay authority exists yet.

- [ ] **Step 5: Commit and share the evidence.** Run `pnpm format:check` and `git diff --check`; commit only these documentation files with message `Record verified game identity schema task`, push `codex/foundation`, and confirm CI for the final SHA.
