# Task 2.2 — Durable game accounts and character identity

**Status:** Design for user review. No game-account or character migration has been applied.

## Intended outcome and scope

Hunter World needs a durable game identity before character creation can become functional. A player who has a Supabase login should eventually be able to create one unawakened civilian character, retain earlier characters as private history after permanent death, and never obtain two living characters through concurrent requests. An incapacitated character still occupies the living slot. Account eligibility, life, awakening, presence, profile visibility and standing must remain distinct so later gameplay does not overload a single status field.

This design covers **Task 2.2 only**: the database model, permissions and migration tests. Task 2.3 will link a verified login to a game account, create characters through a transaction, enforce cooldown and return eligibility. Tasks 2.4–2.7 will add operation-specific authority and the player UI. This migration does not enable the `characters` feature flag or make the current foundation preview playable.

The owner chose to **keep character history and detach the login** when its Supabase Auth user is deleted. The game account remains, but has no login access until a separately designed, audited recovery or deletion process resolves it. This choice does not set a legal data-erasure policy.

## Approaches considered

1. **Separate durable game account with a nullable unique Auth link — selected.** The game's account ID and character IDs survive Auth-provider deletion. PostgreSQL owns the living-slot rule. This adds an account record and an explicit link-resolution step in Task 2.3, but protects permanent history and avoids making email an identity key.
2. **Use the Auth user ID as the game-account primary key.** Fewer identifiers, but provider deletion becomes entangled with character history and account recovery. Keeping historical foreign keys to a deleted managed user is fragile.
3. **Store the current character directly on the Auth profile.** Easy for a single-character prototype, but cannot represent previous lives cleanly, makes concurrent creation harder to constrain, and encourages public/Auth metadata to become gameplay authority.

## Schema and ownership

Add one ordered, transactional SQL migration under `supabase/migrations`; keep `scripts/migrate.ts` as the only migration runner. Create a private `game` schema with default privileges revoked from `PUBLIC`. Do not add it to Supabase's exposed API schemas.

`game.accounts` has a stable UUID primary key, timestamps, a nonnegative integer `revision`, an optional `auth_user_id` that uniquely references **only** `auth.users(id)` with `ON DELETE SET NULL`, and an optional server-set `character_creation_not_before` timestamp. A null link means the game account is detached and cannot be reached merely by presenting an email address. The email is not copied into this table or used for account lookup. The timestamp represents account entry eligibility, not a character's life or presence. Task 2.3 will define and enforce cooldown decisions under a row lock; Task 2.2 only establishes storage.

`game.characters` has a stable UUID primary key, an account association via a non-cascading foreign key to `game.accounts`, a display alias, created/updated timestamps and a nonnegative revision. The association is fixed by domain policy: Task 2.3 must not grant the runtime role permission to update `account_id`. The initial lifecycle columns are independently constrained text values:

| Dimension            | Values initially supported         | New-character default / meaning                                                           |
| -------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `life_state`         | `alive`, `incapacitated`, `dead`   | `alive`; death is permanent subject only to later audited invalid-outcome reconciliation. |
| `awakening_state`    | `unawakened`, `awakened`           | `unawakened`; it grants no class or abilities by itself.                                  |
| `presence_state`     | `sheltered`, `active`, `committed` | `sheltered`; this is gameplay exposure state, not a location claim or proof of proximity. |
| `profile_visibility` | `private`, `limited`, `public`     | `private`; actual public projections and ACLs come in Task 2.6.                           |

The alias is presentation data, not a foreign key, unique account handle or authorization input. Task 2.5 will define player-facing alias and appearance validation. No rank, credentials, titles, season standing, location, MP, class, death settlement, authority grants or public dossier is inferred from these columns. Standing and credentials belong to later relations. The database defaults remain safe if a future caller omits lifecycle values, while later domain services still set and check them explicitly.

A **partial unique index on `game.characters(account_id)` where `life_state IN ('alive', 'incapacitated')`** enforces one living character per account across concurrent transactions. Dead rows remain linked to the account and do not occupy the slot. Neither deleting an Auth user nor marking a character dead automatically creates a replacement or clears cooldown. Character rows have no cascading delete path from Auth or account deletion.

## Access and authority boundaries

The migration grants the existing `hunter_runtime` role only the schema usage and reads needed to resolve game accounts and characters at this stage. It grants no character/account insert, update or delete; Task 2.3 will add narrowly scoped mutation privileges when the transaction service exists. `anon`, `authenticated` and `PUBLIC` receive no `game` schema usage or table access, including on installations where those roles already exist. Database ownership and migration credentials remain separate from runtime credentials. There is no client-side write path, security-definer function or Auth `user_metadata` role claim for gameplay state.

Task 2.3 must authenticate through the existing server Auth boundary, resolve the linked account by verified `auth.users.id`, and recheck the account, cooldown and living slot inside the committing transaction. A detached account is inaccessible to a newly created login with the same email. Task 2.4 must recheck operation-specific authority inside consequential transactions; a dead or incapacitated character cannot act simply because a cached session or UI still names it. Visibility controls in this schema do not by themselves publish any profile data.

## Migration and failure behavior

The new migration runs after the seven existing canonical migrations without changing their checksums. Supabase already owns `auth.users`; the local disposable PostgreSQL fixture must create its minimal `auth.users` table **before** running migrations so the foreign key can be installed in CI. The fixture must not be mistaken for proof of a real Supabase Auth journey. Rollback of a failed migration leaves no half-created game schema because the migration runner wraps each file transactionally.

A second simultaneous living insert must fail with PostgreSQL unique violation `23505`; application code in Task 2.3 will translate that to a safe, stable eligibility response without exposing account IDs. An invalid lifecycle value, missing parent account or unauthorized role write must fail at the database boundary. An Auth deletion sets the link to null and leaves account and character history intact. There is no automatic reassociation by email and no direct database repair procedure in this task.

## Verification and release boundary

Use the disposable `hunter_test` PostgreSQL database for focused integration tests that prove:

1. The canonical migration creates the private schema, expected constraints and safe defaults; migration rerun is idempotent through its checksum ledger.
2. Two independent connections racing to add living characters for one account produce exactly one committed living character; an incapacitated character blocks a second one, while dead history remains after a later character is created.
3. The account Auth link is unique when present; deleting the Auth fixture user nulls that link without deleting the account, its historical characters or their IDs.
4. Public Supabase roles cannot use the schema or write its tables; runtime cannot mutate or delete characters in Task 2.2. Existing operational and operator permissions still work.
5. Lifecycle columns remain independent: awakening, presence and visibility changes cannot free the living slot; invalid state values and orphaned characters are rejected.

Run relevant unit/integration, type, lint, format, boundaries, secrets and build checks; obtain independent review against the product brief and this specification. A passing migration test is not evidence that onboarding, cooldown, UI or Supabase production behavior has been implemented. Keep `ops.feature_controls.characters = false`. Applying the migration to a managed environment requires the normal reviewed deployment process and a verified managed PostgreSQL/Auth schema; no manual production edits or schema push.

## Follow-on tasks

- **2.3:** audited game-account link creation, transactional character creation, cooldown and race-safe eligibility lookup, using server time and operation identity.
- **2.4:** current actor/life/restriction checks per action; observer, incapacitated and dead authority.
- **2.5–2.7:** actual civilian onboarding, safe loading/error states, body/System/ID presentation, privacy projections, invitations and observer views.

No part of this spec asserts that the present main-site foundation is a playable game.
