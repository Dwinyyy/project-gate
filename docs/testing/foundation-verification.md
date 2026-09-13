# Foundation verification — 2026-09-13

## Current checkpoint

Completed phases: **0 and 1**. Next: **Phase 2, Task 2.1** authentication, then 2.2–2.3 character persistence/creation. Authentication remains planned, not implemented.

## Verified evidence

- Complete canonical brief, approved blueprint, 173-task ledger, 32 requirements, 28 acceptance cases, 12 invariants and ADRs persisted.
- React player/operator shells, typed public API, Fastify API and worker builds pass. Operator access fails closed.
- Latest `pnpm verify`: 33 unit/API tests, strict types, lint, boundary/credential guards and all builds passed. Formatting passed.
- Real PostgreSQL integration: 10 tests passed, including restart/retry without duplicate effects, transaction rollback and restricted permissions. Browser suite: 3 passed.
- **GitHub run 34749247587 passed every check** on commit `f1b26e2`: clean frozen installation, verify, format, PostgreSQL integration and browser tests. Initial Linux wildcard failure was corrected.
- Supabase `project-gate` (`zsejplglpfcmcikcydgb`) is healthy in Paris. Four canonical migrations applied with checksum receipts. Security advisor reported zero findings after queue function search-path fix.
- Managed restricted `hunter_runtime` connection verified over TLS. API readiness and worker startup passed through `scripts/verify-development.ts`. Owner password removed from ignored `.env` after bootstrap; no credentials committed or printed.
- Auth provider health/settings returned HTTP 200; this does not establish implemented authentication flows.
- GitHub private `Dwinyyy/project-gate` read/write access confirmed and checkpoint pushed on `codex/foundation`. Unrelated finance project untouched.
- Local preview at http://127.0.0.1:5173 responded 200; API readiness returned ready. Chromium loaded System · Hunter World with no page errors. Restart using `pnpm dev` when needed.

## Environment decision

User-selected managed development replaces full local Supabase containers; Docker is absent. Isolated PostgreSQL tests and seed CLI are exercised. EU-first, English, Paris hosting are approved. Pilot city remains subject to venue/tester review.

CA: official Supabase dashboard source URL documented in development-services.md. SHA-256 fingerprint `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. API and worker share verified certificate configuration.

## Limitations

Preview is a foundation shell, not a playable game. No player authentication, characters, gameplay, economy, location, mobile package or production deployment is implemented. A01–A28 gameplay cases remain not-run. Focused security checks are not a full audit. PostGIS belongs with geographic queries. Preserve server authority and hidden-content boundaries as Phase 2 begins.
