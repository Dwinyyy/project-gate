# ADR 0006 — Authentication, authorization and storage

Status: accepted planning decision from the approved master blueprint; implementation is tracked separately.

## Context

Managed identity does not encode life, cooldown, ownership, guild role or operator rights. Private projections and evidence need independent authorization.

## Decision

Supabase Auth for account access and Supabase Storage for object storage, with separated public assets/private evidence. Application domain services own current character permissions and settlement authorization.

Password-recovery credentials are restricted sessions, not ordinary authenticated sessions. The browser derives recovery mode from the signed-token payload only to lock its own interface; the API independently validates the same bearer with Supabase, validates its `amr` claim, and rejects recovery mode before player or operator authorization. Recovery permits password replacement or sign-out only. A completed replacement revokes sessions and requires an explicit sign-in with the new password.

## Consequences and alternatives

Operator MFA and least privilege are required; player offices never gain operator access. Recovery mode cannot enter the operator MFA flow, and an operator grant is activated only after its owner has enrolled and verified TOTP. Native refresh credentials use reviewed Keychain/Keystore-backed storage. Provider credentials and private content cannot enter player bundles.

Source: [approved master blueprint](../plans/master-blueprint.md). This record preserves the approved selection, rather than claiming a fresh vendor/API compatibility review. Use current Context7/official documentation when implementing library-specific configuration. Any changed decision needs a superseding ADR and affected verification.
