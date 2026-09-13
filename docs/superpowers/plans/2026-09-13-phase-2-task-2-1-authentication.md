# Phase 2 Task 2.1 Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real Supabase-backed player account access and operator TOTP MFA while keeping all game and operator authorization server-controlled.

**Architecture:** Browser applications obtain the public Supabase URL and publishable key from a no-store API endpoint, then use a React-neutral adapter in `@hunter-world/client` for email/password and MFA flows. Fastify independently validates every bearer token with Supabase Auth before exposing a self-session projection; operator access additionally requires an active database grant and an `aal2` token. Task 2.1 does not create characters or grant gameplay authority.

**Tech Stack:** TypeScript 5.9, React 19, React Router 7, Fastify 5, PostgreSQL 17, Supabase Auth, `@supabase/supabase-js` 2.116.0, Vitest 5, Playwright 1.63.

**Spec:** `docs/plans/master-blueprint.md` Phase 2, Brief §§4, 6, 25–27, and `docs/adr/0006-identity-storage.md`.

## Global Constraints

- Accounts and characters remain separate; Task 2.1 creates no character or character authority.
- The browser may receive only the Supabase project URL and publishable key; service-role and database credentials stay server-only.
- Clients import only contracts, client, and UI packages; Supabase SDK usage stays inside `@hunter-world/client`.
- The API validates bearer tokens against Supabase Auth and never authorizes from editable user metadata.
- Operator access requires both a current active database grant and authenticator assurance level `aal2`.
- Player MFA enrollment cannot confer operator authority.
- Passwords are at least 12 characters, email confirmation remains required, refresh-token rotation remains enabled, and recovery redirects use allow-listed application URLs.
- Browser bearer tokens are not accepted from cookies, so no cookie-based CSRF authority is introduced.
- The only SQL migration history remains `supabase/migrations`.
- Logs and error responses never include access tokens, refresh tokens, passwords, MFA secrets, database URLs, or provider internals.
- Completion evidence must distinguish unit/API simulation from a managed-provider happy-path run.

---

### Task 1: Public Auth Contracts and Server-Side Token Validation

**Files:**

- Create: `packages/contracts/src/auth.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/server/src/auth.ts`
- Modify: `packages/server/src/environment.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`
- Create: `tests/unit/auth-verifier.test.ts`
- Modify: `tests/unit/environment.test.ts`
- Modify: `tests/unit/api.test.ts`

**Interfaces:**

- Produces: `authConfigSchema`, `selfSessionSchema`, `AuthIdentity`, `AuthVerifier.verify(accessToken)`, and `createSupabaseAuthVerifier({ supabaseUrl, publishableKey })`.
- Produces: `GET /v1/auth/config` and authenticated `GET /v1/auth/session`.
- Consumes: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, which must be configured together.

- [x] **Step 1: Write failing environment and verifier tests**

```ts
expect(() => parseEnvironment({ SUPABASE_URL: 'https://project.supabase.co' })).toThrow(
  'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together',
);
await expect(verifier.verify('validated-token')).resolves.toMatchObject({
  authUserId: '11111111-1111-4111-8111-111111111111',
  aal: 'aal2',
});
await expect(verifier.verify('rejected-token')).resolves.toBeNull();
```

- [x] **Step 2: Run the focused tests and confirm they fail because the auth interfaces do not exist**

Run: `pnpm exec vitest run tests/unit/environment.test.ts tests/unit/auth-verifier.test.ts`

Expected: failure from missing auth environment properties/module, not a syntax or fixture error.

- [x] **Step 3: Add strict public schemas and environment validation**

```ts
export interface AuthIdentity {
  authUserId: string;
  email: string | null;
  emailVerified: boolean;
  sessionId: string | null;
  aal: 'aal1' | 'aal2';
}

export interface AuthVerifier {
  verify(accessToken: string): Promise<AuthIdentity | null>;
}
```

Validate an HTTPS Supabase URL in production, reject partial configuration, and keep the publishable key out of structured logs.

- [x] **Step 4: Implement provider validation against `/auth/v1/user`**

Send the candidate token only in `Authorization: Bearer ...` and the publishable key only in `apikey`. Treat non-200, malformed JSON, missing UUID, subject mismatch, expired claims, or unsupported assurance levels as unauthenticated. Parse `aal` and `session_id` only from the same token after the provider validates it and confirm its `sub` matches the returned user ID.

- [x] **Step 5: Add failing API boundary tests**

```ts
expect((await app.inject('/v1/auth/config')).statusCode).toBe(200);
expect((await app.inject('/v1/auth/session')).statusCode).toBe(401);
expect(
  (
    await app.inject({
      url: '/v1/auth/session',
      headers: { authorization: 'Bearer valid-session' },
    })
  ).json(),
).toMatchObject({ authUserId: validIdentity.authUserId, aal: 'aal1' });
```

- [x] **Step 6: Run the API test and confirm the new routes fail before implementation**

Run: `pnpm exec vitest run tests/unit/api.test.ts`

Expected: `/v1/auth/config` is 404 and `/v1/auth/session` has no authenticated behavior.

- [x] **Step 7: Implement runtime config and bearer-only session routes**

Reject missing, duplicate, non-Bearer, empty, or oversized authorization values. Give auth routes a narrower rate-limit bucket than the global API limit. Return safe error codes with request IDs and `Cache-Control: no-store`.

- [x] **Step 8: Verify the first server slice**

Run: `pnpm exec vitest run tests/unit/environment.test.ts tests/unit/auth-verifier.test.ts tests/unit/api.test.ts`

Expected: all focused tests pass with no warnings.

- [x] **Step 9: Commit**

```bash
git add packages/contracts/src/auth.ts packages/contracts/src/index.ts packages/server/src/auth.ts packages/server/src/environment.ts packages/server/src/index.ts apps/api/src/app.ts apps/api/src/index.ts tests/unit/auth-verifier.test.ts tests/unit/environment.test.ts tests/unit/api.test.ts
git commit -m "feat: validate Supabase account sessions"
```

---

### Task 2: Database-Controlled Operator Access

**Files:**

- Create: `supabase/migrations/20260913223000_operator_accounts.sql`
- Create: `packages/database/src/operator-access.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `tests/integration/foundation.test.ts`
- Modify: `tests/unit/api.test.ts`

**Interfaces:**

- Consumes: `AuthIdentity` from Task 1.
- Produces: `OperatorAccessStore.findActiveOperator(authUserId)` and authenticated `GET /v1/operator/session`.
- Produces: an `ops.operator_accounts` record keyed by Supabase Auth user UUID with explicit status and permission array.

- [x] **Step 1: Write the failing migration/integration assertions**

```ts
expect(
  (
    await owner.query(
      "SELECT has_table_privilege('anon', 'ops.operator_accounts', 'SELECT') AS allowed",
    )
  ).rows,
).toEqual([{ allowed: false }]);
await expect(findActiveOperator(database.pool, operatorId)).resolves.toEqual({
  authUserId: operatorId,
  permissions: ['feature_controls:read'],
});
```

- [x] **Step 2: Run the integration test and confirm the table is missing**

Run: `pnpm exec tsx scripts/test-postgres.ts`

Expected: failure because `ops.operator_accounts` does not exist.

- [x] **Step 3: Add the canonical SQL migration**

Create an `active|suspended` status constraint, nonempty unique permissions, timestamps, and an update trigger only if the existing migration conventions require one. Revoke schema/table access from `PUBLIC`, `anon`, and `authenticated`; grant only `SELECT` on the table to `hunter_runtime`. Do not seed a real operator identity.

- [x] **Step 4: Implement the focused database lookup**

```ts
export interface OperatorAccess {
  authUserId: string;
  permissions: string[];
}

export async function findActiveOperator(
  pool: Pool,
  authUserId: string,
): Promise<OperatorAccess | null>;
```

- [x] **Step 5: Add failing API tests for the two independent operator gates**

Assert that an active operator at `aal1` receives `MFA_REQUIRED`, a non-operator at `aal2` receives `OPERATOR_ACCESS_DENIED`, and an active operator at `aal2` receives only their ID, assurance level, and permission list.

- [x] **Step 6: Implement `GET /v1/operator/session`**

Validate identity first, query current operator status second, enforce `aal2` third, and return no provider metadata or unrelated account fields. Keep the wildcard operator route closed.

- [x] **Step 7: Verify database and API operator boundaries**

Run: `pnpm exec vitest run tests/unit/api.test.ts`

Run: `pnpm exec tsx scripts/test-postgres.ts`

Expected: focused unit and real PostgreSQL permission tests pass.

- [x] **Step 8: Commit**

```bash
git add supabase/migrations/20260913223000_operator_accounts.sql packages/database/src/operator-access.ts packages/database/src/index.ts apps/api/src/app.ts apps/api/src/index.ts tests/integration/foundation.test.ts tests/unit/api.test.ts
git commit -m "feat: enforce operator access with MFA"
```

---

### Task 3: Browser Auth Adapter

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/client/package.json`
- Create: `packages/client/src/auth.ts`
- Modify: `packages/client/src/index.ts`
- Create: `tests/unit/auth-client.test.ts`

**Interfaces:**

- Consumes: `GET /v1/auth/config`, Supabase Auth, and the public auth schemas.
- Produces: `createBrowserAuthController`, `AuthSnapshot`, `AuthController`, `TotpEnrollment`, and bearer-authenticated `getSelfSession`/`getOperatorSession` helpers.

- [x] **Step 1: Add the exact SDK dependency**

Run: `pnpm --filter @hunter-world/client add @supabase/supabase-js@2.116.0`

- [x] **Step 2: Write failing controller tests**

Cover initialization to anonymous/authenticated state, email sign-up awaiting verification, password sign-in, refresh-driven token replacement, sign-out, password-recovery state, password update, TOTP enrollment, TOTP challenge-and-verify, and cleanup of the auth subscription. Assert public controller state, not mock call counts.

- [x] **Step 3: Run the focused client test and confirm the adapter is missing**

Run: `pnpm exec vitest run tests/unit/auth-client.test.ts`

Expected: failure because `createBrowserAuthController` does not exist.

- [x] **Step 4: Implement the React-neutral controller**

```ts
export interface AuthSnapshot {
  phase: 'initializing' | 'anonymous' | 'authenticated' | 'recovery' | 'unavailable';
  user: { id: string; email: string | null } | null;
  accessToken: string | null;
  error: string | null;
}

export interface AuthController {
  getSnapshot(): AuthSnapshot;
  subscribe(listener: () => void): () => void;
  signUp(email: string, password: string, redirectTo: string): Promise<'verification-required'>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordRecovery(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  getMfaStatus(): Promise<{
    assurance: 'unenrolled' | 'aal1' | 'aal2';
    verifiedTotpFactorIds: string[];
  }>;
  enrollTotp(): Promise<TotpEnrollment>;
  verifyTotp(factorId: string, code: string): Promise<void>;
  dispose(): void;
}
```

Use `flowType: 'pkce'`, `autoRefreshToken: true`, `detectSessionInUrl: true`, and `persistSession: true`. The controller may use `getSession()` only to forward the bearer token; the API remains the identity and authorization authority.

- [x] **Step 5: Implement safe user-facing error categories**

Map provider failures to stable categories such as invalid credentials, verification required, rate limited, expired link, and unavailable. Never display raw provider payloads or store passwords/MFA codes in controller state.

- [x] **Step 6: Verify the client adapter**

Run: `pnpm exec vitest run tests/unit/auth-client.test.ts`

Expected: all controller transitions pass with no logged credentials.

- [x] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml packages/client/package.json packages/client/src/auth.ts packages/client/src/index.ts tests/unit/auth-client.test.ts
git commit -m "feat: add browser account auth adapter"
```

---

### Task 4: Player Registration, Sign-In, Verification, Sign-Out, and Recovery

**Files:**

- Create: `apps/player/src/auth/AuthProvider.tsx`
- Create: `apps/player/src/auth/AccountAccess.tsx`
- Create: `apps/player/src/auth/Recovery.tsx`
- Create: `apps/player/src/auth/AuthCallback.tsx`
- Modify: `apps/player/src/main.tsx`
- Modify: `apps/player/src/App.tsx`
- Modify: `apps/player/src/App.module.css`
- Modify: `tests/e2e/foundation.spec.ts`

**Interfaces:**

- Consumes: `AuthController` from Task 3.
- Produces: `/account/sign-in`, `/account/register`, `/account/recovery`, and `/auth/callback` routes plus a signed-in account control in the System shell.

- [x] **Step 1: Write failing browser acceptance for anonymous access**

Verify visible, keyboard-usable forms with labels; 12-character client validation; no password in URL; registration confirmation state; sign-in error state; recovery confirmation state; callback loading/error state; and no horizontal overflow at 390px.

- [x] **Step 2: Run the player browser tests and confirm the routes are absent**

Run: `pnpm exec playwright test --grep "player account access"`

Expected: failure because the account routes and controls do not exist.

- [x] **Step 3: Add a provider and focused auth screens**

Initialize once, subscribe with `useSyncExternalStore`, dispose on unmount, disable forms while requests are pending, announce outcomes with `aria-live`, and retain email but never password after an error. The existing public foundation shell remains visible to anonymous visitors; character surfaces remain explicitly unavailable until Tasks 2.2–2.5.

- [x] **Step 4: Add verification and recovery callback behavior**

The callback waits for PKCE/session processing and offers a safe retry path. The recovery page accepts a new 12-character password only while the controller is in recovery/authenticated state and signs out other sessions after a successful password change.

- [x] **Step 5: Add signed-in and sign-out states**

Show the account email as private self-only UI, provide sign-out, and call the validated self-session endpoint before describing the session as verified. A provider session without a successful API validation is shown as unavailable, not authenticated gameplay authority.

- [x] **Step 6: Verify player auth UI and unchanged foundation honesty**

Run: `pnpm test:e2e`

Expected: account journeys pass against controlled provider fixtures; existing foundation navigation and unavailable-gameplay statements remain correct.

- [x] **Step 7: Commit**

```bash
git add apps/player/src/auth apps/player/src/main.tsx apps/player/src/App.tsx apps/player/src/App.module.css tests/e2e/foundation.spec.ts
git commit -m "feat: add player account access flows"
```

---

### Task 5: Operator Sign-In and TOTP MFA

**Files:**

- Create: `apps/operator/src/auth/OperatorAuth.tsx`
- Create: `apps/operator/src/auth/useOperatorAuth.ts`
- Modify: `apps/operator/src/App.tsx`
- Modify: `apps/operator/src/App.module.css`
- Modify: `tests/e2e/foundation.spec.ts`

**Interfaces:**

- Consumes: `AuthController.getMfaStatus`, `enrollTotp`, `verifyTotp`, and authenticated `GET /v1/operator/session`.
- Produces: operator states `anonymous`, `mfa-enrollment`, `mfa-challenge`, `authorization-check`, `authorized`, and `denied`.

- [x] **Step 1: Write failing browser acceptance for operator MFA gates**

Verify password sign-in never opens the workspace at `aal1`; unprovisioned users remain denied even at `aal2`; enrollment exposes the QR only on the enrollment screen; six-digit challenge validation is enforced; and an active `aal2` operator receives the restricted shell without exposing MFA secrets afterward.

- [x] **Step 2: Run the focused operator browser tests and confirm MFA UI is absent**

Run: `pnpm exec playwright test --grep "operator MFA"`

Expected: failure because operator sign-in and MFA states do not exist.

- [x] **Step 3: Implement the operator auth state machine**

Do not offer registration in the operator app. Query current factor status after password sign-in, enroll TOTP only on explicit action, verify the challenge, then ask the API for current operator authorization. Clear factor secret and one-time code on navigation, error, success, and sign-out.

- [x] **Step 4: Preserve least privilege and honest unavailable tools**

An authorized session may show the operator workspace boundary and granted permission names, but Task 2.1 opens no feature-control mutation route. Every other `/v1/operator/*` route remains denied or unavailable.

- [x] **Step 5: Verify operator UI and API together**

Run: `pnpm exec vitest run tests/unit/api.test.ts`

Run: `pnpm exec playwright test --grep "operator"`

Expected: both independent operator gates and UI states pass.

- [x] **Step 6: Commit**

```bash
git add apps/operator/src/auth apps/operator/src/App.tsx apps/operator/src/App.module.css tests/e2e/foundation.spec.ts
git commit -m "feat: require operator TOTP assurance"
```

---

### Task 6: Configuration, Managed Verification, and Durable Evidence

**Files:**

- Modify: `.env.example`
- Modify: `supabase/config.toml`
- Modify: `scripts/verify-development.ts`
- Modify: `docs/runbooks/development-services.md`
- Modify: `docs/testing/foundation-verification.md`
- Modify: `docs/tasks/ledger.md`

**Interfaces:**

- Consumes: the completed Task 2.1 auth surfaces.
- Produces: repeatable provider/config verification and an honest Task 2.1 evidence record.

- [ ] **Step 1: Add safe configuration documentation**

Document `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as public Auth configuration, exact player/operator callback URLs, 12-character passwords, required email confirmation, refresh rotation, and TOTP-only operator MFA. State that no service-role key belongs in either browser build.

- [ ] **Step 2: Extend development verification without creating accounts**

Verify the Auth health/settings endpoint, the API public config response, rejection of a fabricated bearer token, and rejection of a fabricated operator token. Do not create unmanaged test users or send recovery email from the default verification script.

- [ ] **Step 3: Run fresh local verification**

Run: `pnpm format`

Run: `pnpm verify`

Run: `pnpm exec tsx scripts/test-postgres.ts`

Run: `pnpm test:e2e`

Run: `pnpm exec tsx scripts/verify-development.ts`

Expected: formatting, types, lint, boundaries, secret scan, unit/API tests, builds, PostgreSQL integration, browser tests, and managed Auth health checks pass.

- [ ] **Step 4: Run a managed-provider happy-path checkpoint when a dedicated test inbox and provisioned operator identity are available**

Exercise registration → email verification → sign-in → refresh → recovery → password update → sign-out. Separately exercise operator sign-in → TOTP enrollment → `aal2` challenge → current database grant check → sign-out. Record only IDs/timestamps and redacted artifacts; never record passwords, tokens, QR payloads, or MFA secrets.

- [ ] **Step 5: Update the ledger conservatively**

Mark 2.1 complete only if both automated verification and the managed-provider happy path pass. Otherwise record the implemented/tested surface and the exact unavailable external evidence while leaving 2.1 in progress. Keep 2.2–2.7 planned.

- [ ] **Step 6: Commit**

```bash
git add .env.example supabase/config.toml scripts/verify-development.ts docs/runbooks/development-services.md docs/testing/foundation-verification.md docs/tasks/ledger.md
git commit -m "docs: record phase 2 authentication evidence"
```
