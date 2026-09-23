# ADR 0006 — Authentication, authorization and storage

Status: accepted planning decision from the approved master blueprint; implementation is tracked separately.

The enrollment-before-assignment order below is superseded by [ADR 0010](0010-operator-assignment-and-routing.md), following the owner's 2026-09-22 request. Owner assignment may precede enrollment; actual operator access still requires current verified TOTP and a TOTP-authenticated AAL2 session. Other authentication/recovery boundaries remain in force.

## Context

Managed identity does not encode life, cooldown, ownership, guild role or operator rights. Private projections and evidence need independent authorization.

## Decision

Supabase Auth for account access and Supabase Storage for object storage, with separated public assets/private evidence. Application domain services own current character permissions and settlement authorization.

Password-recovery credentials are restricted sessions, not ordinary authenticated sessions. The browser decodes the token payload only to control its own interface; this is not signature validation or authorization. The API independently validates the exact bearer with Supabase before reading its `amr` claim. Recovery always takes precedence, even alongside password or MFA methods. Ordinary application access requires password authentication; OTP, signup, magic-link and other non-password sessions are restricted before player or operator authorization. This allowlist matters because an alternate provider recovery-link exchange can issue an OTP AMR rather than a recovery AMR.

The player recovery interface offers password replacement or sign-out. A successful replacement requests global sign-out, clears local credentials, replaces the recovery history entry with sign-in, and displays “Your password has been updated. Sign in with your new password.” on sign-in. The navigation notice is informational only and grants no authority. If replacement succeeds but global sign-out fails, report the partial outcome explicitly without claiming revocation succeeded. Email verification also requires a separate password sign-in before application access.

These are Hunter World application boundaries, not restrictions on every direct Supabase account-management endpoint. Supabase still governs those endpoints and email-account compromise still permits password recovery. Global sign-out revokes refresh sessions; previously issued access-token lifetime/revocation follows provider policy. Do not promise instant invalidation of every bearer or that browser controls can stop direct provider requests.

## Consequences and alternatives

Operator MFA and least privilege are required; player offices never gain operator access. Recovery mode cannot enter the operator MFA flow, and an operator grant is activated only after its owner has enrolled and verified TOTP. Native refresh credentials use reviewed Keychain/Keystore-backed storage. Provider credentials and private content cannot enter player bundles.

Recovery now checks enrolled authenticators, offers a recovery-specific TOTP challenge when required and checks assurance again before password replacement. This path must preserve recovery-only authority through MFA, refresh and reload; it cannot enroll a new factor or enter ordinary operator authentication during recovery. A failed security lookup must allow retry without offering password replacement prematurely. Controlled verification does not close Task 2.1: the deployed enrolled-account recovery journey and actual operator enrollment/grant/sign-out journey remain required.

Operator status changes use an owner-only, SECURITY INVOKER management function with an atomic request receipt, accountable requester/reason and database-login attribution. Activation requires an eligible email-verified identity with verified TOTP; it never adds permission rows. Replaying an old activation returns its historical receipt without undoing later suspension. Runtime, public and service-role callers cannot execute this management function. The owner enters credentials and codes in the applications, not in operational scripts.

Provider references: [verification exchanges](https://github.com/supabase/auth/blob/master/internal/api/verify.go), [account-update policy](https://github.com/supabase/auth/blob/master/internal/api/user.go), and [sign-out semantics](https://supabase.com/docs/guides/auth/signout).

Source: [approved master blueprint](../plans/master-blueprint.md). This record preserves the approved selection, rather than claiming a fresh vendor/API compatibility review. Use current Context7/official documentation when implementing library-specific configuration. Any changed decision needs a superseding ADR and affected verification.
