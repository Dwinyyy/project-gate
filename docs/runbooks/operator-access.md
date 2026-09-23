# Assigning development operators

This runbook implements the owner's requested flow: normal registration → owner assignment → main-site password sign-in → required authenticator enrollment/challenge → operator console. Assignment alone grants no authenticated operator session or administrative permissions. See [ADR 0010](../adr/0010-operator-assignment-and-routing.md).

**Deployment prerequisite:** these revised steps require canonical migration `20260922025156_operator_assignment_routing.sql` and the reviewed frontend/API changes. Until current verification evidence records deployment, this is a prepared runbook, not a claim that the new flow is live.

## Assign an account by email

The person first uses [Create account](https://project-gate-player.vercel.app/account/register), enters their own email/password and follows the verification email. They do not need to enroll an authenticator before you assign them.

As the project owner:

1. Open [this project's Supabase SQL Editor](https://supabase.com/dashboard/project/zsejplglpfcmcikcydgb/sql). Sign in to your Supabase owner account if requested.
2. Confirm the selected project is **project-gate** (`zsejplglpfcmcikcydgb`).
3. Click **New query**.
4. Paste the query below. Replace the example email with the verified account's email and use your accountable name and a specific reason. If a value contains an apostrophe, write two apostrophes inside the SQL string, for example `O''Brien`.

```sql
select ops.set_operator_status_by_email(
  p_email => 'person@example.com',
  p_status => 'active',
  p_requested_by => 'Project owner',
  p_reason => 'Assigned to development operator testing'
) as receipt;
```

5. Leave the query role as **postgres**, then click **Run**. Ordinary application roles cannot execute this command.
6. Confirm the result contains `new_status: active` and the expected account UUID. Retain its `request_id`; this is the audit receipt. No password, code or setup key belongs in this query.
7. Have the person sign out, then sign in at the **main site**, using the steps below. No second owner activation is required after their authenticator is verified.

The query fails without a change if the email does not identify exactly one account or activation eligibility fails. A verified email is required; banned, deleted and anonymous accounts cannot be activated. Do not use editable Auth user metadata or direct table edits to assign rights.

The SQL Editor workflow is documented by [Supabase database functions](https://supabase.com/docs/guides/database/functions); dashboard queries use the `postgres` role as described in [Supabase Postgres roles](https://supabase.com/docs/guides/database/postgres/roles).

## Sign in through the main site

1. Open [main-site sign-in](https://project-gate-player.vercel.app/account/sign-in).
2. Enter **Email address** and **Password**, then click **Sign in**.
3. An assigned operator is sent to `/operator/` on the same site. A normal player stays in the player application. The main-site login is reused; the operator page does not ask for that password a second time.
4. On first use, click **Set up authenticator**. In your authenticator app choose its add-account/scan-QR action and scan the displayed QR. Keep setup material private.
5. Enter **Six-digit code**, then click **Verify authenticator**. If already enrolled, complete this challenge without adding another authenticator.
6. Expect **AAL2 · Authorized** and **Operator session authorized.**
7. Click **Sign out**, return to main-site sign-in and repeat the password/code challenge. A password-only session must never open authorized operator content.

The standalone [operator preview](https://project-gate-operator.vercel.app) remains available. It has its own browser origin, so a main-site login does not automatically appear there. Use the main-site `/operator/` route for the seamless flow requested here.

## Remove operator access

1. Open the same **project-gate → SQL Editor → New query**.
2. Run the assignment query with the exact target email, `p_status => 'suspended'`, your name and a removal reason.
3. Confirm the receipt says `new_status: suspended`.
4. The next protected API request is denied even with an already-issued operator token. After a new main-site sign-in, the person stays in the player application. Suspension does not delete their account or erase audit history.

If an account's email changed or can no longer identify it, use its verified Auth UUID with the private UUID-based function below. Do not reactivate an account to make suspension possible.

## Auditing, retries and UUID-based preparation

Each default email-function call is a new deliberate owner action with a generated request ID. To retry the same operation, retain its exact email, status, requester and reason and supply `p_request_id => '<the receipt UUID>'::uuid`. A retry returns the historical receipt without changing current access. Reusing the ID with changed terms fails; replaying an old assignment cannot undo later suspension. If a response was lost, inspect the recent receipt before retrying:

```sql
select request_id, auth_user_id, previous_status, new_status,
       requested_by, reason, database_actor, recorded_at
from ops.operator_access_changes
order by recorded_at desc
limit 20;
```

For a prepared UUID-based request, create an ignored `.cache/operator-status-request.json` with only `requestId`, `authUserId`, `status`, `requestedBy` and `reason`. Generate a new request UUID for a new operation and preserve it for retries. Run:

```powershell
pnpm exec tsx scripts/provision-operator.ts .cache/operator-status-request.json
```

This prepares safely escaped SQL without changing access. Execute the reviewed statement through the authorized owner transport against the confirmed development project. Both management functions are SECURITY INVOKER with pinned search paths and owner checks. `hunter_runtime`, `anon`, `authenticated` and `service_role` cannot execute them or write audit receipts. Assignment never adds permission rows; review existing permissions before intentionally reactivating an old operator.

Record nonsecret build revisions, receipt IDs and outcomes. The actual owner-entered main-site journey and enrolled-account email recovery remain required acceptance evidence; automated tests and publicly rendered shells do not replace them.
