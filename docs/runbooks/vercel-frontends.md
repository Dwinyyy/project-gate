# Vercel frontend preview preparation

This runbook prepares two personal, non-commercial development previews. It does not provision or deploy a Vercel project, make the foundation shell a playable game, or move the authoritative API/worker onto Vercel. A custom domain is not required; Vercel's generated project production URLs are sufficient for the managed Auth checkpoint.

## Repository contract

The checked-in `vercel.ts` files provide each application with:

- Vite framework detection;
- `pnpm run build` as the project build command;
- app-local `dist` output;
- direct-route SPA handling for account callbacks and recovery;
- an optional same-origin `/v1` reverse proxy controlled by `HUNTER_API_ORIGIN`.

With no `HUNTER_API_ORIGIN`, `/v1` is excluded from the SPA fallback. The static shell still builds, while status and Auth requests receive a real not-found response and the UI remains unavailable. Never use a localhost URL, a documentation placeholder, or a URL containing `/v1`; supply only the persistent API origin, such as the HTTPS origin issued by its eventual host.

## Project settings

Create two Vercel projects from the same GitHub repository only after the repository checkpoint is pushed.

| Setting              | Player project                                       | Operator project                                     |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Root Directory       | `apps/player`                                        | `apps/operator`                                      |
| Framework            | Vite, also pinned in `vercel.ts`                     | Vite, also pinned in `vercel.ts`                     |
| Build Command        | `pnpm run build`, from `vercel.ts`                   | `pnpm run build`, from `vercel.ts`                   |
| Output Directory     | `dist`, from `vercel.ts`                             | `dist`, from `vercel.ts`                             |
| Node.js              | 24.x                                                 | 24.x                                                 |
| Shared-source option | Include source files outside Root Directory: enabled | Include source files outside Root Directory: enabled |

Leave the Install Command on automatic detection. The repository root contains `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `"packageManager": "pnpm@11.19.0"`. In both Vercel projects, set `ENABLE_EXPERIMENTAL_COREPACK=1` for Development, Preview, and Production. Confirm the first build log actually uses pnpm 11.19.0.

`HUNTER_API_ORIGIN` is non-secret deployment configuration, but it is not a browser variable. Leave it unset until a real persistent API has an externally reachable HTTPS origin. Then set it separately for every Vercel environment that should use that API and redeploy. Do not add `VITE_HUNTER_API_ORIGIN`, a Supabase secret/service-role key, database URL, Mailjet credential, or TOTP material.

## Local preparation checks

From the repository root:

```sh
pnpm exec vitest run tests/unit/vercel-frontend-config.test.ts
pnpm --filter @hunter-world/player build
pnpm --filter @hunter-world/operator build
pnpm typecheck
```

The app-local artifacts are ignored at `apps/player/dist` and `apps/operator/dist`. The normal root `pnpm build` continues to write its release artifacts to `dist/player`, `dist/operator`, and `dist/server`.

## Exact Auth redirects after the projects exist

Use each project's stable production URL, not a one-off deployment URL. Record the actual generated URLs before changing Supabase. Add only these exact paths:

```text
https://<player-project>.vercel.app/auth/callback
https://<player-project>.vercel.app/account/recovery
https://<operator-project>.vercel.app/auth/callback
```

Do not replace them with `https://*.vercel.app/**`. The operator callback is reserved for the separately provisioned operator identity; it does not grant operator permissions. Database membership and AAL2 TOTP remain independent gates.

After the public API is connected, verify the actual deployment in order: a direct player account path, a direct recovery/callback path, `/v1/system/status`, player registration and Mailjet confirmation, player recovery, operator password sign-in, TOTP AAL2, database grant check, and sign-out. Record redacted IDs/timestamps only—never passwords, tokens, email-link contents, QR payloads, or TOTP secrets.

Current platform references: [Vercel monorepos](https://vercel.com/docs/monorepos), [shared packages and source outside Root Directory](https://vercel.com/docs/monorepos/monorepo-faq), [Vite SPA routing](https://vercel.com/docs/frameworks/frontend/vite), [Vercel environment variables](https://vercel.com/docs/environment-variables), and [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
