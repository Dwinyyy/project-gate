# Codex → GitLab Duo Temporary Handoff

## Original Codex Goal

Complete Hunter World's playable prototype through Phase 6, following
docs/plans/project-roadmap-and-goal.md.
Finish the 37 unfinished Phase 2–6 tasks in dependency order, beginning
with Task 2.1. Preserve completed work, project architecture and product
invariants. Use Android for the first physical-device verification.
Implement, verify real behavior, obtain independent Sol review, repair
substantive findings and update the ledger and verification evidence.
Follow manual gates H0–H5: prepare everything possible first, then give
the exact current click-by-click instructions and await required human
action. Do not fabricate verification, initiate new spending, publish
a production release or invoke Ultra automatically.
Finish with the working persisted civilian and solo Gate journeys,
passing relevant checks, Android evidence, a usable browser preview
and honest remaining limitations. Keep public lethal play disabled.
Do not expand this goal into Phases 7–21.

## Later Corrections / Decisions

[what i found and would like to be implemented:
after creating an account normally on the main page i could assign the said account as an operator on supabase (or where ever just make it easy and tell me) and when they do log in again in the main page instead of a player dashboard it goes straight to the operator dashboard. also make sure that the security will be tight for this (like people assigning themselves as operator or accessing the operator dashboard without proper enrollment) as to not make any loopholes when using developer tools or for a typical hacker]

## Context

This development task was being executed by OpenAI Codex using /goal.

Codex stopped only because its usage limit was reached. The project was not necessarily complete.

GitLab Duo is temporarily taking over development.

## Instructions

Before modifying anything:

1. Read AGENTS.md and any nested AGENTS.md files.
2. Read this entire handoff document.
3. Inspect the current repository.
4. Inspect recent Git history and commits.
5. Inspect the current uncommitted and committed implementation.
6. Inspect relevant tests, specifications, plans, documentation, TODO files, and architecture.
7. Determine what Codex already completed.
8. Determine what was partially completed when Codex stopped.
9. Determine what work remains for the original goal.

Treat the existing repository and verified implementation as authoritative.

Do not restart the project.

Do not redo work that has already been correctly implemented.

Do not replace working architecture without a concrete reason.

Do not remove or weaken tests simply to make them pass.

Preserve all existing project requirements and constraints.

## Execution

Continue from the exact point where Codex stopped.

Work autonomously toward completing the original goal.

For each meaningful stage:

- inspect the relevant existing implementation;
- implement the required changes;
- run relevant tests;
- run linting and type checks where applicable;
- run the build where applicable;
- inspect failures;
- diagnose their actual cause;
- fix them;
- verify the result;
- continue to the next unfinished requirement.

Do not stop merely because the first implementation appears plausible.

Continue until the original goal and its completion conditions are actually satisfied.

## Completion

Before declaring the goal complete:

1. Compare the final implementation against the original goal.
2. Verify every requirement.
3. Run the relevant test suite.
4. Run the build.
5. Run lint/type checking where applicable.
6. Inspect for regressions.
7. Check for incomplete TODOs or partially implemented work related to the goal.
8. Confirm that no existing behavior was accidentally broken.

If something genuinely blocks completion, clearly identify:

- the blocker;
- the evidence;
- what was attempted;
- what remains;
- the smallest thing required to unblock development.