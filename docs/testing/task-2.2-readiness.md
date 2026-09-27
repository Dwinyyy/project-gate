# Task 2.2 readiness audit — 2026-09-27

This is a read-only preparation record, not a schema design, migration, implementation, or claim that Task 2.2 has started. The [roadmap](../plans/project-roadmap-and-goal.md) keeps Task 2.2 behind the owner removal of the retired operator Vercel project. As checked on 2026-09-27, that project still exists and its URL returns HTTP 200 with a neutral handoff. The revised main-site password/TOTP round trip has passed.

## Sources and current state

- [Master blueprint Phase 2](../plans/master-blueprint.md#phase-2--accounts-characters-system-and-id), original brief §§04 and 20 in [brief-source](../product/brief-source.md), [R04/R20](../product/requirements.md) and [I01/I07/I09](../product/invariants.md) require separate account and character identities, independent lifecycle dimensions, one living slot including incapacitation, a server-clock cooldown and private archives.
- The seven canonical migrations under `supabase/migrations` currently define operational and operator tables only. The application has no game account or character persistence. The restricted `hunter_runtime` role cannot apply migrations; `scripts/migrate.ts` checks checksums and applies new SQL files transactionally in filename order.
- `ops.feature_controls.characters` remains false in the tested seed. A database migration must not silently enable character creation or present the current foundation shell as playable.
- The local integration fixture in `tests/integration/foundation.test.ts` creates `auth.users` **after** applying current migrations. A Task 2.2 migration that references the managed Auth primary key needs the fixture setup reordered before migration; otherwise local/CI tests would fail for fixture order rather than product behavior. Supabase advises referencing only `auth.users.id` when using a foreign key to its managed schema.

## Observable criteria for the later implementation

1. An account record and a character record are distinct. Character identity persists after death, and deleting or changing authentication credentials cannot silently erase character history or settled obligations.
2. Life, awakening, presence, account-entry eligibility, public visibility and standing remain separate fields or relations. A new character is unawakened; life `alive` and `incapacitated` both occupy the one living slot. Death does not grant observer authority to post, transact or earn.
3. PostgreSQL enforces at most one living character per account even under simultaneous inserts from separate connections. A partial unique index is a suitable mechanism in PostgreSQL 17; application prechecks alone are insufficient. The Task 2.3 transaction will also check cooldown and current authority before committing creation.
4. The schema stays outside public client authority. Public Supabase roles must not gain direct writes to private life, cooldown or standing state; the server runtime receives only the least privileges it needs. No client-supplied clock, awakening or death result becomes authoritative.
5. Focused real PostgreSQL tests must prove the migration, role grants, living-slot race, dead-row historical retention and separate lifecycle values. Task 2.2 should not be marked complete from TypeScript compilation or mocked API responses.

## Decisions to settle in the Task 2.2 design

The design must choose the private schema/table boundaries, the Auth-user relationship and deletion/retention policy, and the exact representation of lifecycle and account-entry state before SQL is written. Supabase's example profile table uses `ON DELETE CASCADE`, but that behavior would conflict with Hunter World's persistent character and estate history if copied without a separate retention design. The implementation must preserve the existing canonical migration runner and adapt its disposable Auth fixture, rather than introducing a second schema tool.

Documentation checked for this preparation: [PostgreSQL 17 partial indexes](https://www.postgresql.org/docs/17/indexes-partial.html), [unique index behavior](https://www.postgresql.org/docs/17/index-unique-checks.html) and [Supabase managed-user references](https://supabase.com/docs/guides/auth/managing-user-data). The 2026-09-25 [Supabase PostgreSQL minor-release notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) concerns extensions/operators not used by this proposed identity schema; recheck the managed version before migration deployment.
