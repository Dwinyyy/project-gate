# Foundation verification — 2026-09-13

## Implemented

- Canonical brief, complete approved blueprint, 173-task ledger, 32-section requirements, 28 acceptance cases, 12 invariants and ADRs.
- React player/operator shells, public API contracts/client, Fastify API and worker entry points.
- Strict TypeScript, pinned lockfile, lint/format/build commands, public import guard and credential-pattern scan.
- Private PostgreSQL operational schema, limited runtime role, checksummed canonical migrations and local login seed.
- Transactional outbox, pg-boss dispatch and idempotent consumer demonstration.
- Safe request IDs/errors, liveness/readiness distinction and fail-closed operator routes.
- GitHub Actions workflow and browser tests. Workflow execution on GitHub is not yet observed.

## Evidence

- Unit/API/boundary tests: 27 passed.
- Real PostgreSQL integration: 9 passed, including concurrent consumers, rollback after receipt insertion, atomic queue publication, and process kill after business commit followed by retry without duplication.
- Production-format server/player/operator builds passed.
- `pnpm verify`: passed (strict typecheck, ESLint, public import guard, credential-pattern scan, 27 tests and all three builds).
- Playwright: 3 tests passed against real API and browser processes; desktop/mobile screenshots inspected. Navigation, failed connection presentation, operator denial and 390px overflow check passed. This is browser viewport validation, not native-device validation.
- GitHub CI is configured but has not run remotely. Full local Supabase integration remains unverified.
- Local seed CLI is now exercised by the real PostgreSQL integration suite; all 9 tests passed again using that command to initialize the restricted runtime login.
- Formatting check passed. The resumed live preview was browser-verified at http://127.0.0.1:5173 with the API connected. Restart using `pnpm dev` if that development process stops.

## Next session handoff

Current phase: Phase 1, with Task 1.4 partial. Phase 0 is complete. Next: finish the restricted Supabase runtime login, verify the API/worker against it, then Task 2.1 authentication and Tasks 2.2–2.3 character persistence/creation. Report progress at session boundaries and immediately after each whole phase passes. The preview is only the foundation shell.

Latest update: both connections are confirmed. Supabase `project-gate` (`zsejplglpfcmcikcydgb`) is healthy in Paris, PostgreSQL 17.6. Private GitHub `Dwinyyy/project-gate` grants read/write access and is configured as origin. Four canonical migrations are applied remotely with checksum receipts. Public API roles cannot access ops; runtime cannot migrate or enable feature controls. Auth health/settings returned HTTP 200. Queue helper search-path warnings were reproduced by a failing regression test and corrected with an additive migration; the remote security advisor now reports zero findings. Real PostgreSQL integration: 10 tests passed.

Historical setup blocker (resolved below): the user was asked to save SUPABASE_DATABASE_PASSWORD in ignored .env, never chat. The first attempt found no setting; an empty setting is now present for the user to fill. `scripts/bootstrap-development.ts` targets only this development project, prepares a restricted runtime credential, and removes the owner password after successful verification. Run it after the value is supplied. Its helper has unit coverage; managed bootstrap has not run successfully. If TLS needs a project CA certificate, obtain the official certificate and retain verification. The finance project was not modified.

## Limitations and next dependency

This is a foundation shell and durable-work demonstration, not a playable multiplayer release. No auth provider, account, character, real location, game economy, mobile package, or deployed service is implemented. Original A01–A28 gameplay acceptance cases remain not-run.

Task 1.4 is partial: the user-selected managed development project replaces local Supabase containers; Docker remains absent. Runtime login/connection verification is outstanding. PostGIS will be installed with geographic queries. Do not substitute fake login or owner credentials for the restricted runtime role.

Security checks are focused regression guards, not a completed security audit. Secret scanning catches selected credential patterns; import rules restrict first-party public dependencies. New asset-loading mechanisms and third-party packages still require review.

## Managed runtime checkpoint — 2026-09-13

- Owner credential was detected, used only for restricted-login setup, and removed from ignored `.env` after success. No credential was committed or printed.
- Official Supabase CA downloaded from the dashboard source's production certificate URL. Verified CA fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
- `scripts/verify-development.ts` passed: API readiness and worker startup using `hunter_runtime` over verified TLS. API and worker share certificate configuration.
- Latest local `pnpm verify` passed: 33 unit/API tests, strict types, lint, boundary/credential guards and all builds. Formatting passed. Previous real PostgreSQL integration: 10 passed; browser: 3 passed.
- GitHub initial CI failed because Bash expanded an unquoted test exclusion. Fixed in pushed commit `f22adbd`; workflow 34749205764 is pending verification.
- Completed phases: Phase 0. Current Phase 1 final CI verification. Task 1.4 runtime blocker resolved; Phase 1 closure waits for CI. Next Task 2.1 real authentication, then 2.2–2.3 character persistence and creation.
- Foundation preview remains a shell, not a playable game. No gameplay or authentication implementation is claimed.
