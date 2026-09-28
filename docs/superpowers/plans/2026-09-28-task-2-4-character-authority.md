# Task 2.4 Character Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce current, operation-specific character authority in the committing transaction and expose a safe private state for later player screens.

**Architecture:** Add one private game-account restriction column and a focused `character-authority` database module that checks named operations under a consistent lock order. Reuse that module in the existing character store, then advance the private `/v1/me` contract; later domains must combine it with their own transactional checks. The managed character flag remains off.

**Tech Stack:** PostgreSQL 17.6, Supabase Auth, canonical SQL migrations, `pg` 8.23.0, Fastify 5.12.4, TypeScript 5.9.3, Vitest 5, disposable embedded PostgreSQL and Playwright.

**Spec:** [approved Task 2.4 design](../specs/2026-09-28-operation-specific-character-authority-design.md).

**Status:** Ready for owner review; Task 2.4 product code is not implemented. The specification-only [CI run 36386127400](https://github.com/Dwinyyy/project-gate/actions/runs/36386127400) passed verification, formatting and real PostgreSQL but failed 1/47 browser tests when an existing cross-tab MFA test's `page.evaluate` lost its execution context during navigation. The immediately preceding documentation checkpoint [CI run 36385806367](https://github.com/Dwinyyy/project-gate/actions/runs/36385806367) passed. This is not evidence of a Task 2.4 product regression, and the failing run is not counted as green; Task 4 must diagnose and address the navigation-sensitive test if it recurs before final CI acceptance.

## Global Constraints

- Work in the existing `codex/foundation` checkout as the owner requested; preserve unrelated changes. Use only `supabase/migrations` for schema history and leave `ops.feature_controls.characters = false` in managed development.
- A provider-level ban, invalid/recovery-only/OTP-only session, unverified email, or any active/suspended operator assignment never grants player authority. Do not place server/database/private content in public bundles.
- Game restriction is separate from provider, operator, life, awakening, presence, visibility and cooldown. Restricted accounts can read their private records and use future out-of-character support but cannot create or act. Do not add a moderation write route or imply support UI exists.
- Alive and incapacitated occupy the one living slot. Incapacitated, dead and observer states cannot perform ordinary actions; explicit rescue response remains denied until its own rule exists. Unknown operation names fail closed.
- Authorize inside the eventual mutation transaction: operator advisory lock, applicable feature lock, locked Auth check, account lock, owned-character lock, revision comparison, then domain checks and commit. Keep existing retry identity and receipts; reauthorize before disclosing them.
- Keep `game` unexposed via Supabase Data API and preserve narrow runtime grants. No public gameplay, live character creation, or playable-preview claim follows from this task.

## File map and interfaces

| File                                                                     | Responsibility                                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260928000100_character_authority.sql`             | Account access-state constraint/default and narrow character row-lock grant; no moderator mutation path.        |
| `packages/database/src/character-authority.ts`                           | Named-operation policy and transaction-scoped actor/account/character locking, ownership and revision decision. |
| `packages/database/src/character-creation.ts`                            | Consume the guard for creation/receipt authorization and private `getMe` mode/eligibility.                      |
| `packages/contracts/src/character.ts`                                    | Private `/v1/me` v2 schema and restricted creation status.                                                      |
| `apps/api/src/character-routes.ts`                                       | Map typed restriction denial, preserve Auth errors and no-store/private output.                                 |
| `tests/integration/foundation.test.ts`                                   | Migration grants, real policy/race/creation behavior with runtime and owner connections.                        |
| `tests/unit/character-api.test.ts`                                       | Response and denial mapping without exposing private details.                                                   |
| `docs/adr/0013-character-authority.md`, verification, ledger and roadmap | Record decision, actual checks and next Task 2.5 without claiming Phase 2 complete.                             |

The guard's exported interface is:

```ts
export type CharacterOperation =
  | 'account.records.read'
  | 'public.content.read'
  | 'character.create'
  | 'character.profile.update'
  | 'character.rescue.respond';

export type CharacterAuthorityInput =
  | {
      authUserId: string;
      operation: 'account.records.read' | 'public.content.read' | 'character.create';
    }
  | {
      authUserId: string;
      operation: 'character.profile.update' | 'character.rescue.respond';
      characterId: string;
      expectedRevision: string;
    };

export type CharacterAuthorityResult =
  | { kind: 'allowed'; accountId: string | null; charactersEnabled: boolean | null }
  | {
      kind: 'denied';
      reason:
        | 'operator_only'
        | 'auth_ineligible'
        | 'account_restricted'
        | 'character_missing'
        | 'stale_revision'
        | 'incapacitated'
        | 'dead_or_observer'
        | 'rescue_unavailable';
    };

export function authorizeCharacterOperation(
  client: PoolClient,
  input: CharacterAuthorityInput,
): Promise<CharacterAuthorityResult>;
```

`expectedRevision` is a canonical nonnegative decimal string so PostgreSQL `bigint` does not lose precision in JavaScript. `character.create` returns the locked feature value in `charactersEnabled` but does not reject solely because it is false: the existing receipt replay must remain possible after disabling creation. The caller checks the flag before a new insert. `account.records.read` and authenticated `public.content.read` may succeed with `accountId: null`; no read creates a game account. `character.profile.update` can pass the common life/ownership gate but still has no endpoint or domain grant. Rescue always returns `rescue_unavailable` until an explicit later rule is implemented. A future operation must be added to this closed union and tested before use.

## Review Focus

1. A guessed foreign character UUID must receive the same safe `character_missing` denial as an absent UUID; Task 2 tests both and the API must not reveal ownership.
2. A positive-looking stale `GET /v1/me` result must not authorize a mutation after a concurrent restriction or death; Task 2 tests both commit orderings with distinct backends and durable effects.
3. A restricted account must not retrieve an old creation receipt even if the feature is disabled or the operation key matches; Task 3 tests the receipt path before response projection.
4. An account with dead history and an expired cooldown must remain an observer until it creates a new character; Task 3 tests that mode independently of creation eligibility.
5. A `bigint` revision beyond JavaScript's safe integer range must compare exactly; Task 2 tests decimal-string matching and mismatch without numeric conversion.

---

### Task 1: Private Account Restriction Migration

**Files:** Create `supabase/migrations/20260928000100_character_authority.sql`; modify `tests/integration/foundation.test.ts` only in migration/grant cases.

**Interfaces:** Produces `game.accounts.access_state text NOT NULL DEFAULT 'active' CHECK (access_state IN ('active','restricted'))` and `hunter_runtime`'s `UPDATE (revision)` grant on `game.characters` solely for a row lock. Runtime receives no `UPDATE(access_state)` or life/owner mutation grant; public roles receive none.

- [ ] **Step 1: Write failing real-PG tests** for default active, valid restricted owner update, invalid value rejection, runtime/public denial of access-state/life edits, runtime `SELECT ... FOR SHARE` on a character, and canonical checksum replay. Assert `characters` flag remains false and `game` public grants remain absent.
- [ ] **Step 2: Run `pnpm exec tsx scripts/test-postgres.ts`.** Expected red: missing `access_state`/row-lock privilege, with fixture bootstrap otherwise healthy.
- [ ] **Step 3: Add the one canonical migration.** Constrain/default `access_state`, grant only `UPDATE (revision)` on characters to `hunter_runtime`, revoke accidental public/API grants in the same migration, and do not add a state-changing function or trigger that runtime can invoke.
- [ ] **Step 4: Rerun `pnpm exec tsx scripts/test-postgres.ts`, `pnpm typecheck`, focused lint/format and `git diff --check`.** Expected all pass, including actual restricted-role role/column probes.
- [ ] **Step 5: Commit only Task 1 files** as `feat(db): add private account restriction state`.
- [ ] **Step 6: Obtain independent Sol review** of SQL/grants/tests and repair substantive findings before Task 2.

### Task 2: Transaction-Scoped Named-Operation Guard

**Files:** Create `packages/database/src/character-authority.ts`; modify `packages/database/src/index.ts` export and focused `tests/integration/foundation.test.ts` policy/race cases. Do not modify `character-creation.ts` yet.

**Interfaces:** Consumes Task 1 column/grant and existing `game.lock_eligible_auth_user(uuid)`/operator advisory-lock convention. Produces `authorizeCharacterOperation(client, input)` with the exact union above for Task 3; caller owns `BEGIN`/`COMMIT` and cannot reuse the result after transaction end.

- [ ] **Step 1: Write failing real-PG policy and two-backend race tests** for active/no-account read, alive profile gate, incapacitated/dead/observer denial, restricted read versus mutation, operator exclusion, unavailable Auth, foreign/missing UUID equivalence, invalid/unknown operation fail-closed, and exact revision comparison at `9007199254740993` versus `9007199254740992`. For each restriction/death race, hold the state transition first and then the authorized action first; observe distinct blocked backend PIDs and inspect a test-only durable action marker plus final state.
- [ ] **Step 2: Run `pnpm exec tsx scripts/test-postgres.ts`.** Expected red because the module/export is absent; do not accept a fixture or connection failure as the red state.
- [ ] **Step 3: Implement the guard in the file above.** Use UUID validation, the existing advisory key, optional feature `FOR SHARE`, the private Auth routine, account `FOR SHARE` (or `FOR UPDATE` for create), and owned character `FOR SHARE` in that order. Compare revisions as decimal strings/SQL `bigint`, never JS Number. Unknown runtime strings must deny even if TypeScript callers are typed. Read operations return only minimal private context; no dead history is projected.
- [ ] **Step 4: Run fresh real-PG, `pnpm typecheck`, focused lint/format and `git diff --check`.** Expected all policy and actual blocked-backend race tests pass; owner state writes occur only in disposable fixtures.
- [ ] **Step 5: Commit Task 2 files** as `feat(db): guard named character operations`.
- [ ] **Step 6: Obtain independent Sol review** of lock order, race proof, privilege behavior and policy; repair substantive findings before Task 3.

### Task 3: Apply Guard to Existing Character Service

**Files:** Modify `packages/database/src/character-creation.ts` and `tests/integration/foundation.test.ts`; consume Task 2 export without duplicate advisory/Auth/account authorization code.

**Interfaces:** Retain `CharacterStore.getMe(authUserId)` and `.create(authUserId, displayAlias, operationId)` signatures. Change `MeResult` to `{kind:'player'; schemaVersion:2; mode:'onboarding'|'active'|'incapacitated'|'observer'|'restricted'; character: ... | null; creation:{status:'available'|'occupied'|'cooldown'|'feature_disabled'|'restricted';notBefore:string|null}}`; include a decimal-string `revision` in living `character`. Add `account_restricted` to `CreateCharacterResult` denials. Do not return dead history or account IDs.

- [ ] **Step 1: Write failing service/real-PG tests** for never-played onboarding, alive, incapacitated, dead-history observer before and after cooldown, restricted precedence with living/null character, disabled flag, and no account row from `getMe`. Verify the returned revision string is exact. Include restricted creation and receipt replay with matching/different operation IDs and flag off/on, plus a restriction racing with creation; inspect durable account/character/receipt counts and distinct blocked backend IDs.
- [ ] **Step 2: Run `pnpm exec tsx scripts/test-postgres.ts`.** Expected red on the new mode/status/guard integration rather than unrelated bootstrap.
- [ ] **Step 3: Refactor `getMe` and `create` to call Task 2 guard inside their existing transactions.** Preserve creation's account lock, wall-clock cooldown, living-slot index, fingerprint and stable receipt result. Recheck restriction before account insertion or receipt lookup; return `account_restricted` without leaking a receipt. For `getMe`, infer observer from existing dead history or cooldown without exposing the historical rows.
- [ ] **Step 4: Run real-PG, `pnpm typecheck`, focused lint/format and `git diff --check`.** Expected all new mode, receipt, flag and race assertions pass.
- [ ] **Step 5: Commit Task 3 files** as `feat(identity): enforce account restriction in character service`.
- [ ] **Step 6: Obtain independent Sol review** of receipt timing and observer semantics; repair substantive findings before Task 4.

### Task 4: Private API Contract and Denial Mapping

**Files:** Modify `packages/contracts/src/character.ts`, `apps/api/src/character-routes.ts`, `tests/unit/character-api.test.ts`; repair the existing navigation-sensitive poll in `tests/e2e/foundation.spec.ts`; adjust only other affected typed fixtures/callers. No new gameplay route.

**Interfaces:** `/v1/me` schemaVersion `2`, mode union, current living character `revision` as a decimal string, and creation `restricted` status; same private URL and cache policy. `POST /v1/characters` maps `account_restricted` to HTTP 403 `ACCOUNT_RESTRICTED`, while provider/operator/receipt/flag denials keep established mappings.

- [ ] **Step 1: Write failing API tests** for all five modes, safe restricted 403, no dead/account/moderation details, no-store/request ID, replay blocked after restriction, and unchanged recovery/OTP/operator/invalid-token responses.
- [ ] **Step 2: Run `pnpm exec vitest run tests/unit/character-api.test.ts`.** Expected red on v2 contract or missing restriction mapping.
- [ ] **Step 3: Update the contract and route mapping** with exact v2 fields/status above; keep `GET /v1/me` read-only and never accept client account, state or character ownership claims. Do not add client-local action permission logic.
- [ ] **Step 4: Repair the independently observed cross-tab MFA test race** at `tests/e2e/foundation.spec.ts:604–610`: its local-storage `page.evaluate` runs during an expected navigation and can throw before `expect.poll` retries. Make only the navigation-context-loss case retry within the poll; preserve the token assertion and propagate other errors. Repeat that focused case enough times to exercise navigation, and record the result.
- [ ] **Step 5: Run focused API tests, `pnpm verify`, `pnpm format:check`, real-PG suite and the full browser regression suite.** Do not count the previously failed CI attempt as a pass.
- [ ] **Step 6: Commit Task 4 files** as `feat(api): expose private character authority state`.
- [ ] **Step 7: Obtain independent Sol review** of API privacy/compatibility and the focused test repair; repair substantive findings before Task 5.

### Task 5: Whole-Feature Review, Managed Development and Evidence

**Files:** Create `docs/adr/0013-character-authority.md`; modify `docs/testing/foundation-verification.md`, `docs/tasks/ledger.md`, `docs/plans/project-roadmap-and-goal.md` only after evidence exists. Use the approved spec/plan and Task 1–4 code as review inputs.

**Interfaces:** Produces an independently reviewed Task 2.4 checkpoint and accurate Phase 2/Task 2.5 handoff; no product behavior beyond Tasks 1–4.

- [ ] **Step 1: Obtain independent Sol whole-feature review** against the original brief, approved spec, lock/permission/concurrency cases and actual tests.
- [ ] **Step 2: Repair substantive review findings and rerun affected checks** before any managed mutation; record a clean rereview or explicitly document unresolved issues.
- [ ] **Step 3: Run final local `pnpm verify`, `pnpm format:check`, disposable PostgreSQL and browser suites** serially; record exact counts/revision, failures and limitations.
- [ ] **Step 4: Preflight managed Supabase read-only**: verify all prior canonical migration hashes, trusted owner/role grants, current PostgreSQL columns, no unexpected game accounts/characters/receipts, `game` absent from selected exposed schemas by existing owner evidence, and `characters = false`. Do not log private identities or secrets.
- [ ] **Step 5: Apply only the reviewed Task 2.4 SQL migration through the audited Supabase transport.** Read back exact checksum/owner, access-state constraint/default, narrow grants, disabled flag and row counts. If topology differs, stop the managed mutation and record the blocker; do not use schema push or ad hoc repair SQL.
- [ ] **Step 6: Push reviewed code; require final-SHA CI and exact deployed API revision.** Exercise anonymous `/v1/me` and creation denial, request IDs/no-store and any available safe disabled-feature boundary. Do not claim live restricted-account or authenticated action tests that were not performed.
- [ ] **Step 7: Write ADR 0013 and update evidence/ledger/roadmap** to actual implementation and verification only. Mark Task 2.4 complete only after review, local/CI real-PG evidence, managed migration read-back and applicable deployed API boundary pass. Keep Phase 2 active with Task 2.5 next; the hosted site remains an account-enabled foundation preview, not playable.
