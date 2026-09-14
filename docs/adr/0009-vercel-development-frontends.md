# ADR 0009 — Vercel development frontends

Status: accepted for personal, non-commercial development previews; no Vercel project or deployment is provisioned by this decision.

## Context

Phase 2 managed Auth journeys need stable public browser origins, but no custom domain exists yet. The player and operator applications are Vite single-page applications in a pnpm monorepo and both depend on shared workspace packages. The Fastify API and pg-boss worker are persistent authoritative processes and remain unsuitable for this frontend-preview decision.

Vercel supplies generated `vercel.app` project URLs, supports one project per monorepo application, and requires an SPA rewrite for direct browser routes. Vercel Hobby is limited to personal, non-commercial use, so it is acceptable only for the present private development preview and is not approval for commercial, public, staging, or production hosting.

## Decision

- Use two Vercel projects connected to the same Git repository, with Root Directories `apps/player` and `apps/operator`.
- Enable **Include source files outside of the Root Directory in the Build Step** because both applications consume explicit pnpm workspace dependencies and their `vercel.ts` files share a repository-level configuration builder.
- Use Node.js 24, Vite, `pnpm run build`, and app-local `dist` output. Set Vercel project variable `ENABLE_EXPERIMENTAL_COREPACK=1` so the root `packageManager` pin selects pnpm 11.19.0.
- Keep browser API calls same-origin. A build-time, non-`VITE_*` variable named `HUNTER_API_ORIGIN` may contain the persistent API's public origin. It is accepted only as a public HTTPS origin with no credentials, path, query, fragment, loopback host, or documentation placeholder.
- When `HUNTER_API_ORIGIN` is set, route `/v1/:path*` to that origin before the SPA fallback. When it is absent, install no API rewrite and explicitly exclude `/v1` from the SPA fallback. The shell can render, but API/Auth requests fail visibly instead of returning `index.html` with a false 200 response.
- Do not put Supabase secret/service-role keys, database credentials, provider tokens, or the API origin in a client-exposed `VITE_*` variable. The existing API remains the only source of the public Supabase URL and publishable key.
- Keep the Fastify API and worker on persistent hosting. This decision does not convert either process to a Vercel Function or move database authority into the frontends.
- Use the stable generated project URLs for the managed-provider checkpoint. Add only exact player callback and recovery URLs to the Supabase redirect allowlist; do not use a wildcard for ephemeral preview deployments.

## Consequences

The repository can build Vercel-shaped player and operator artifacts before a public API exists. Authentication is intentionally unavailable in such a shell-only deployment. A real managed journey additionally requires a persistent public API origin, Vercel projects and environment settings, exact Supabase redirects, Mailjet delivery, a dedicated test inbox, and a provisioned operator identity with TOTP.

The two generated project URLs are sufficient for development, so buying a domain is not a prerequisite. Vercel Hobby cannot be treated as the commercial production host; production hosting, separate staging credentials, domains, monitoring, backups, quotas, and release approval remain later decisions and tasks.

This ADR partially supersedes ADR 0007 only for pre-production player/operator previews. It preserves ADR 0007's persistent API/worker boundary and its production planning decision.

Sources: [Vercel monorepos](https://vercel.com/docs/monorepos), [monorepo shared packages](https://vercel.com/docs/monorepos/monorepo-faq), [Vite SPA routing](https://vercel.com/docs/frameworks/frontend/vite), [programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts), [build and Corepack settings](https://vercel.com/docs/builds/configure-a-build), and [Hobby plan](https://vercel.com/docs/plans/hobby).
