# ADR 0012 — Transactional character creation

Status: accepted for Task 2.3, 2026-09-28. Managed-development migration, final CI, and anonymous API revision checks passed.

## Context

Brief §04 and the Phase 2 blueprint require one living character per account while preserving dead characters as private history. Incapacitated characters still occupy the living slot. ADR 0011 established a durable game account separate from Supabase Auth, but left verified account linking, creation eligibility, and cooldown enforcement to this task. Creation must remain server-authoritative under concurrent requests, provider-account changes, and feature-control changes.

## Decision

The existing API verifies the current standard password session and verified email. The provider Auth UUID is only the login link; it is not the durable game-account identity. Any operator assignment, active or suspended, makes that login operator-only for player character APIs. Provider verification and the operator rule are checked again within the transaction, including a locked read of the current `auth.users` row, so a stale session or concurrent ban, deletion, or verification change cannot authorize a later commit.

One PostgreSQL transaction resolves or creates the game account by the verified Auth UUID, locks the account and feature-control singleton, and checks current eligibility. It compares the stored cooldown against database wall time after lock waits and enforces the living slot for both alive and incapacitated characters. The existing partial unique index remains the final concurrency guard. Creation starts alive, unawakened, sheltered, and private; dead character history is retained.

Store operation receipts in the private `game.character_creation_receipts` table, keyed by account and client-generated operation UUID. A matching, currently authorized retry returns the same private result; changed request content conflicts. Authentication, current verification, and operator exclusion are checked before disclosing any receipt. Receipts do not grant current character authority.

Keep `game` unexposed through the Data API and grant only the private runtime role the required account/character inserts, narrow row-locking column updates, receipt access, feature-control share lock, and execution of a narrowly scoped `SECURITY DEFINER` Auth-eligibility routine. Revoke `PUBLIC` execution in the same migration; the runtime receives no direct `auth.users` privileges and no ability to change account links, cooldowns, lifecycle state, or the feature toggle.

The managed `characters` feature control stays off. This task provides no player UI, onboarding, gameplay action authority, or claim that the foundation preview is playable. Task 2.4 owns later action authority; Task 2.5 owns onboarding and usable character UI. Managed development is the only deployment target for this task.

## Alternatives and consequences

- Using the Auth UUID as the game account would couple provider deletion to permanent game history and could let a same-email replacement inherit it. Keeping separate identities requires explicit verified-link resolution but preserves durable ownership.
- Checking eligibility in the client, or splitting eligibility and insertion across transactions, permits stale checks and concurrent duplicate creation. The server transaction and database constraint make the decision atomic.
- Exposing `game` through the Data API or allowing broad runtime grants would expand the public or service authority surface. Narrow grants and one private routine add migration and privilege verification work while keeping those boundaries explicit.
- The private receipt makes uncertain-response retries safe, while requiring a stable operation ID and request fingerprint. A receipt replay returns historical creation evidence, not current-life status.
- Keeping the feature control off prevents the new endpoint and migration from implicitly opening play before Tasks 2.4–2.5. The managed foundation remains non-playable.

## Deployment and verification state

The ninth canonical migration was applied in managed development with SHA-256 `74507415c6514f16855b32a0d100f59dab8b81dd40b27e29d271e948ee58ae67`. Managed read-back confirmed the migration owner is `postgres`, the Auth eligibility routine is private with its intended owner and grants, and no account, character, or creation-receipt rows exist; the `characters` feature control remains false. [GitHub run 36384195598](https://github.com/Dwinyyy/project-gate/actions/runs/36384195598) passed for `57911d06bea37dc53a57a4f08f2af5f6ae9d4b89`, including 223 unit/API tests, 44 real PostgreSQL integration tests, 47 browser tests, and the required types, lint, formatting, boundaries, secret checks, and builds. The live player proxy's `/v1/system/status` reported that exact API revision. Anonymous `GET /v1/me` and valid-shaped `POST /v1/characters` each returned `401 AUTH_REQUIRED` with a request ID, no-store behavior, and revision header. Task 2.3 is complete; Phase 2 remains active, with Task 2.4 next. No authenticated live character creation was performed, and this decision does not claim a character UI or playable game.

References: [approved Task 2.3 design](../superpowers/specs/2026-09-27-transactional-character-creation-design.md), [ADR 0011](0011-durable-game-account-identity.md), [master blueprint](../plans/master-blueprint.md), [Brief §04](../product/brief-source.md), and [foundation verification](../testing/foundation-verification.md).
