# Development service identity

- Supabase project: `project-gate`, ref `zsejplglpfcmcikcydgb`.
- Region: Paris (`eu-west-3`); database PostgreSQL 17.6.
- URL: `https://zsejplglpfcmcikcydgb.supabase.co`.
- User-approved audience: EU-first, English. Other countries may participate where supported.
- GitHub: private `https://github.com/Dwinyyy/project-gate`, read/write access verified and local origin configured.

The four tested foundation SQL files were applied to the empty managed development project through Supabase MCP. Each application also recorded the local file's SHA-256 in `ops.schema_migrations`, preserving the existing canonical runner's history. Supabase's service-generated migration receipts are transport audit records, not a second source of SQL definitions. Never use CLI schema push/reset to create a competing history.

The application role `hunter_runtime` has a verified restricted login stored only in ignored local configuration. It can read feature controls and operate the outbox/job tables, but cannot migrate or change feature controls. Bootstrap completed through a one-time local owner connection; never put the owner connection into DATABASE_URL or public Vite variables.

No game data, auth users, storage buckets or enabled gameplay were created during foundation provisioning. PostGIS is available but not yet installed; its schema migration and verification belong with geographic queries. Full provider/auth integration is not yet verified.

## Verified TLS and repeatable health check

Run `pnpm exec tsx scripts/verify-development.ts` to check managed API readiness and worker startup without owner privileges. `DATABASE_SSL=true` and `DATABASE_SSL_CA_PATH=.cache/supabase-ca.crt` select the verified provider CA for both processes. A missing certificate fails closed.

The public CA is downloaded from `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`, referenced by Supabase's `apps/studio/hooks/custom-content/custom-content.json`. On a new machine obtain the certificate through that official source or Database Settings, and provision a restricted runtime credential locally. Never disable certificate verification or commit `.env`. Owner bootstrap is one-time; it deliberately refuses to rotate an existing runtime connection.
