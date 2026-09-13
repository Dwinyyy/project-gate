# ADR 0003 — Database, queries and migration authority

Status: accepted planning decision from the approved master blueprint; implementation is tracked separately.

## Context

Critical ownership, cooldown, reward and death invariants need transactions, constraints and auditable relational evidence.

## Decision

Supabase-managed PostgreSQL with PostGIS. Drizzle with node-postgres for typed queries; explicit SQL for locks, constraints and spatial operations. Use one versioned SQL migration history under supabase/migrations.

## Consequences and alternatives

No competing Drizzle production migration history. Keep private game/content schemas inaccessible to anonymous/authenticated direct API users; Supabase Auth identity does not grant game-state mutation. Real PostgreSQL concurrency tests are required.

Source: [approved master blueprint](../plans/master-blueprint.md). This record preserves the approved selection, rather than claiming a fresh vendor/API compatibility review. Use current Context7/official documentation when implementing library-specific configuration. Any changed decision needs a superseding ADR and affected verification.
