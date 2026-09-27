# Vercel frontend preview and operator entry

The [main development site](https://project-gate-player.vercel.app) embeds the player and operator source applications in one deployment. The old standalone operator Vercel project is being retired at the owner's request. Its [deletion handoff](operator-access.md#delete-the-retired-standalone-website) follows verification of the revised main site. The browser preview remains an account-enabled foundation, not a playable game or public release.

## Repository contract

The checked-in `vercel.ts` files provide:

- Vite framework detection;
- `pnpm run build` as the project build command;
- app-local `dist` output;
- main-site routes for account callbacks, recovery and the embedded operator entry;
- a same-origin `/v1` reverse proxy on the main site controlled by `HUNTER_API_ORIGIN`;
- a neutral redirect page on the retired standalone host. It sends visitors to fixed main-site sign-in without reading the old URL's query or fragment.

With no `HUNTER_API_ORIGIN`, `/v1` is excluded from the SPA fallback. The static shell still builds, while status and Auth requests receive a real not-found response and the UI remains unavailable. Never use a localhost URL, a documentation placeholder, or a URL containing `/v1`; supply only the persistent API origin, such as the HTTPS origin issued by its eventual host.

## Project settings

The maintained hosting project is `project-gate-player`; it builds both source applications. The old `project-gate-operator` hosting project can be deleted after the main-site deployment is verified.

| Setting              | Main-site project                                    |
| -------------------- | ---------------------------------------------------- |
| Root Directory       | `apps/player`                                        |
| Framework            | Vite, pinned in `vercel.ts`                          |
| Build Command        | `pnpm run build`, from `vercel.ts`                   |
| Output Directory     | `dist`, from `vercel.ts`                             |
| Node.js              | 24.x                                                 |
| Shared-source option | Include source files outside Root Directory: enabled |

Leave the Install Command on automatic detection. The repository root contains `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `"packageManager": "pnpm@11.19.0"`. Retain `ENABLE_EXPERIMENTAL_COREPACK=1` for Development, Preview, and Production on the main-site project.

`HUNTER_API_ORIGIN` is non-secret main-site deployment configuration, not a browser variable. Use the existing public HTTPS Render API origin with no path or query. Do not add `VITE_HUNTER_API_ORIGIN`, a Supabase secret/service-role key, database URL, Mailjet credential, or TOTP material. The operator source remains in `apps/operator` after its old Vercel project is removed; the main-site build compiles its assets directly and never fetches them from that host.

## Local preparation checks

From the repository root:

```sh
pnpm exec vitest run tests/unit/vercel-frontend-config.test.ts
pnpm --filter @hunter-world/player build
pnpm --filter @hunter-world/operator build
pnpm typecheck
```

The app-local artifacts are ignored at `apps/player/dist` and `apps/operator/dist`. The player build includes the embedded operator application; the operator app-root build now creates only a neutral retired-host page. The normal root `pnpm build` writes server, player and retired-host artifacts to `dist/`.

## Exact Auth redirects

Use the main site's stable URL. Keep these exact hosted paths:

```text
https://project-gate-player.vercel.app/auth/callback
https://project-gate-player.vercel.app/account/recovery
```

Do not replace them with `https://*.vercel.app/**`. The former standalone operator callback is retired; remove any old-host Auth redirect entries before deleting that hosting project. Database membership and AAL2 TOTP remain the access gates. An unlisted route is discoverable from public assets and grants no authority.

Before the old project is deleted, verify the revised main-site deployment: direct player and account paths, `/v1/system/status`, password confirmation before registration, recovery, automatic operator routing, TOTP AAL2, current database grant checks, mobile layouts, and sign-out. Confirm its built and live operator assets come from the main-site project. Record redacted IDs/timestamps only—never passwords, tokens, email-link contents, QR payloads, or TOTP secrets.

Current platform references: [Vercel monorepos](https://vercel.com/docs/monorepos), [shared packages and source outside Root Directory](https://vercel.com/docs/monorepos/monorepo-faq), [Vite SPA routing](https://vercel.com/docs/frameworks/frontend/vite), [Vercel environment variables](https://vercel.com/docs/environment-variables), and [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
