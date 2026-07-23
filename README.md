# Subagent Extension

Enhanced version of [Pi agent harness](https://pi.dev)'s [official subagent example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent), adding persistent interactive planning, structured build-validation workflows, per-agent model and thinking configuration, and fallback to parent session's current model and thinking level.

## Architecture

```text
/plan <task>   Start scout plus persistent interactive planner
/build <task>  Blocking subagent chain → implementation and checks
```

## Agents

| Agent | Role |
|---|---|
| scout | Codebase reconnaissance → `scout.md` |
| planner | Planning agent |
| builder | Implement spec → `changes.md` |
| linter | Lint, formatting, and type checks |
| tester | Test suite |
| validator | Validate implementation against spec |
| auditor | Security audit |

Standard `/plan` starts scout, then a persistent planner child. Planner returns a numbered `STATUS: QUESTIONS` batch. Parent shows it unchanged and passes user replies back into same planner session until explicit confirmation produces `STATUS: SPEC_READY` and `spec.md`.

## Artifacts

```text
.ai/features/{slug}/
├── scout.md
├── spec.md
└── changes.md
```

Downstream lint, test, validation, and audit results return through chain output rather than extra artifact files.

Planner sessions use Pi's standard project-scoped session storage under global Pi config. Extension supplies stable session ID but does not override Pi's session directory.

## Chain Composition

Parent chooses smallest suitable chain:

| Chain | Use |
|---|---|
| builder | Quick implementation |
| builder → linter | Quick static verification |
| builder → tester | Functional verification |
| builder → linter → tester | Standard |
| builder → linter → tester → validator | Standard plus spec check |
| builder → linter → tester → validator → auditor | Full pipeline |
| builder → auditor | Security-focused |

Build uses existing blocking `subagent` chain mode. Re-run `/build` to retry. No workflow status or resume commands.

## Install

Project-local:

```bash
mkdir -p .pi/extensions/subagent .pi/agents .pi/prompts
cp -r extensions/subagent/. .pi/extensions/subagent/
cp README.md .pi/extensions/subagent/README.md
cp agents/*.md .pi/agents/
cp prompts/*.md .pi/prompts/
```

Global:

```bash
mkdir -p ~/.pi/agent/extensions/subagent ~/.pi/agent/agents ~/.pi/agent/prompts
cp -r extensions/subagent/. ~/.pi/agent/extensions/subagent/
cp README.md ~/.pi/agent/extensions/subagent/README.md
cp agents/*.md ~/.pi/agent/agents/
cp prompts/*.md ~/.pi/agent/prompts/
```

Reload Pi after installation.
