# ADR 0001 — Browser and mobile application

Status: accepted planning decision from the approved master blueprint; implementation is tracked separately.

## Context

One maintainable responsive interface serves System, map, commerce and tactical encounters. Native GPS, credentials, resume and notification behavior still require physical-device proof.

## Decision

React + TypeScript + Vite player application; separate operator application; CSS tokens/Modules, accessible primitives, React Router and TanStack Query. Capacitor supplies explicit native adapters; Android validates first and iOS requires macOS build/signing access.

## Consequences and alternatives

Native-first separate clients are deferred; a browser shell does not establish mobile readiness. Public clients depend only on contracts/client/UI, never server/database/private content.

Source: [approved master blueprint](../plans/master-blueprint.md). This record preserves the approved selection, rather than claiming a fresh vendor/API compatibility review. Use current Context7/official documentation when implementing library-specific configuration. Any changed decision needs a superseding ADR and affected verification.
