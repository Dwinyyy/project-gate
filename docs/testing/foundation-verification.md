# Foundation and Phase 2 verification — 2026-09-14

## Current checkpoint

Completed phases: **0 and 1**. Active: **Phase 2, Task 2.1** authentication. Task 2.1 is implemented and verified locally against controlled provider boundaries, but remains **in progress** until the managed email/recovery journey and a provisioned operator TOTP journey pass. Only then may work advance to 2.2–2.3 character persistence/creation.

## Verified evidence

- Complete canonical brief, approved blueprint, 173-task ledger, 32 requirements, 28 acceptance cases, 12 invariants and ADRs persisted.
- React player/operator shells, typed public API, Fastify API and worker builds pass. Player registration, sign-in, verification callback, sign-out and recovery screens are connected through a React-neutral Supabase adapter. A provider session is not presented as server-verified until the API validates it.
- Operator password access, TOTP enrollment/challenge, AAL2 validation and the independent active-operator database grant are implemented. Enrollment QR/secret material is cleared outside the enrollment step. Administrative mutation routes remain closed.
- Latest `pnpm verify`: 81 unit/API tests, strict types, lint, boundary/credential guards and all root release builds passed. Formatting passed. Vite reported a non-failing player chunk-size optimization advisory.
- Vercel Part B repository preparation is locally verified: both application-root `pnpm run build` commands emit ignored `dist` artifacts; 16 focused tests cover origin validation, fail-closed `/v1` behavior, ordered proxy/fallback rules, both app exports, and compilation through pinned `@vercel/config` 0.7.0. No Vercel project or deployment was created. Without `HUNTER_API_ORIGIN`, `/v1` is deliberately excluded from the SPA fallback and managed Auth remains unavailable.
- Real PostgreSQL integration: 11 tests passed, including private operator tables, suspended-operator denial, runtime read-only grants, restart/retry without duplicate effects, transaction rollback and restricted permissions. Browser suite: 11 passed across foundation honesty, player accounts and operator MFA.
- **GitHub run 34835149542 passed every check** on commit `7ff0283`: clean frozen installation, verify, format, PostgreSQL integration and all 11 browser tests. The operator lock test now supplies its controlled Auth fixture and passes without local credentials.
- Supabase `project-gate` (`zsejplglpfcmcikcydgb`) is healthy in Paris. Five canonical migrations are applied with checksum receipts. The operator migration created no operator identities; runtime has read-only access while `anon` and `authenticated` have none. The current security advisor reports zero findings; performance notices are pre-existing pg-boss informational items.
- Managed restricted `hunter_runtime` connection verified over TLS. API readiness, worker startup, public Auth config projection, provider health/policy, and rejection of fabricated player/operator tokens passed through `scripts/verify-development.ts`. Owner password remains absent from ignored `.env`; the canonical runner refused to use runtime credentials, and the tested migration was applied through the audited Supabase transport. No credentials were committed or printed.
- Managed public Auth settings confirm signup enabled, email enabled with confirmation required, and phone sign-in disabled. This is a non-mutating configuration check, not evidence of a completed live email, recovery or TOTP journey.
- GitHub private `Dwinyyy/project-gate` read/write access confirmed and checkpoint pushed on `codex/foundation`. Unrelated finance project untouched.
- Local player preview at http://127.0.0.1:5173 and operator preview at http://127.0.0.1:5174 responded 200 during verification. Chromium found meaningful responsive content, labeled controls, no Vite overlay and no console errors. Restart using `pnpm dev:api`, `pnpm dev:player` and `pnpm dev:operator` when needed.

## Environment decision

User-selected managed development replaces full local Supabase containers; Docker is absent. Isolated PostgreSQL tests and seed CLI are exercised. EU-first, English, Paris hosting are approved. Pilot city remains subject to venue/tester review.

CA: official Supabase dashboard source URL documented in development-services.md. SHA-256 fingerprint `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. API and worker share verified certificate configuration.

## Limitations

Preview is an account-enabled foundation shell, not a playable game. The repository has Vercel frontend configuration but no Vercel projects, generated deployment URLs, public persistent API origin, or deployed callbacks. No dedicated test inbox or provisioned operator identity was available, so managed registration → email verification → refresh → recovery → password update → sign-out and operator sign-in → TOTP enrollment → AAL2 grant check → sign-out remain not-run. Task 2.1 therefore remains in progress. Characters, gameplay, economy, location, mobile packaging and production deployment are not implemented. A01–A28 gameplay cases remain not-run. Focused security checks are not a full audit. PostGIS belongs with geographic queries.
