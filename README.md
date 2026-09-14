# Hunter World

Implementation of the [approved master blueprint](docs/plans/master-blueprint.md). This repository currently contains the foundation, not a playable game. Registration, characters, combat, location access and commerce remain unavailable.

## Requirements and startup

Use Node.js 24 and pnpm 11.19.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Player: http://127.0.0.1:5173. API: http://127.0.0.1:3001. Run `pnpm dev:operator` separately for the locked operator shell at http://127.0.0.1:5174.

Without DATABASE_URL the public shell/status endpoint works, while `/health/ready` correctly returns 503. `/health/live` only reports that the process is running. There is no authentication bypass or simulated player state.

## Database

The single SQL history is `supabase/migrations`. Copy `.env.example` to `.env` and configure a local PostgreSQL owner and separate `hunter_runtime` connection. Never use the owner URL as DATABASE_URL. Then:

```sh
pnpm db:migrate
pnpm db:seed
pnpm dev:worker
```

The seed command only initializes the runtime login on matching local connections. Migrations create private operational tables and the pinned pg-boss schema. All feature controls start false; there is no player-facing control editor. Production provisioning, managed Supabase Auth/Storage and PostGIS are later work, not implied by these migrations.

Docker/Supabase local services are not installed on the development machine. A disposable **real PostgreSQL** harness verifies the database foundation without Docker:

```sh
pnpm exec tsx scripts/test-postgres.ts
```

It generates temporary credentials and database files in ignored `.cache/postgres-tests`, stops PostgreSQL afterward, and never targets production. It does not emulate Supabase Auth, Storage or PostGIS. For an existing disposable local database named `hunter_test`, set TEST_DATABASE_URL and run `pnpm test:integration` instead. Integration tests refuse missing/nonlocal targets and never silently skip.

## Verification

```sh
pnpm verify
pnpm format:check
pnpm exec tsx scripts/test-postgres.ts
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright starts isolated API/player/operator processes on ports 3001/5173/5174; leave these ports free. Screenshots are written to ignored `test-results`. The browser suite checks honest unavailable states rather than claiming multiplayer readiness.

Production-format artifacts are built under `dist/server`, `dist/player`, and `dist/operator`. Server artifacts bundle internal workspace code and require the pinned production npm dependencies. No deployment has been performed.

## Vercel development frontends

The repository is prepared for separate player and operator Vercel projects without requiring a custom domain. The app-root commands below create Vercel-shaped static outputs in ignored app-local `dist` directories:

```sh
pnpm --filter @hunter-world/player build
pnpm --filter @hunter-world/operator build
```

This preparation does not deploy either shell. Until a real persistent API origin is assigned through the server-only Vercel variable `HUNTER_API_ORIGIN`, `/v1` deliberately remains outside the SPA fallback and account access stays unavailable. The Fastify API and worker are not Vercel frontend workloads. Follow the [Vercel frontend runbook](docs/runbooks/vercel-frontends.md) for exact project settings, generated-domain callbacks, and limitations.

## Continue implementation

Read [AGENTS.md](AGENTS.md), [task ledger](docs/tasks/ledger.md), and the relevant [original brief](docs/product/source/final-brief-v1.pdf). Current evidence and remaining setup are recorded in [foundation verification](docs/testing/foundation-verification.md). Task IDs remain stable across sessions.
