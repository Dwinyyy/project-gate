# ADR 0001 — Browser and mobile application

Status: accepted planning decision from the approved master blueprint; implementation is tracked separately.

## Context

One maintainable responsive interface serves System, map, commerce and tactical encounters. Native GPS, credentials, resume and notification behavior still require physical-device proof.

## Decision

React + TypeScript + Vite player application; separate operator application; CSS tokens/Modules, accessible primitives, React Router and TanStack Query. Capacitor supplies explicit native adapters; Android validates first and iOS requires macOS build/signing access.

Presentation clarification, 2026-09-21: the player interface is mobile-first and portrait-oriented. Phones use the available viewport; desktop browser previews show the same app layout in a centered portrait canvas. Keep a compact header, persistent bottom navigation, touch targets of at least 44 CSS pixels, safe-area padding, and an internally scrolling screen with reachable account fields when the viewport shrinks. Preview labeling belongs outside the app canvas on desktop. The separate operator application remains a desktop console.

## Consequences and alternatives

Native-first separate clients are deferred; a browser shell does not establish mobile readiness. Public clients depend only on contracts/client/UI, never server/database/private content.

This presentation direction does not reorder the roadmap or establish playable gameplay. Capacitor packaging, native adapters and real-device acceptance remain planned through the early native spike after Phase 5 and completion in Phase 16. Browser layout checks provide evidence for the shell only; actual keyboard, safe-area, GPS, permission and lifecycle behavior still require device verification.

Source: [approved master blueprint](../plans/master-blueprint.md). This record preserves the approved selection, rather than claiming a fresh vendor/API compatibility review. Use current Context7/official documentation when implementing library-specific configuration. Any changed decision needs a superseding ADR and affected verification.
