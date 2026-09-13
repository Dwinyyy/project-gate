# Development service identity

- Supabase project: `project-gate`, ref `zsejplglpfcmcikcydgb`.
- Region: Paris (`eu-west-3`); database PostgreSQL 17.6.
- URL: `https://zsejplglpfcmcikcydgb.supabase.co`.
- User-approved audience: EU-first, English. Other countries may participate where supported.
- GitHub: private `https://github.com/Dwinyyy/project-gate`, read/write access verified and local origin configured.

The three tested foundation SQL files were applied to the empty managed development project through Supabase MCP. Each application also recorded the local file's SHA-256 in `ops.schema_migrations`, preserving the existing canonical runner's history. Supabase's service-generated migration receipts are transport audit records, not a second source of SQL definitions. Never use CLI schema push/reset to create a competing history.

The application role `hunter_runtime` exists without a login password. It can read feature controls and operate the outbox/job tables, but cannot migrate or change feature controls. Configure its login through a local owner connection; never put the owner connection into DATABASE_URL or public Vite variables.

No game data, auth users, storage buckets or enabled gameplay were created during foundation provisioning. PostGIS is available but not yet installed; its schema migration and verification belong with geographic queries. Full provider/auth integration is not yet verified.
