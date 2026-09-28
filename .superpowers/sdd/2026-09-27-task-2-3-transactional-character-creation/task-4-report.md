# Task 4 report — character contracts and authenticated API routes

## Implemented

- Added `GET /v1/me` and `POST /v1/characters` to the existing Fastify app. Both use the live standard-session Auth verifier and private `CharacterStore`; missing services and unexpected store failures return sanitized 503 responses.
- Kept recovery, restricted, unverified, and operator-only denials separate. The database service rechecks current operator and provider eligibility before returning a read or creation receipt. An already-issued bearer for a now-banned provider user is rejected by the verifier before store access.
- Added versioned owner-only read and creation-receipt response schemas. The POST response contains only `characterId`, `operationId`, and `createdAt`; `replayed` and current-life state are omitted. Existing no-store/request-ID headers and rate limits apply.
- Required a UUID `Idempotency-Key`, a 1–40-codepoint nonblank alias, a 1024-byte POST body, and no extra request fields. Fastify's default validator strips unknown object properties, so a pre-validation check rejects them before they can be silently discarded. API injection confirmed 40 emoji codepoints pass and 41 fail; disposable local PostgreSQL uses WIN1252, so emoji persistence was not claimed.
- Extracted the existing bearer/standard-session helper to `identity.ts` without changing the player or operator session route behavior. The API entry point now constructs the reviewed Task 3 store from the private database pool.

## Verification

- TDD red: `pnpm exec vitest run tests/unit/character-api.test.ts tests/unit/api.test.ts tests/unit/recovery-boundary.test.ts` failed all 19 new API cases with 404 before route implementation; the two existing files passed 53 tests.
- Focused final: the same command passed **75/75** tests across three files.
- `pnpm verify` passed: TypeScript, ESLint, public import boundaries, credential-pattern scan, **217/217** unit/API tests across 14 files, server/player/operator builds, and final boundary check. Vite emitted only its existing non-failing chunk-size advisory.
- `pnpm format:check` passed. `git diff --check` passed.
- `pnpm exec tsx scripts/test-postgres.ts` passed **44/44** real disposable PostgreSQL integration tests. This exercises the service/database behavior independently; it is not a managed production write or an end-to-end hosted character journey.
- `pnpm test:e2e` could not start because an existing API process owned `127.0.0.1:3001` and Playwright config sets `reuseExistingServer: false`. A temporary config with only `reuseExistingServer: true` ran the same browser suite. The first four-worker run passed **46/47**; the existing desktop mobile-shell case saw a null navigation bounding box. Its focused file then passed **3/3**, and a full one-worker rerun passed **47/47**. The temporary config was removed. Browser checks cover current foundation UI regression, not a character UI.

## Limits and handoff

The managed `characters` feature control remains off. No character onboarding UI exists until Task 2.5, and no managed Auth credential or character write was used here. API injection used a controlled Auth verifier/store except for the banned-bearer case, which used the real verifier with a controlled provider response. The disposable database tests validate real SQL behavior; a combined hosted Auth/API/DB creation journey remains unavailable at this task checkpoint. Task 4 does not mark Task 2.3 or Phase 2 complete.

## Review repair (2026-09-28)

- Canonicalized schema-validated UUID `Idempotency-Key` values to lowercase before `CharacterStore.create`. Regression uses a store that echoes the passed operation ID; uppercase and lowercase versions both receive the same lowercase UUID, return byte-identical 201 bodies, and pass the focused API test.
- Rejected U+0000 in `displayAlias` during API pre-validation as `400 INVALID_REQUEST`, before store invocation. Regression case `Civilian\u0000Injected` is included in malformed client claims.
- Evidence: `pnpm exec vitest run tests/unit/character-api.test.ts` passed 24/24; `pnpm typecheck` passed; focused ESLint passed; focused Prettier check and `git diff --check` passed.
