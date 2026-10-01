# ADR 0014 — Private character onboarding and pilot

Status: accepted and implemented. Task 2.5 acceptance is complete following owner-reported Android journey, managed persistence read-back, occupied-slot domain probe and guarded closeout. Phase 2 remains active; Task 2.6 is next.

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

The owner-approved photo-free civilian appearance refinement uses optional avatar swatches and richer locally rendered SVG tiles. Independent frontend and integrated whole-feature Sol reviews found zero open substantive findings. Final `pnpm verify` passed (247 unit/API tests plus typecheck, lint, import-boundary and secret checks, and server/player/operator builds); `pnpm format:check` passed; disposable PostgreSQL passed 68/68. The first full canonical E2E attempt timed out at 70/71; an isolated retry passed 1/1, and the unchanged trace-enabled full suite then passed 71/71 with zero retries. The first timeout's cause is unknown. Exact evidence is recorded in `.cache/task25-copy-repair-verification-report.md` and `.cache/task25-retry-timeout-diagnosis.md`. These checks cover the final candidate at `f11a955708f37eb2f5a3bcf7ec9a448597305887`.

The canonical Task 2.5 migration was applied once to managed development on PostgreSQL 17.6 by `postgres`. All eleven canonical hashes match; migration SHA-256 is `06c34bcf235f90b4c8c072049afb5bbe2c9b63bab833d3af1d6e2386f664ce3f`. Read-back at `2026-10-01T17:43:12Z` confirmed appearance constraints, owner function, audit and runtime grants, and no public `game` USAGE. Tag CI run [36899711300](https://github.com/Dwinyyy/project-gate/actions/runs/36899711300) and branch CI run [36901837765](https://github.com/Dwinyyy/project-gate/actions/runs/36901837765) passed at the same final SHA. Vercel deployment `dpl_8MJxfHwy5BMkzR574wyjtzKiD4fc` is READY on that SHA; the main-site proxy reported API revision `f11a955708f37eb2f5a3bcf7ec9a448597305887` at `17:54:04Z`. Anonymous hosted boundary checks passed before and after pilot enable; public capabilities stayed false and private anonymous reads/creates returned 401 with request IDs and `no-store`.

The owner replied **“Civilian pilot passed”** after following the Android Chrome instructions, reporting character creation, appearance/body-drawer usability, refresh, sign-out/sign-in, and ordinary-account creation unavailable. Managed persistence read-back at `2026-10-01T18:19:47Z` confirmed one linked private v1 identity/appearance, alive/unawakened/sheltered state, and one matching creation receipt. This is owner-reported phone use, not agent-observed physical interaction. The exact-revision, checksum-pinned `hunter_runtime` domain-service probe returned `occupied` at `18:16:34Z`; account/character/living/receipt counts stayed one, with no fresh operation receipt. It proves the service's occupied-slot denial, not authenticated HTTP 409 or a second owner POST. After the pilot, guarded read-back at `18:20:34Z` confirmed characters, encounters and commerce off; the single designated grant/audit and durable account, character and receipt remain. Evidence: `.cache/task25-owner-pilot-completion-evidence.json`, `.cache/task25-managed-pilot-occupied-20261002.jsonl`, and `.cache/task25-pilot-closed-readback.json`. The first canonical E2E attempt timed out at 70/71; isolated retry passed 1/1 and the unchanged trace-enabled full suite passed 71/71 with zero retries. The initial timeout cause remains unknown; details are in `.cache/task25-retry-timeout-diagnosis.md`.

Use the [private character pilot runbook](../runbooks/character-pilot.md) for full rollout and closure evidence. Task 2.5 is complete. Phase 2 remains active, with privacy-controlled profile and fullscreen ID work (Task 2.6) next, followed by dead-record/observer work (Task 2.7). Task 2.6's audience has been set to signed-in players with no search; its field-level design remains for that task. The hosted site remains a private character prototype, not playable gameplay.

## References

- [Original brief §§03–06](../product/brief-source.md)
- [Task 2.5 design](../superpowers/specs/2026-09-28-character-onboarding-system-design.md) and [implementation plan](../superpowers/plans/2026-09-28-task-2-5-character-onboarding-system.md)
- [ADR 0012 — Transactional character creation](0012-transactional-character-creation.md)
- [ADR 0013 — Operation-specific character authority](0013-character-authority.md)
- [Foundation verification](../testing/foundation-verification.md)
