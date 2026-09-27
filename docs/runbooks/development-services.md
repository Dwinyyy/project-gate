# Development service identity

- Supabase project: `project-gate`, ref `zsejplglpfcmcikcydgb`.
- Region: Paris (`eu-west-3`); database PostgreSQL 17.6.
- URL: `https://zsejplglpfcmcikcydgb.supabase.co`.
- User-approved audience: EU-first, English. Other countries may participate where supported.
- GitHub: private `https://github.com/Dwinyyy/project-gate`, read/write access verified and local origin configured.

The four tested foundation SQL files and the tested Task 2.1 operator-access SQL file were applied to the managed development project through Supabase MCP. Each application also recorded the local file's SHA-256 in `ops.schema_migrations`, preserving the existing canonical runner's history. Supabase's service-generated migration receipts are transport audit records, not a second source of SQL definitions. Never use CLI schema push/reset to create a competing history.

The application role `hunter_runtime` has a verified restricted login stored only in ignored local configuration. It can read feature controls and operate the outbox/job tables, but cannot migrate or change feature controls. Bootstrap completed through a one-time local owner connection; never put the owner connection into DATABASE_URL or public Vite variables.

No game data, unmanaged auth users, storage buckets or enabled gameplay were created during foundation provisioning or the default authentication checks. PostGIS is available but not yet installed; its schema migration and verification belong with geographic queries.

## Account authentication configuration

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are the only Auth configuration values the API may return to a browser. The publishable key identifies the Supabase project but does not grant server or database authority. Never place a service-role key, secret key, database URL or migration credential in either browser build or any `VITE_*` variable.

The original local development redirect entries are exact:

- Player registration verification: `http://127.0.0.1:5173/auth/callback`
- Player password recovery: `http://127.0.0.1:5173/account/recovery`

The separate operator callback was retired when the approved same-site operator entry began reusing the main-site session. The local operator source still runs on port 5174 during development; it does not need a distinct Auth redirect URL.

Do not add wildcard or production redirect origins to development configuration. The player account flow requires email confirmation and passwords of at least 12 characters. Refresh-token rotation is enabled with a 10-second reuse interval. Operator access uses TOTP only: phone MFA is disabled, and a password-authenticated `aal1` session still cannot open the operator workspace. An active `ops.operator_accounts` record and current scoped permissions are a separate server-side gate.

Run `pnpm exec tsx scripts/verify-development.ts` for a non-mutating managed check. It verifies Auth health, email signup with confirmation required, phone sign-in disabled, the API's public configuration projection, rejection of fabricated player/operator tokens, restricted database readiness and worker startup. It deliberately does not register users, send email, enroll an authenticator or record any token or MFA secret. A full live journey needs a dedicated test inbox and separately provisioned operator identity.

The maintained player and operator interfaces are hosted together at `https://project-gate-player.vercel.app`; the API is hosted on Render. The old `https://project-gate-operator.vercel.app` project serves only a neutral handoff pending owner deletion. These are development services, and the account-enabled shell is not gameplay. On 2026-09-27 the revised main-site deployment was READY at `bbb52ed`; its direct anonymous operator entry returned to sign-in without fetching from the old host, and the protected operator endpoint returned 401 without a session. The owner reported a passing password/TOTP authorization, sign-out and reauthentication round trip on this revision. The earlier 2026-09-24 frontend and API revision match at `5c1bc5c` and both real recovery journeys remain recorded in [foundation verification](../testing/foundation-verification.md).

Repository settings, the fail-closed API proxy and exact hosted redirect paths are in [the Vercel frontend runbook](vercel-frontends.md). Recheck the managed allowlist before the next mailbox-driven run; never infer it from a healthy frontend response. Use [the operator access runbook](operator-access.md) to prepare the designated identity's attributable grant.

The API now accepts Render's automatically supplied `RENDER_GIT_COMMIT` only as a full Git SHA and returns it as `x-hunter-revision` on responses. Once this code is deployed, inspect that header through `/v1/system/status` on the existing player proxy to match the running API to the reviewed commit. An absent header on an older build does not establish its revision. A 200 readiness response establishes availability only. [Render documents the default commit variable](https://render.com/docs/environment-variables).

## Verified TLS and repeatable health check

`DATABASE_SSL=true` and `DATABASE_SSL_CA_PATH=.cache/supabase-ca.crt` select the verified provider CA for the API, worker and non-mutating verification. A missing certificate fails closed.

The public CA is downloaded from `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`, referenced by Supabase's `apps/studio/hooks/custom-content/custom-content.json`. On a new machine obtain the certificate through that official source or Database Settings, and provision a restricted runtime credential locally. Never disable certificate verification or commit `.env`. Owner bootstrap is one-time; it deliberately refuses to rotate an existing runtime connection.
