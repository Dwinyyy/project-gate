# ADR 0010 — Owner assignment and main-site operator routing

Status: owner-requested decision, 2026-09-22, with approved mobile/private-entry update on 2026-09-24; implementation and acceptance remain tracked under Task 2.1.

## Context

The owner requested normal account registration followed by easy owner assignment and automatic operator routing on the next main-site sign-in. The previous enrollment-before-grant procedure required a separate operator visit and a second administrative handoff.

## Decision

Separate operator assignment from permission to use an authenticated operator session. An owner may assign an eligible, email-verified identity before TOTP enrollment. Only the database owner can execute the private, audited management functions. Email-based assignment resolves exactly one identity, holds it stable, and delegates to the existing transaction/receipt mechanism. Suspension remains attributable. No assignment creates administrative permission rows.

This supersedes ADR 0006's requirement to enroll TOTP before assignment. It does not relax runtime operator authorization: protected responses require the current active assignment, a provider-validated password session, verified email, a current verified TOTP factor and AAL2 attained with TOTP. Recovery and other non-password sessions remain restricted. The server rechecks current assignment for each request, so suspension is effective for subsequent requests using an existing token. Provider account-management and bearer-expiry limitations described in ADR 0006 still apply.

The self-session response includes a server-derived application role solely for navigation. The main site routes assigned users to an unlisted same-site entry, `/_system/console/`; the operator application checks assignment before showing enrollment/challenge. Rendering or editing a shell in developer tools grants no API authority.

Keep player and operator source applications and build entries separate. Package the public operator bundle beneath the main site's unlisted path. The owner-approved 2026-09-24 update supersedes retaining the standalone operator preview: retire its login surface and the old `/operator/` entry, returning visitors to normal main-site sign-in without forwarding query strings or fragments. Unauthenticated and unassigned visitors to the new entry see no operator shell while their session is checked; entry failures expose a neutral retry/sign-out state. Recovery sessions return to the existing recovery flow. Same-origin persistence lets the separate entry reuse the established session without putting credentials in navigation URLs or introducing an additional token-exchange protocol.

Both player and operator presentation must work on phones, with safe-area padding, reachable forms in short viewports, readable authenticator setup, and touch targets. Desktop uses a centered portrait frame. Account checking, verification errors and navigation transitions retain the same compact dark-green theme. Registration additionally requires matching Password and Confirm password fields before issuing signup; confirmation remains client-side typo prevention, not a new authorization mechanism.

## Consequences

The main-site player and operator entries share a browser origin and its storage trust boundary. Their public JavaScript must never contain server credentials or private operational data; XSS prevention and protected API checks matter independently of navigation. The unlisted path reduces casual discovery but is discoverable in public assets; it is not a secret credential or server-side HTML access barrier. Actual operator data and actions remain server-gated. Retiring current aliases does not erase historical immutable deployment URLs. No claim of immunity from all attacks is made.

Owner instructions use Supabase SQL Editor and the private email-based function, with requester/reason attribution and returned receipt IDs. Runtime, `anon`, `authenticated` and `service_role` cannot invoke either management function or write the audit table. UUID-based management remains available for account email changes or administrative suspension of an identity that is no longer discoverable by email. Reuse a receipt's request ID for a retry; use a fresh ID for a deliberate new action.

Canonical migration history remains under `supabase/migrations`; the deployed earlier migration is preserved. Acceptance requires PostgreSQL privilege/idempotency tests, API authorization/tampering tests, built asset/routing verification, controlled browser flows, independent Sol review, and fresh owner-run hosted main-site/operator and recovery journeys.

References: [owner request and acceptance plan](../superpowers/plans/2026-09-22-operator-assignment-routing.md), [ADR 0006](0006-identity-storage.md), [operator runbook](../runbooks/operator-access.md).
