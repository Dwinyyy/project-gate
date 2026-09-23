# Personal Codex development setup

The reusable setup is installed at `C:/Users/aldwi/.codex/` so it applies to this project and other local projects without duplicating agent definitions.

- `config.toml`: GPT-6 Astra High parent; GPT-6 Sol Medium fallback subagent; High in Plan mode.
- `AGENTS.md`: intent-first workflow, evidence-based routing, review/repair, and explicit Ultra authorization.
- `agents/*.toml`: fifteen native roles covering Luna routine work/tests, GPT-5.6 Sol frontend/design, GPT-6 Sol senior work/review, and Astra architecture.
- `hooks/quality-routing-guard.py`: additional guard for covered native subagent launches.

Project rules remain in the root `AGENTS.md`. There is no project config override: the global defaults apply. This directory does not contain credentials or production application configuration. The personal setup is machine-local; cloning this repository alone does not install it on another computer.

See [configuration and validation evidence](../docs/testing/codex-environment.md) for exact paths, behavior, limits and everyday use.
