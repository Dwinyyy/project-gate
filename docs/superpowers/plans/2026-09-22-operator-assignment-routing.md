# Owner-assigned operators and main-site routing

Status: implementation requested by the owner on 2026-09-22; part of Task 2.1. This extends the existing authentication flow and does not complete the Phase 2–6 goal.

## Original request

> what i found and would like to be implemented:
> after creating an account normally on the main page i could assign the said account as an operator on supabase (or where ever just make it easy and tell me) and when they do log in again in the main page instead of a player dashboard it goes straight to the operator dashboard. also make sure that the security will be tight for this (like people assigning themselves as operator or accessing the operator dashboard without proper enrollment) as to not make any loopholes when using developer tools or for a typical hacker

## Intended result and boundaries

An account registers and verifies email normally. The project owner assigns or suspends that account by email through a private, audited Supabase SQL Editor function. On the next main-site password sign-in, a server-confirmed operator assignment routes directly to the operator application on the same origin. First use requires authenticator enrollment and verification; later use requires a fresh authenticator challenge when the session is AAL1. A player remains in the player application.

Assignment is eligibility, not authenticated operator authority. Protected operator responses require a provider-validated password session, verified email, current verified TOTP, AAL2 and a current active database assignment. Recovery/OTP sessions remain restricted. Browser role flags, user metadata, URL parameters, forged tokens and visiting the operator route cannot confer authority. Assignment and suspension create audit receipts without adding administrative permissions. Existing administrative mutation routes remain closed.

The operator remains a separate application and build entry. Package its public bundle at `/operator/` in the main-site deployment so both applications use the same-origin provider session without transmitting credentials in URLs or adding a cross-origin token handoff. Retain the standalone operator preview. Public operator HTML is not privileged data; APIs remain the authority. No secret/server/database imports enter either client.

## Contracts and ownership

- Root owns shared contracts and canonical SQL migrations. Add required `applicationRole: 'player' | 'operator'` to `SelfSession`; derive it only from the current server-side assignment. Operator-store failure must fail closed.
- Backend implementer owns API, provider verifier, client response parsing and their focused unit tests. Internal verified identity adds `hasVerifiedTotp`; do not expose factor IDs or secrets in public contracts.
- Frontend implementer owns main-site routing, operator UI assignment/enrollment boundaries, deployment composition/configuration and relevant browser/config tests. It must handle loading, failed validation, suspended/unassigned and recovery states without showing authorized content prematurely.
- Root adds a new migration superseding the old enrollment-before-assignment order. Never edit an applied migration. Preserve owner-only SECURITY INVOKER execution, email/account eligibility, transaction locks, retry receipts, attribution and denied runtime/public/service-role execution. Add an email-based management wrapper and exact assign/suspend instructions.
- Existing recovery repair remains in scope and requires independent review. Preserve its code and tests while integrating this extension.

## Observable acceptance

1. Owner assigns a verified but unenrolled account by email; exactly one attributable receipt is written and no permission rows are added.
2. A normal main-site password sign-in routes an assigned account to `/operator/` without entering the password a second time. It shows enrollment/challenge until MFA is verified, then the authorized console. Unassigned accounts stay players.
3. Missing assignment, suspension, unverified email, missing/removed TOTP, AAL1, recovery/OTP credentials and forged tokens cannot obtain protected operator responses. Rechecking with an already-issued token after suspension denies access.
4. Public/runtime/service-role attempts to change assignments fail. Metadata, storage and route tampering cannot self-promote. Duplicate requests do not duplicate audit rows or undo later suspension.
5. Root release builds and app-root Vercel builds contain the correct independent entries/assets. Direct paths, reloads, main-site sign-in routing and the standalone operator preview work in a browser. Neither deployment exposes private imports.
6. Recovery regression tests and enrolled/unenrolled recovery flows continue to pass. Fresh deployment, owner-run real main-site/operator flow and mailbox recovery remain required for Task 2.1 acceptance.

## Delivery order

Implement contracts and independent backend/frontend/database work; run focused checks; integrate and run required broader checks; obtain independent Sol review and repair substantive findings. Only then update the existing authorized development previews, verify matching frontend/API revisions, and give exact private-credential test steps. Do not promise immunity from all attacks or mark gameplay phases complete.
