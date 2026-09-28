# ADR 0013 — Operation-specific character authority

Status: accepted and implemented for Task 2.4, 2026-09-28. Final-SHA CI, managed migration, and deployed API boundary checks passed. Phase 2 remains active.

## Context

Brief §§04, 20, and 25–27 require a durable character lifecycle, private history, meaningful observer access, and consequential actions governed by current server state. A session, a previously returned `/v1/me` view, or a character UUID cannot authorize a later command. Incapacitated characters occupy the living slot but cannot take ordinary actions; death does not restore the old character's authority. A game restriction must remain distinct from provider bans, operator assignment, life, awakening, presence, visibility, and cooldown.

## Decision

Use a closed, named-operation authority guard inside the same PostgreSQL transaction that commits each character action. The guard resolves the current verified Auth identity, excludes operator-assigned logins, locks account and owned-character state in the established order, and checks the expected character revision. Unknown operations deny. The caller retains responsibility for domain-specific ownership, location, quantity, rules, and version checks in that transaction. Guard results are transaction-scoped and cannot be cached or reused as action tokens.

The initial operation names are `account.records.read`, `public.content.read`, `character.create`, `character.profile.update`, and `character.rescue.respond`. The latter two establish policy outcomes for future domains; this task adds no profile or rescue endpoint. Rescue denies until an explicit rule exists. Incapacitated, dead, and observer characters have no ordinary character-action authority. Missing and foreign character IDs share a safe denial.

Add a constrained private account access state, `active | restricted`, defaulting to active. Only the trusted database owner can change it in this task. Restricted accounts may read their own private account records and use future out-of-character support, but cannot create, act, or retrieve a creation receipt. The runtime receives no restriction or life-state mutation authority. Provider-invalid, banned, deleted, unverified, recovery-only, or operator-assigned identities remain subject to existing Auth/operator boundaries and do not become game observers.

The private `/v1/me` response advances to schema version 2 with a coarse `onboarding | active | incapacitated | observer | restricted` mode and creation eligibility. Restricted mode takes precedence and may retain the existing own living-character projection. Observer means no living character and either dead history or a stored cooldown; cooldown expiry does not reactivate a dead character. The response is read-only, creates no account, exposes no dead dossier or moderation reason, and is not authority for subsequent mutations.

Future writers of restriction, ownership, life, or revision must follow the agreed lock order and advance revisions. Future command domains add named operations and keep their own authoritative checks in the committing transaction. The character feature control remains disabled in managed development; no moderation write path, support UI, rescue mechanic, gameplay route, or playable prototype is introduced here.

## Alternatives and consequences

- Route middleware alone cannot prevent a restriction or death from committing after the middleware check and before the action. Transaction-scoped row locks and rechecks close that race.
- One global SQL function for every gameplay action would entangle unrelated domains. A focused server/database policy module shares identity/lifecycle checks while domain services retain their own rules.
- Treating `GET /v1/me` as a reusable permission would make stale client state authoritative. It is only a private presentation snapshot; every mutation reauthorizes.
- Treating restriction as provider ban or character life would collapse distinct policies and remove approved private account access. The separate account state preserves the distinction.

## Verification and rollout state

The implementation and review evidence are recorded in [foundation verification](../testing/foundation-verification.md). Managed PostgreSQL 17.6 accepted the tenth canonical migration through the audited Supabase transport; the exact migration SHA-256 is `7e94ea05bea7b381ca6a24fb64b6c5e4ce446d29b935a72f5faaf92be6c444b4`, with an owner `postgres` receipt. Read-back confirmed the constrained active default, the narrow character revision update privilege, no public `game` schema access, a false character feature flag, and zero game accounts, characters, or creation receipts. The managed readiness/provider/worker/fabricated-token checks passed. The only advisor finding is the pre-existing leaked-password-protection warning.

Local `pnpm verify` passed 230 unit/API tests and its type, lint, boundary, secret, and build checks; formatting passed; disposable PostgreSQL passed 55/55; and browser tests passed 47/47. Independent Sol whole-feature review approved the Task 2.4 code scope with no actionable findings. Final-SHA CI run [36415934669](https://github.com/Dwinyyy/project-gate/actions/runs/36415934669) passed verify, formatting, real PostgreSQL, and browser stages at `2d54b95461d794d6266e9cf82ff6c51187c5f233`. On 2026-09-28 at 11:33:36Z, the deployed `/v1/system/status` and anonymous `/v1/me` and valid-shaped `/v1/characters` responses reported that exact revision; the latter two returned `401 AUTH_REQUIRED`, `Cache-Control: no-store`, and request IDs. These checks do not exercise authenticated live character creation, account restriction, death, support, or gameplay; the flag remains false and there are no live game accounts or characters.

Task 2.4 is complete. Phase 2 remains active and Task 2.5 is next. The hosted preview remains an account-enabled foundation shell, not a playable game.

References: [approved Task 2.4 specification](../superpowers/specs/2026-09-28-operation-specific-character-authority-design.md), [Task 2.4 plan](../superpowers/plans/2026-09-28-task-2-4-character-authority.md), [ADR 0011](0011-durable-game-account-identity.md), [ADR 0012](0012-transactional-character-creation.md), [master blueprint](../plans/master-blueprint.md), and [Brief §04](../product/brief-source.md).
