# ADR 0014 — Private character onboarding and pilot

Status: accepted for the Task 2.5 v1 architecture; implemented locally, managed rollout and owner pilot not yet verified. Task 2.5 and Phase 2 remain in progress.

## Context

Brief §§03–06 require a first-session unawakened character, civilian participation, one living character per account, a private System identity view, and truthful status. The owner approved photo-free civilian creation with an optional fictional avatar; a real photo is a later identity requirement after awakening through any route. Photo capture, storage, avatar generation, and payment services are outside this pilot. Public lethal play remains disabled.

Task 2.3 provides durable account linking, transactional creation, and operation receipts. Task 2.4 provides operation-specific authority. Task 2.5 must extend those boundaries with an appearance choice and a narrowly gated hosted pilot without exposing pilot membership or granting gameplay/operator authority.

## Decision

Use a versioned, bounded v1 appearance catalog, the existing character-creation transaction, and an owner-audited private pilot allowlist. The catalog consists of locally rendered base portraits and appearance traits. The server validates catalog version and IDs; the canonical migration constrains stored values and explicitly backfills existing characters. Browser UI is presentation only. Appearance is returned only in the authenticated owner’s `/v1/me` projection.

The public private-character contract is schema v3. `/v1/me` is a read-only snapshot and never grants authority or exposes another account, Auth identifiers, hidden awakening evidence, precise location, moderation reason, or dead-character dossier. Creation persists the normalized alias, complete appearance selection, and receipt atomically. A retry is an explicit player action using the same operation UUID and exact draft; editing the draft starts a new operation. Reconnect first retrieves confirmed state. Offline creation is never queued for later replay.

New creation requires both the independent `ops.feature_controls.characters` switch and a current grant to a verified, eligible, non-operator player. The grant is keyed to the Auth identity and has an attributable owner-managed audit record. The runtime may read the decision but cannot alter grants; public roles cannot read or write the private pilot records. Grant status is not exposed to players. Existing Auth verification, operator exclusion, restriction, cooldown, transaction lock order, and one-living-character enforcement remain in force. A grant confers no operator, moderation, or gameplay action authority. Revoking a grant does not erase a committed character or its history.

The System view presents confirmed alias, appearance, life, awakening, presence, and registration date. It reports **MP: Dormant** only for an unawakened character. HP, stamina, injuries, and effects remain “Not yet tracked” until authoritative resource systems exist. The body-status drawer displays unavailable MP for an awakened character until that resource is implemented. This task adds no profile/privacy controls, public ID, dead-character dossier, observer actions, inventory, quests, map authority, or combat.

## Consequences

The fixed catalog is less expressive than an arbitrary creator but keeps server validation, migration compatibility, local rendering, accessibility labels, and retry identity bounded. A catalog change must preserve rendering for already stored versions or provide an explicit migration.

The two independent pilot gates let code and schema be deployed while creation remains off, then enable one owner-designated account without making public signup eligible. The safe unavailable response does not reveal whether the switch or grant is absent. A confirmed creation is durable even if access is later revoked.

The private `/v1/me` projection supports a useful identity view while later tasks own public identity, privacy choices, and dead/observer records. It cannot be reused as authorization for any later mutation.

## Verification and rollout state

The owner-approved bounded avatar refinement is implemented locally. Independent frontend and integrated whole-feature Sol reviews found zero open substantive findings. On 2026-10-01 the settled candidate worktree passed serial `pnpm verify` (247 unit/API tests plus typecheck, lint, import-boundary and secret checks, and server/player/operator builds), `pnpm format:check`, disposable PostgreSQL (68/68), and fresh-server Chromium (71/71, retries 0). The candidate remains based at `c659b131781fac3bfcb303883747f8b6f57bbd7a` with five reviewed feature/test files uncommitted; these results apply to that worktree, not a new commit, tag, or deployment. See the [final serial verification report](../../.cache/task25-final-verification-report.md) and [integrated whole-feature review](../../.superpowers/sdd/2026-09-28-task-2-5-character-onboarding-system/task-6-integrated-whole-feature-review.md).

The latest recorded managed preflight found PostgreSQL 17.6, the first ten canonical migration hashes matching, the character switch off, no pilot table, and zero game accounts, characters, or creation receipts. The eleventh migration is local only. Historical CI and deployment evidence refers to earlier revisions and is not evidence for the reviewed Task 2.5 SHA. No Task 2.5 managed migration, grant, switch change, deployment, or character creation has occurred.

Use the [private character pilot runbook](../runbooks/character-pilot.md) for the remaining exact-commit mapping and tagged CI, refreshed read-only preflight, audited canonical migration and atomic checksum receipt, read-back, branch deployment, exact revision and anonymous-boundary checks, audited single-player grant and gated switch, owner journey, and distinct managed-domain occupied-slot probe. The latest recorded managed preflight has the switch off and zero game rows; no Task 2.5 migration, grant, switch change, deployment, or hosted creation has occurred. Record owner-reported browser steps separately from agent-observed HTTP, revision, database, and domain-service evidence. Do not mark Task 2.5 or Phase 2 complete until every managed and owner acceptance step has passed.

## References

- [Original brief §§03–06](../product/brief-source.md)
- [Task 2.5 design](../superpowers/specs/2026-09-28-character-onboarding-system-design.md) and [implementation plan](../superpowers/plans/2026-09-28-task-2-5-character-onboarding-system.md)
- [ADR 0012 — Transactional character creation](0012-transactional-character-creation.md)
- [ADR 0013 — Operation-specific character authority](0013-character-authority.md)
- [Foundation verification](../testing/foundation-verification.md)
