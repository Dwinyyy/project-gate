# ADR 0002 — Authoritative modular backend

Status: accepted planning decision from the approved master blueprint; implementation is tracked separately.

## Context

One server authority avoids duplicated game rules and premature distributed ownership while persistent processes support bounded rounds and reconnect.

## Decision

Fastify + TypeScript on Node.js 24 LTS, versioned REST/JSON and OpenAPI with validated JSON Schema contracts; authenticated WebSocket committed-state notifications. API and worker are separate processes sharing domain services.

## Consequences and alternatives

Microservices and independently scaled simulation wait for measurements. Clients may predict presentation only; they cannot settle economic or lethal state. Pin compatible dependencies and lockfile during setup.

Source: [approved master blueprint](../plans/master-blueprint.md). This record preserves the approved selection, rather than claiming a fresh vendor/API compatibility review. Use current Context7/official documentation when implementing library-specific configuration. Any changed decision needs a superseding ADR and affected verification.
