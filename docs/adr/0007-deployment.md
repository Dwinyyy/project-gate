# ADR 0007 — Hosting and operational separation

Status: accepted planning decision from the approved master blueprint; the pre-production frontend-preview portion is superseded by [ADR 0009](0009-vercel-development-frontends.md), while the production and persistent-service decisions remain unchanged.

## Context

Persistent services support committed encounters and obligations. Matching nearby provider regions reduce latency but do not create shared private networking.

## Decision

Render player/operator production deployments and persistent API/worker; Supabase database/Auth/Storage. Separate local, staging and production databases and secrets; GitHub Actions checks; plan Singapore pending latency verification. ADR 0009 permits Vercel-hosted player/operator development previews without moving authoritative services or approving a production release.

## Consequences and alternatives

Use appropriate TLS database connections and bounded direct/session pools; do not assume transaction pooling supports session-dependent work. Avoid sleeping free services for authoritative timing. Production provisioning, credentials, domains, backups and releases remain separate tasks.

Source: [approved master blueprint](../plans/master-blueprint.md). This record preserves the approved selection, rather than claiming a fresh vendor/API compatibility review. Use current Context7/official documentation when implementing library-specific configuration. Any changed decision needs a superseding ADR and affected verification.
