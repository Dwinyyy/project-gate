# Codex quality-first environment — 2026-09-23

The current configuration supersedes the September 21 routing setup. It preserves Hunter World work while improving intent preservation, model selection, behavioral verification and independent repair.

## Installed configuration

- `C:/Users/aldwi/.codex/config.toml`: GPT-6 Astra High parent, High Plan reasoning, GPT-6 Sol Medium fallback subagent.
- `C:/Users/aldwi/.codex/AGENTS.md`: selective Context7, concise routing, original-intent handoffs, behavioral checks, independent review, repair and escalation after two materially different failed fixes.
- `C:/Users/aldwi/.codex/agents/*.toml`: fifteen supported native profiles, listed below.
- `C:/Users/aldwi/.codex/hooks/quality-routing-guard.py` and its tests: four-model allowlist and automatic reasoning ceiling High.
- Project `AGENTS.md`, `.codex/README.md`, and the project roadmap: aligned references; game rules preserved.

Private backup and original request: `C:/Users/aldwi/.codex/backups/quality-routing-20260923-185431/`. The config backup may contain existing credentials; keep it private. A parsed semantic comparison confirms only parent model, parent reasoning and fallback subagent model changed in config.toml. Plugins, MCP credentials/connections, trust, hooks configuration, appearance, notification, service-tier and other settings remain unchanged. No dependency upgrade, application deployment, commit or push was performed for this setup.

## Routing

| Profile | Model | Reasoning |
| --- | --- | --- |
| explorer | gpt-6-luna | medium |
| implementer / implementer-high | gpt-6-luna | medium / high |
| tester / tester-high | gpt-6-luna | medium / high |
| frontend-specialist / frontend-specialist-high | gpt-5.6-sol | medium / high |
| frontend-reviewer | gpt-5.6-sol | high |
| senior-implementer / senior-implementer-high | gpt-6-sol | medium / high |
| debugger / reviewer | gpt-6-sol | high |
| architect / architect-medium / architect-high | gpt-6-astra | low / medium / high |

Luna handles bounded evidence, settled edits and focused checks. GPT-5.6 Sol remains a frontend/design specialist. GPT-6 Sol handles substantial implementation, integration and review. The Astra High parent retains interpretation and final quality control; delegated Astra reasoning starts lower when sufficient and escalates with evidence. Important unresolved judgment is never handed downward just to save compute.

Named profiles pin their model/effort. Existing tool surfaces may retain an older role list: read the intended current profile and use its instructions with explicit model/effort and fresh bounded context in that case. Read-only roles also forbid editing in their instructions because parent runtime permissions can override sandbox defaults.

## Ultra protection and limits

Automatic routing is limited to low/medium/high. Ultra, xhigh and max require stopping and explaining the unresolved problem, attempts, established facts, insufficiency, proposed investigation and recommendation before explicit problem-specific user authorization. General instructions to finish do not authorize them. No bypass through another model, nested CLI or configuration changes is allowed.

The enabled, trusted PreToolUse hook matches `^(Agent|.*spawn_agent)$`, validates the four exact models, pinned roles, explicit effort and safe fresh-context delegation. It denies the removed model, above-High reasoning, conflicting fields, malformed/ambiguous roles and unsafe inherited generic forks. Its regression tests do not invoke expensive models. The guard has no automatic authorization bypass.

This is not a universal account-level restriction: parent selection is outside the spawn hook; existing task overrides and tool paths that bypass hooks can exist. No supported global entitlement lock was found. Policy and the tested guard cover normal configured routing, but cannot make every possible Ultra invocation technically impossible. Editing defaults also cannot retroactively switch the current parent. Fresh tasks use saved defaults unless explicitly overridden; restarting this task is unnecessary to use the new worker routing.

## Fresh verification

- Installed CLI 0.155.1; Desktop diagnostic reports 26.915.4065.0. No update installed.
- Refreshed native `codex debug models` confirms all four exact IDs and the selected reasoning values. Vendor catalog entries outside this routing pool remain untouched.
- Python tomllib parses config and all fifteen profiles; required profile fields, unique names, supported models/efforts and representation of all four models pass.
- Thirteen guard regression test methods pass. Additional checks pass for all fifteen named profiles and rejection of ultra/xhigh/max across each of the four models. Both Python hook files compile.
- Native app-server, with saved defaults and no model/effort override, resolves `gpt-6-astra` / `high`, loads global and project instructions, reports no configuration warnings, and reports the guard enabled/trusted with no hook warnings/errors. No trust hash was edited or bypass flag used.
- `codex --strict-config doctor --json` confirms configuration load. Overall status remains fail due to `TERM=dumb` in the noninteractive tool shell; optional warnings concern existing MCP environment configuration and unverified endpoint-protection exclusions. These were not suppressed by changing unrelated settings.
- Native prompt inspection includes both updated global policy and preserved Hunter World instructions.
- Context7 resolve-library-id and query-docs succeeded using `/openai/codex/rust-v0.155.1`; official source and installed schema/manual confirm standalone agent syntax. Existing connection URL/credentials are unchanged. Future lookup remains conditional on material external API uncertainty and installed version.
- An ephemeral native CLI probe reported all fifteen names and FRONTEND_PROFILE_LOADED, but its event stream contains only prose and a wait with no child identifier. Independent review correctly rejected that as sufficient proof of native child execution. Native named-role execution remains unverified pending stronger evidence; parsed profiles and no-warning configuration loading are verified. No hook-trust bypass was used.
- Independent GPT-6 Sol High review found a named-role fork omission gap. It was repaired: spawn_agent paths now require explicit bounded fork_turns or native fork_context=false. Fresh regression checks pass and focused re-review confirmed denial of the formerly allowed case, with no remaining substantive finding.

Local diagnostic evidence is in ignored `.cache/routing-validation.json`, `routing-models.json`, `routing-doctor.json`, and `routing-prompt.json`. Recheck the guard using `python -m unittest discover -s C:/Users/aldwi/.codex/hooks -p test_quality_routing_guard.py -v`; native initialization with `C:/Users/aldwi/.codex/tmp/quality-routing-rpc-audit.ps1 -UseSavedDefaults`.

## Project continuity

Completed game phases: 0 and 1. Current task: Phase 2.1. The real standalone operator enrollment/sign-out/sign-in round trip passed. Owner assignment by email and main-site operator routing are local; cross-tab recovery/MFA isolation, retry UI, review, deployment and managed acceptance remain. The exact concurrency decision and preserved checkpoint are in `.cache/recovery-concurrency-decision.md`. The user explicitly requested automatic resumption after configuration validation. No game phase was advanced by this setup; the hosted account foundation is not yet playable.

Supported behavior was checked against the installed CLI/protocol, [official subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents), and matching Context7 Codex source. Machine-local configuration does not travel with a repository clone.


