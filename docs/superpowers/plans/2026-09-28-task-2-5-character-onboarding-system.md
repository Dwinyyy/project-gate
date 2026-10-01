# Task 2.5 Character Onboarding and System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A privately allowlisted, verified player creates one durable character with an alias and free appearance on the mobile main site, then sees that identity and honest body status after returning.

**Architecture:** Extend the canonical SQL history with constrained appearance columns and owner-audited pilot access. Reuse the Task 2.4 transaction guard and Task 2.3 receipt service, then expose a v3 private character projection through existing Fastify and client packages. The React player shell reads that projection only for the currently validated player, with explicit creation retry and a responsive System/body UI.

**Tech Stack:** PostgreSQL 17.6 in managed development, canonical Supabase SQL migrations, `pg` 8.23.0, Fastify 5.12.4, React 19.3.0, TanStack React Query 5.102.8, TypeScript 5.9.3, Vitest 5, Playwright 1.63.0 and disposable PostgreSQL.

**Spec:** [approved Task 2.5 design](../specs/2026-09-28-character-onboarding-system-design.md).

**Status:** Task 2.5 is complete. Implementation, independent reviews, local verification, managed migration, exact-revision deployment, anonymous boundaries, owner-reported Android journey, managed persistence, occupied-slot domain probe and guarded pilot closeout are evidenced below. Phase 2 remains active; Task 2.6 is next. Final candidate: `f11a955708f37eb2f5a3bcf7ec9a448597305887`.

**Execution checkpoint:** Tasks 1–5 below have been implemented and reviewed. Their original unchecked checklist steps are preserved as the historical implementation plan, not unfinished work. Task 6 acceptance is also complete. Do not repeat the implementation, owner creation journey, or managed occupied-slot probe.

## Global constraints and file map

- Preserve one living slot, permanent history, operator-only login, restricted-account denial, private `game` schema, exact retry identity and the current authority lock order. Keep `ops.feature_controls.characters=false` in managed development until reviewed code is deployed and a non-operator pilot is ready.
- One integration owner changes `supabase/migrations` and `packages/contracts`; all worker tasks below run sequentially. No Drizzle schema push, public Supabase `game` exposure, raw token in a query key, silent offline mutation or public lethal play.
- Appearance catalog v1 uses four neutral base portraits (`portrait-01`–`portrait-04`), six skin-tone IDs (`tone-01`–`tone-06`), five hair styles (`cropped`, `swept`, `curly`, `coiled`, `shaved`) and five hair colors (`black`, `brown`, `auburn`, `blond`, `silver`). All combinations render locally, have accessible names and convey no class, rank or power.
- `packages/contracts/src/appearance.ts` owns the public catalog and appearance choice schema; `supabase/migrations/20260928000200_character_onboarding.sql` owns database checks, explicit legacy defaults/backfill and private pilot/audit grants. `packages/database/src/character-authority.ts` owns the pilot lock; `character-creation.ts` owns canonical alias/appearance fingerprint and v3 private read. `apps/api/src/character-routes.ts` owns HTTP validation/mapping; `packages/client/src/character.ts` owns browser transport; `apps/player/src/character/` owns data lifecycle and UI. Keep existing Auth, operator and foundation screens intact except necessary integration.
- For an unawakened character display **MP: Dormant**. Task 2.5 does not invent HP, stamina, injury or effect values; Task 6.4 owns those resources. Task 2.6 owns profile/privacy and fullscreen ID; Task 2.7 owns dead records/observer features.
- A currently granted pilot may replay a confirmed receipt after the global switch turns off, but revocation, operator assignment or restriction blocks replay. Never cache a positive creation authorization across transactions.

## Review focus

1. **Late prior-account response:** a pending `/v1/me` from account A must not display A's alias after sign-in as B. Task 5's account-switch browser test must force this order.
2. **Uncertain create plus edited draft:** reconnect must fetch confirmed state; any explicit resend keeps the original operation ID and original draft, while an edited draft uses a new ID. Task 5's lost-response test must inspect both requests and the final view.
3. **Pilot revocation race:** a revoke that commits first must block creation/receipt replay; creation that commits first remains durable. Task 2's two-backend tests must inspect distinct blocked PIDs and stored rows.
4. **Grant without player authority:** an allowlisted operator, restricted account or provider-ineligible login must still fail. Task 2 tests each state and Task 3 confirms safe HTTP errors.
5. **Legacy character and invalid catalog:** the migration must preserve old characters with a renderable explicit v1 backfill; unknown/version-mismatched IDs must fail at both service and database layers. Tasks 1 and 3 test both.

---

### Task 1: Canonical appearance and private pilot schema

**Files:** Create `packages/contracts/src/appearance.ts` and `supabase/migrations/20260928000200_character_onboarding.sql`; modify `packages/contracts/src/index.ts`, `tests/integration/foundation.test.ts`; no UI/API edits.

**Interfaces:** Export `appearanceCatalogVersion = 1`, `appearanceCatalog`, `appearanceChoiceSchema` and `AppearanceChoice` with `{ catalogVersion: 1; presetId; skinToneId; hairStyleId; hairColorId }`. Migration adds those five NOT NULL columns to `game.characters` with named CHECK constraints and explicit v1 defaults (`portrait-01`, `tone-03`, `cropped`, `black`) to backfill old rows and keep the existing service/test fixtures functional until Task 3. Task 3's API will require an explicit choice; the database defaults remain documented for trusted legacy inserts. It creates `ops.character_pilot_access(auth_user_id REFERENCES auth.users ON DELETE CASCADE)` and append-only `ops.character_pilot_changes(request_id, auth_user_id, previous_enabled, enabled, requested_by, reason, database_actor, recorded_at)` with no cascading audit FK, plus owner-only `ops.set_character_pilot_status_by_email(p_email text, p_enabled boolean, p_requested_by text, p_reason text, p_request_id uuid DEFAULT gen_random_uuid()) RETURNS jsonb`. The SECURITY INVOKER procedure resolves exactly one normalized email, takes the canonical account advisory lock, then rechecks the same email and eligibility under Auth `FOR SHARE` before the pilot row; a grant to an operator is denied. It returns an idempotent receipt and records `session_user`. `hunter_runtime` gets SELECT on access only; public/API roles get none.

- [ ] **Step 1:** Add real-PG tests named `backfills_existing_character_with_renderable_v1_appearance`, `rejects_unknown_appearance_ids`, `owner_pilot_grant_and_revoke_are_audited_and_idempotent`, and `runtime_and_public_roles_cannot_change_pilot_access`. Assert character history survives Auth deletion, invalid catalog/version fails as owner, and receipt reuse with different terms fails.
- [ ] **Step 2:** Run `pnpm exec tsx scripts/test-postgres.ts`; expect new tests to fail for missing columns/functions while existing fixture bootstrap passes.
- [ ] **Step 3:** Add the catalog and migration, grant only required runtime columns and functions, revoke public execution in the same migration transaction, and keep `characters=false`. Use the declared v1 defaults for legacy rows and intermediate Task 1/2 service compatibility; Task 3 will explicitly insert the selected fields.
- [ ] **Step 4:** Run real-PG suite, `pnpm typecheck`, focused lint/format and `git diff --check`; expect all new grant, FK, check and checksum cases green.
- [ ] **Step 5:** Commit only Task 1 files as `feat(db): add private character pilot and appearance schema`.
- [ ] **Step 6:** Obtain independent Sol review of owner-procedure authority, audit replay, SQL grants, legacy backfill and catalog consistency; repair substantive findings before Task 2.

### Task 2: Pilot decision inside current character authority

**Files:** Modify `packages/database/src/character-authority.ts`, `packages/database/src/character-creation.ts` (`getMe` availability only), and focused `tests/integration/foundation.test.ts` cases. Do not change creation request shape yet.

**Interfaces:** `authorizeCharacterOperation(client,{authUserId,operation:'character.create'})` returns existing `charactersEnabled` for an active pilot and a new safe `pilot_unavailable` denial when no grant exists; other operations retain current semantics. Lock order is operator advisory → global feature row → private Auth row → pilot access row `FOR SHARE` → game account → owned character. `getMe` reports `feature_disabled` when either global switch or current pilot access is absent, without exposing which gate failed; restricted status still takes precedence. A pilot's already committed receipt may replay after the global switch is off, not after pilot revocation.

- [ ] **Step 1:** Write real-PG tests for ordinary verified account denied even with the global switch on; active pilot available; provider/operator/restricted denial despite a grant; revoked pilot receipt denial; and both commit orders of revoke versus create with distinct backend PIDs and durable row counts.
- [ ] **Step 2:** Run real-PG tests; expect policy/race assertions to fail with the existing unguarded pilot path, not a fixture error.
- [ ] **Step 3:** Add pilot-row lock and safe denial to the existing guard and wire effective availability into `getMe`; keep the current account/character lock ordering and receipt lookup behavior. Update existing creation fixtures to grant their intended pilot users through the owner path. Do not add a second Auth verifier or route-level authorization substitute.
- [ ] **Step 4:** Run real-PG suite, `pnpm typecheck`, focused lint/format and diff check; expect pilot, legacy and race cases green.
- [ ] **Step 5:** Commit Task 2 as `feat(identity): gate creation to private pilots`.
- [ ] **Step 6:** Obtain independent Sol review of lock order, grant/revoke race proof, receipt behavior and privilege enforcement; repair findings before Task 3.

### Task 3: Atomic appearance creation and v3 API

**Files:** Modify `packages/database/package.json`, `packages/database/src/character-creation.ts`, `packages/contracts/src/character.ts`, `apps/api/src/character-routes.ts`, `tests/integration/foundation.test.ts`, `tests/unit/character-api.test.ts`; adjust typed fixtures only where necessary.

**Interfaces:** Export `CreateCharacterInput = { displayAlias: string; appearance: AppearanceChoice }` from `packages/contracts/src/character.ts` and change `CharacterStore.create(authUserId, input: CreateCharacterInput, operationId)`. Normalize alias once as NFC plus trim, require 1–40 Unicode characters and nonblank content, reject control characters, and fingerprint `[canonicalAlias, catalogVersion, presetId, skinToneId, hairStyleId, hairColorId]` in that exact order. `GET /v1/me` advances to `schemaVersion: 3` and projects the living character's `appearance`; `POST /v1/characters` requires `{displayAlias,appearance}` and retains the current receipt response. `pilot_unavailable` maps to the same `503 CHARACTER_CREATION_DISABLED` as a false global switch; unknown fields and unsupported combinations return safe `400 INVALID_REQUEST`.

- [ ] **Step 1:** Write failing real-PG tests for atomic character/appearance/receipt insertion, normalized-alias replay, changed-appearance operation conflict, invalid combination rejection without rows, one-living-slot contention, and v3 private read of a legacy backfilled character. Write focused API tests for v3 projection, exact request schema, safe pilot denial, no-store/request ID, public status still advertising no broad character capability, and unchanged operator/recovery/invalid-token responses.
- [ ] **Step 2:** Run real-PG and `pnpm exec vitest run tests/unit/character-api.test.ts`; expect only new v3/appearance assertions to fail.
- [ ] **Step 3:** Implement server-side catalog validation, canonical fingerprint and SQL insert; then update the contract and route together. Keep existing Task 2.3/2.4 receipt and authority paths, avoid account/dead/moderation data in the public projection, and update all typed callers without an intermediate deploy.
- [ ] **Step 4:** Run focused API, real-PG, `pnpm typecheck`, lint, format, boundary and diff checks; expect v3 and transaction cases green.
- [ ] **Step 5:** Commit as `feat(identity): create and project character appearance`.
- [ ] **Step 6:** Obtain independent Sol review of normalization, fingerprint compatibility, SQL atomicity, route privacy and API compatibility; repair findings before Task 4.

### Task 4: Typed browser character transport

**Files:** Create `packages/client/src/character.ts` and `tests/unit/character-client.test.ts`; modify `packages/client/src/index.ts`.

**Interfaces:** Export `getMyCharacter(accessToken: string, signal?: AbortSignal): Promise<MeResponse>` and `createMyCharacter(accessToken: string, input: CreateCharacterInput, operationId: string, signal?: AbortSignal): Promise<CharacterCreationResponse>`. Parse the exact v3 contract and safe error envelope at runtime; use bearer and idempotency headers, `cache: 'no-store'`, and the supplied abort signal. Export typed `CharacterActionError` with stable code/requestId/retryAfter when available. Do not log tokens or put them in URLs.

- [ ] **Step 1:** Write failing client tests for v3 success, malformed response rejection, safe 401/403/409/503 errors, `Retry-After`, abort, and a create request containing the exact selected appearance/operation ID without extra fields.
- [ ] **Step 2:** Run `pnpm exec vitest run tests/unit/character-client.test.ts`; expect absent-export failures, then implement the module using the established auth-client fetch style.
- [ ] **Step 3:** Rerun focused tests, `pnpm typecheck`, lint, format and boundary checks; expect typed v3 transport green.
- [ ] **Step 4:** Commit as `feat(client): add private character transport`.
- [ ] **Step 5:** Obtain independent Sol review of runtime validation, request headers, error privacy and cancellation behavior; repair findings before Task 5.

### Task 5: Mobile onboarding, System and body drawer

**Files:** Create `apps/player/src/character/CharacterPortrait.tsx`, `CharacterOnboarding.tsx`, `CharacterSystem.tsx`, `BodyStatusDrawer.tsx`, `useCharacterSession.ts`, and focused CSS module(s); modify `apps/player/src/App.tsx`, `apps/player/src/auth/AuthProvider.tsx`, `tests/e2e/foundation.spec.ts` and/or `tests/e2e/mobile-shell.spec.ts`. Keep `App.tsx` primarily a route/layout coordinator.

**Interfaces:** `useCharacterSession` uses the validated player session and Task 4 transport; private query keys contain nonsecret Auth user/session identity and a validation generation, never the bearer token. Render private data only when its owner key equals the currently validated session; on sign-out/account replacement, cancel in-flight queries using the React Query query-function `AbortSignal` and remove private queries. The new System screen renders v3 modes; onboarding owns one explicit, idempotent create attempt per canonical draft; `BodyStatusDrawer` displays real lifecycle state, Dormant MP or an honest unavailable value, and untracked HP/stamina/injuries. The portrait composes all v1 catalog combinations locally with accessible labels and no role/gender gate.

- [ ] **Step 1:** Add failing browser tests for allowlisted onboarding → create → refresh, disabled/restricted/occupied/cooldown and service-error states, double-tap and lost response with explicit same-key retry, offline reconnect without silent replay, late account-A `/v1/me` response after B signs in, operator routing, and drawer keyboard/focus/reduced-motion behavior at 320px, 390px, short viewport and desktop.
- [ ] **Step 2:** Run focused Playwright cases; expect the new UI assertions to fail while existing Auth tests remain green. Build components and session logic behind the real validated Auth boundary; no public character fetch for guests or operator sessions.
- [ ] **Step 3:** Run focused browser tests, `pnpm typecheck`, player build, lint, format and boundary checks. Inspect the rendered phone/desktop UI with the browser tool, fix any overflow, keyboard or stale-private-data defect, then run the full browser suite.
- [ ] **Step 4:** Commit as `feat(player): add character onboarding and System`.
- [ ] **Step 5:** Obtain independent Sol review against the intended player experience and privacy/retry invariants; repair findings before Task 6. Apply the React TSX quality checklist if multiple components changed.

### Task 6: Whole-feature review, managed pilot and evidence

**Files:** Create `docs/adr/0014-character-onboarding.md`; update `docs/testing/foundation-verification.md`, `docs/tasks/ledger.md`, `docs/plans/project-roadmap-and-goal.md`, pilot runbook and spec/plan status only after actual evidence. No product behavior beyond Tasks 1–5.

- [x] **Step 1:** Independent frontend and integrated whole-feature Sol reviews found zero open substantive findings.
- [x] **Step 2:** Final `pnpm verify` passed (247 unit/API tests, typecheck, lint, import-boundary and secret checks, server/player/operator builds); format passed; disposable PostgreSQL passed 68/68. The initial E2E run timed out at 70/71, isolated retry passed 1/1, and unchanged trace-enabled full E2E passed 71/71, zero retries. First timeout cause remains unknown. Evidence: `.cache/task25-copy-repair-verification-report.md` and `.cache/task25-retry-timeout-diagnosis.md`.
- [x] **Step 3:** Managed PostgreSQL 17.6 migration applied once, all eleven canonical hashes matched, migration SHA-256 `06c34bcf235f90b4c8c072049afb5bbe2c9b63bab833d3af1d6e2386f664ce3f`; read-back confirmed schema, audit/runtime grants and no public `game` USAGE.
- [x] **Step 4:** Tag CI `36899711300` and branch CI `36901837765` passed at final SHA. Vercel and proxied API matched `f11a955708f37eb2f5a3bcf7ec9a448597305887`. Anonymous boundary passed before activation; post-activation recheck at `17:58:37Z` again returned expected 401, request IDs and `no-store`, with public capabilities false.
- [x] **Step 5a:** Audited activation read-back at `17:57:35Z` confirmed one designated grant, zero ordinary grants and matching audit receipt. Guarded enable read-back at `17:58:30Z` confirmed characters enabled, encounters/commerce disabled, the same one grant/audit and zero game accounts/characters/receipts. Safe evidence: `.cache/task25-private-activation-report.json`.
- [x] **Step 5b:** The owner replied **“Civilian pilot passed”**, reporting Android Chrome create, appearance/body-drawer usability, refresh, sign-out/sign-in and ordinary-account creation unavailable. Managed persistence read-back at `18:19:47Z` confirmed one linked identity/appearance, alive/unawakened/sheltered state and one matching receipt. This journey and physical-device use are owner-reported, not agent-observed. Evidence: `.cache/task25-owner-pilot-completion-evidence.json`.
- [x] **Step 5c:** Reviewed, checksum-pinned `hunter_runtime` domain-service probe returned `{ kind: 'occupied' }` at `18:16:34Z`, with identity/counts unchanged and no fresh-operation receipt. This is domain-service evidence, not an authenticated HTTP 409 or a second owner POST. Evidence: `.cache/task25-managed-pilot-occupied-20261002.jsonl`.
- [x] **Step 6:** Factual closure evidence is recorded in this plan, [ADR 0014](../../adr/0014-character-onboarding.md), [the pilot runbook](../../runbooks/character-pilot.md), and [the design spec](../specs/2026-09-28-character-onboarding-system-design.md); the project integration owner maintains the ledger/foundation/roadmap records. Guarded closeout at `18:20:34Z` confirmed characters, encounters and commerce off, with one designated grant/audit and the durable account, character and receipt preserved. Task 2.5 is complete; Phase 2 remains active and Task 2.6 is next. This is a private character prototype, not playable gameplay. Evidence: `.cache/task25-pilot-closed-readback.json`.

The React Query cache task follows the official [TanStack Query v5 documentation](https://github.com/tanstack/query/blob/v5.90.3/docs/reference/QueryClient.md) for `cancelQueries`/`removeQueries` and its [cancellation guide](https://github.com/tanstack/query/blob/v5.90.3/docs/framework/react/guides/query-cancellation.md) for consuming the query-function signal. Context7's closest indexed version was 5.90.3; implementation must verify the installed 5.102.8 types and behavior before coding.
