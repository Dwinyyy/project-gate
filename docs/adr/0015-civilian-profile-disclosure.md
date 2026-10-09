# ADR 0015 — Voluntary civilian profile disclosure

Status: implemented locally for Task 2.6 database foundation; independent review and rollout pending. Phase 2 remains active.

## Context

The approved Task 2.6 specification requires a photo-free Civilian ID with voluntary field choices, signed-in-only outward reads, and ten-minute `profile.view` invitations. Life, awakening, account restrictions, provider eligibility and operator assignment remain distinct. Stored consent cannot become new mutation authority, and a retried operation cannot reinstate disclosure after a later refusal.

## Decision

The private `game` schema stores privacy defaults, a distinct UUIDv4 routing reference, exact bigint disclosure revisions, digest-only invitations, and account-scoped append-only operation receipts. Canonical migration `20261002000100_profile_disclosure.sql` explicitly resets legacy visibility to private with both optional fields off. The new private feature gate defaults false; the public status contract retains its four existing capabilities. Character creation remains disabled. No managed schema or live character changes are performed by this local implementation.

The database store projects only alias and the Civilian label by default. Optional fictional appearance and UTC registration date are absent unless chosen. Owner state is separate, with decimal revision strings, coarse mode, current settings, current invitation metadata and controls. Awakened living identities report unsupported official ID; historical rows are never rendered as a dossier.

Each mutation first performs a pure receipt lookup in its own read transaction, checking current provider/operator identity and account ownership with an account shared lock. Matching UUID and canonical request digest returns the original minimal receipt separately from current owner state. Changed terms conflict before ordinary action policy. Issue replay returns unavailable token delivery. An absent receipt ends that transaction; none of its authority facts authorize the next transaction.

Fresh mutations acquire the canonical operator advisory lock, optional shared disclosure gate, provider eligibility lock, optional existing pilot-grant lock, and account `FOR UPDATE` on first acquisition. They recheck the receipt before action guards. Ordinary actions lock the owned character `FOR UPDATE` initially and require active/alive/current revision. All settings updates, including private drafts, and Generate/Replace additionally require unawakened Civilian support, gate and designated grant; issuance requires limited/public visibility. Revoke requires ordinary authority but no gate or grant.

Stop sharing is a distinct account-wide reduction. Eligible authentic owners may use it while restricted, incapacitated or possessing only dead history, with no client subject/revision or gate/grant. It locks every actual owned character ordered by ID, then affected invitations ordered by ID; every new withdrawal increments both character/disclosure versions, rotates references, sets private/off, and revokes invitations even if already private. Matching replay changes nothing. Ordinary revoke also rotates the reference and advances both versions even with no invitation, preserving field choices and visibility.

Generate rejects a valid nonrevoked invitation; expired or revoked history permits it. Replace requires a nonrevoked row, including an expired row. Issuance revokes any previous nonrevoked row, increments both versions once, retains the reference, and binds the new digest to disclosure revision. SQL captures fresh server issuance time and derives expiry by exactly ten minutes; expiry predicates compare against `clock_timestamp()` in SQL. A 32-byte CSPRNG secret leaves the store only after successful commit. Receipt insertion is last, stores original issuance timestamps directly from SQL, and contains no token, routing reference or selected fields.

Outward reads may discover candidate issuer IDs without returning a projection. They acquire all distinct reader/issuer Auth advisory locks in canonical order before gate/provider/account locks. Provider IDs and account UUIDs are sorted; the issuer character and invitation use shared locks. After locking, the store rechecks current linkage, operators, provider eligibility, gate, life, awakening, consent, reference/revision, scope, revocation and server expiry. Readers need neither a character nor pilot grant. Existing restricted/incapacitated issuer consent remains readable; dead/operator/provider-ineligible issuers deny. Grant revocation prevents new settings/issuance but does not erase prior consent. Unknown or inaccessible candidates have one generic unavailability result.

## Privileges and consequences

Runtime receives only the new privacy/reference/revision character update columns, invitation/receipt select/insert and invitation revocation update. Lifecycle, presence, ownership, appearance, restriction and receipt rewrite/delete remain denied. Public roles retain no private schema/table/function access. The new append-only trigger is security invoker with pinned trusted search path and revoked public execution. History indexes support character and account foreign keys and owner metadata.

Cooperating future provider/operator/grant/restriction/death/ownership writers must follow these identity and row lock orders. Reductions that win their lock and commit prevent later resolutions; a read snapshot that already won may have been delivered. Locks cannot recall already seen information. Receipt replay creates no token, does not refresh expiry and never restores old settings or handles.

## Verification boundary

The focused cases register synchronously under `profile-disclosure` in the existing disposable foundation suite. They use its owner/runtime pools and candidate cleanup; there is no second database, role/password reset or migration runner. Exact legacy backfill is tested by reconstructing only this migration's additions inside an owner transaction, executing the canonical SQL, and rolling back before subsequent cases; schema/grants restoration is asserted. Owner-only cleanup bypasses append-only triggers with a transaction-local fixture setting, never a production writer.

Deterministic transaction barriers test both winning orders of resolution/reduction and issuance/current authority. Late receipt failures prove full rollback, including previous invitation restoration. Role denials, canonical checksums, exact projections, decimal revisions, replay, historical withdrawal and reciprocal reads are asserted on real disposable PostgreSQL. Command outputs and counts are recorded in the Task 2 execution report. This evidence does not establish managed PostgreSQL 17.6 compatibility, authenticated HTTP/UI behavior, deployment, multiplayer or gameplay; those remain later task acceptance.

References: [approved disclosure specification](../superpowers/specs/2026-10-02-civilian-id-profile-disclosure-design.md), [ADR 0013](0013-character-authority.md), [foundation verification](../testing/foundation-verification.md).
