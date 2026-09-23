# Hunter World engineering instructions

## Session continuity and user previews

At every session start and stopping point, report the current phase/task, the strongest completed and verified features, and the next concrete tasks. Read docs/tasks/ledger.md and docs/testing/foundation-verification.md before reporting. Preserve an honest distinction between implemented, tested, and unavailable behavior so usage-limit interruptions do not lose progress.

Also report immediately when each entire phase passes its acceptance criteria. List all completed phases at session boundaries. Do not call a phase complete while a required task or verification remains outstanding, and follow the approved dependency order.

When a playable prototype exists, provide a working browser preview the user can try, with instructions and known limitations. Until then, a foundation preview is useful but must never be called a playable game or presented with fabricated gameplay. Keep any later development simulator isolated from production authority and clearly labeled.

Read `docs/plans/master-blueprint.md`, `docs/tasks/ledger.md` (or the task register present under docs/tasks), and the relevant original-brief section before each task. The approved blueprint is a roadmap, not a claim of implemented behavior. Update verification evidence and outstanding work honestly.

- Preserve civilian participation, one living character, hidden awakening, physical proximity, permanent death, privacy, collective ownership and cosmetic-only monetization.
- Alive and incapacitated both occupy the living-character slot. Life, awakening, presence, public visibility and standing are distinct.
- Clients import only contracts, client and UI packages. Never import server, database or private content into public bundles.
- All authoritative actions validate current actor, life, permissions, ownership, quantity, location and version inside the committing transaction.
- Inventory title, custody, reservations and usability are distinct. Currency is integer and journaled.
- Use one canonical SQL migration history under supabase/migrations. No competing Drizzle migration runner or production schema push.
- Retries must preserve operation identity. Store receipts, event evidence, rule versions and idempotent consumer results.
- Worker and API use the same domain services. Push, realtime and narrative cannot decide outcomes.
- Never use client time, client rewards, client damage or client proximity claims as authority.
- Never queue offline game mutations for silent replay. Reconnect retrieves confirmed state.
- Committed danger persists through disconnect; ordinary offline characters are sheltered.
- Valid deaths remain permanent. Existing funded obligations settle to frozen estates, not new lives. No dead authority or automatic public dossier.
- Use strict types, small domain modules, focused invariant/concurrency tests, relevant builds and fresh verification before success claims.
- Do not manually edit production balances or ownership. Use permissioned, attributable reconciliation.
- Keep precise location and hidden content out of fixtures, logs, public docs and source maps.
- Apply the External Documentation Policy in `~/.codex/AGENTS.md`: use Context7 when external API behavior affects implementation and current/version-specific docs would materially improve correctness. Check installed versions first when possible, prefer matching docs, and reuse retrieved documentation. Skip internal logic, simple edits, repository exploration and clearly established project patterns. When needed, resolve-library-id then query-docs; use primary docs if no matching library exists. API documentation does not override project architecture or conventions.
- Inspect existing code before editing, preserve completed work, and update ADRs when behavior changes.
- Shared contracts and SQL migrations have one integration owner; coordinate before parallel changes.
- Never infer deployed, authenticated, multiplayer, mobile or production-ready status from a rendered shell or passing unit tests.

Execution began on codex/foundation. The workspace was empty, with no commit to base a worktree on. Work happens in the existing project directory; no unrelated checkout is modified.

## Quality-first execution

Apply the personal model-routing policy in `~/.codex/AGENTS.md` and reusable roles in `~/.codex/agents/`. The parent defaults to GPT-6 Astra High; GPT-6 Sol handles substantial development, GPT-5.6 Sol handles focused frontend/design work, and GPT-6 Luna handles bounded routine work and verification. Escalate delegated Astra reasoning with evidence; never invoke Ultra without explicit problem-specific authorization. A task's size alone does not justify escalation.

Keep the original request, intended player/operator experience, acceptance criteria and applicable brief/blueprint constraints attached to every meaningful handoff. Before completion, verify the requested behavior, obtain independent Sol review for meaningful changes, repair substantive findings, and rerun relevant checks. Do not advance the ledger on compilation alone. Preserve one integration owner for shared contracts and SQL migrations.
