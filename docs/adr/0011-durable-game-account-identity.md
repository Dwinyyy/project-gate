# ADR 0011 — Durable game account and character identity

Status: accepted for Task 2.2, 2026-09-27. Character creation and account-link recovery remain future work.

## Context

Hunter World allows one living character per account, including an incapacitated character, while preserving dead characters as private history. Supabase Auth identifies a login, but an Auth user may be deleted independently of the game's permanent character record. Login, life, awakening, presence, profile visibility and standing have different meanings and must not be collapsed into one status.

## Decision

Use a durable `game.accounts` UUID separate from the Supabase Auth user ID. Its nullable, unique `auth_user_id` references only `auth.users(id)` with `ON DELETE SET NULL`. Deleting an Auth user detaches the login while leaving the account, character associations and character IDs intact. A later user with the same email cannot inherit that account. A separately designed, audited recovery or deletion process must resolve detached accounts; this decision does not establish a legal erasure policy.

Store characters in the private `game.characters` table with a noncascading account foreign key and separate, constrained life, awakening, presence and profile-visibility columns. Initial defaults are alive, unawakened, sheltered and private. A partial unique index on `account_id` where life is alive or incapacitated makes the living slot a database invariant across concurrent transactions. Dead history remains associated with the account. A character's alias is presentation data, never an authorization key. Account cooldown storage exists, but Task 2.3 will define and enforce its transaction semantics.

Only `hunter_runtime` may read these private tables at this stage. It cannot insert, update or delete accounts or characters; public API roles cannot use the `game` schema. The `characters` feature flag stays disabled. No character-creation API, UI, login-to-account association service, cooldown decision or gameplay authority is introduced by this schema.

## Alternatives and consequences

Using the Auth user ID as the game-account key would entangle provider deletion with permanent history. Keeping the active character on an Auth profile would make earlier lives and concurrent creation harder to constrain and invite Auth metadata into gameplay authority. The separate account adds an explicit verified-link resolution step to Task 2.3, but keeps provider lifecycle and character history independent.

The canonical migration is `20260927000100_game_accounts_characters.sql` under `supabase/migrations`. The local fixture installs a minimal `auth.users` before the migration; this does not verify a real Supabase Auth journey. The migration creates no `game` functions. PostgreSQL's global default grants function `EXECUTE` to `PUBLIC`, and a schema-local default privilege revocation cannot cancel it: every future migration creating a `game` function must revoke `PUBLIC` execution in the same transaction and test the resulting grants. Keep `game` out of Supabase's exposed API schemas.

Task 2.3 must recheck the verified login link, living slot and cooldown inside the committing transaction, translate unique violations into a safe response, and add only the mutation privileges its service needs. Later tasks must enforce current actor authority and privacy separately; a visibility column does not publish a profile. No death or Auth deletion automatically creates another character.

References: [approved Task 2.2 design](../superpowers/specs/2026-09-27-game-account-character-schema-design.md), [verification evidence](../testing/foundation-verification.md), [task ledger](../tasks/ledger.md).
