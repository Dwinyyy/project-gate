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

The development redirect allowlist is exact:

- Player registration verification: `http://127.0.0.1:5173/auth/callback`
- Player password recovery: `http://127.0.0.1:5173/account/recovery`
- Reserved operator callback for a provisioned identity: `http://127.0.0.1:5174/auth/callback`

Do not add wildcard or production redirect origins to development configuration. The player account flow requires email confirmation and passwords of at least 12 characters. Refresh-token rotation is enabled with a 10-second reuse interval. Operator access uses TOTP only: phone MFA is disabled, and a password-authenticated `aal1` session still cannot open the operator workspace. An active `ops.operator_accounts` record and current scoped permissions are a separate server-side gate.

Run `pnpm exec tsx scripts/verify-development.ts` for a non-mutating managed check. It verifies Auth health, email signup with confirmation required, phone sign-in disabled, the API's public configuration projection, rejection of fabricated player/operator tokens, restricted database readiness and worker startup. It deliberately does not register users, send email, enroll an authenticator or record any token or MFA secret. A full live journey needs a dedicated test inbox and separately provisioned operator identity.

Repository settings for the two domain-free Vercel development frontends, their fail-closed API proxy, and the exact managed redirect procedure are in [the Vercel frontend runbook](vercel-frontends.md). No Vercel project, public API, or deployed callback origin has been provisioned yet.

## Verified TLS and repeatable health check

`DATABASE_SSL=true` and `DATABASE_SSL_CA_PATH=.cache/supabase-ca.crt` select the verified provider CA for the API, worker and non-mutating verification. A missing certificate fails closed.

The public CA is downloaded from `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`, referenced by Supabase's `apps/studio/hooks/custom-content/custom-content.json`. On a new machine obtain the certificate through that official source or Database Settings, and provision a restricted runtime credential locally. Never disable certificate verification or commit `.env`. Owner bootstrap is one-time; it deliberately refuses to rotate an existing runtime connection.
