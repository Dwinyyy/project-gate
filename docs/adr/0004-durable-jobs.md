# ADR 0004 — Durable work and transaction outcomes

Status: accepted planning decision from the approved master blueprint; implementation is tracked separately.

## Context

Delivery, crafting, expiration and encounter timers must survive process restarts without duplicate business outcomes.

## Decision

pg-boss in the authoritative PostgreSQL environment, transactional domain/outbox linkage, stable business identities and idempotent handlers. Persist deadlines and add overdue recovery sweep.

## Consequences and alternatives

Redis queues are deferred. Queue delivery does not imply exactly-once business execution: constraints/receipts must enforce it. Workers recheck eligibility and service-freeze state. Verify API/worker pool pressure together.

Source: [approved master blueprint](../plans/master-blueprint.md). This record preserves the approved selection, rather than claiming a fresh vendor/API compatibility review. Use current Context7/official documentation when implementing library-specific configuration. Any changed decision needs a superseding ADR and affected verification.
