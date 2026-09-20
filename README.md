# Subagent Extension

Subagent extension for [Pi agent harness](https://pi.dev) based on [official subagent example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent). Adds persistent interactive planning, structured build-validation workflows, per-agent model and thinking configuration, and fallback to parent session settings.

Extension uses modular, testable architecture: schemas, process execution, workflow orchestration, and TUI rendering are separated behind explicit dependency boundaries. This enables deterministic testing of single, parallel, and phased workflow subagents without launching real Pi processes or calling models.

## Workflow

```text
/plan <task>   Start scout plus persistent interactive planner
/build <task>  Run blocking phased implementation and validation workflow
```

## Extension Architecture

```text
extensions/subagent/
├── index.ts    Tool registration and production dependency wiring
├── schema.ts   Tool schemas and shared contracts
├── agents.ts   User and project agent discovery
├── runner.ts   Pi process lifecycle, event parsing, fallback, and prompts
├── execute.ts  Single, parallel, and phased workflow orchestration
└── render.ts   TUI call and result rendering
```

Side effects use explicit boundaries:

- `ProcessRunner` abstracts child-process lifecycle and output streams.
- Prompt-file storage owns secure temporary prompt creation and cleanup.
- Output writer owns result persistence and directory creation.
- Execution accepts injected discovery, runner, confirmation, and storage dependencies.

Production uses real Pi, filesystem, and UI adapters. Tests use deterministic fakes, covering orchestration, process parsing, fallback, abort handling, rendering, and registration without real model calls.

## Agents

| Agent     | Role                                 |
| --------- | ------------------------------------ |
| scout     | Codebase reconnaissance → `scout.md` |
| planner   | Planning agent → `spec.md`           |
| builder   | Implement spec → `changes.md`        |
| linter    | Lint, formatting, and type checks    |
| tester    | Test suite                           |
| validator | Validate implementation against spec |
| auditor   | Security audit                       |

Standard `/plan` starts scout, then a persistent planner child. Planner returns a numbered `STATUS: QUESTIONS` batch. Parent shows it unchanged and passes user replies back into same planner session until explicit confirmation produces `STATUS: SPEC_READY` and `spec.md`.

## Artifacts

```text
.ai/features/{slug}/
├── scout.md
├── spec.md
└── changes.md
```

Downstream lint, test, validation, and audit results return through workflow output rather than extra artifact files.

Planner sessions use Pi's standard project-scoped session storage under global Pi config. Extension supplies stable session ID but does not override Pi's session directory.

## Phased Build Workflow

`/build` uses `subagent` workflow mode. First builder-only phase must settle before validation starts. Selected linter, tester, validator, and auditor tasks share second phase and run concurrently, bounded at four active agents.

When Pi is running inside [Herdr](https://herdr.dev), every plan/build subagent opens in a separate, named pane and reports that role (for example, `tester` or `validator`) as its displayed agent name in Herdr's Agents panel. The pane closes automatically when that subagent succeeds, fails, or is aborted. This activates only when `HERDR_ENV`, `HERDR_SOCKET_PATH`, and `HERDR_PANE_ID` are all present and non-empty. Outside Herdr, subagents continue to run as ordinary child processes. When using `agent-sandbox pi --herdr`, install a sandbox version containing the `PI_SUBAGENT_SHELL` launcher support included in this repository.

Herdr pane workers are started through a temporary launcher script rather than by pasting the full Pi invocation into the terminal. This keeps long planner prompts and follow-up turns below terminal input limits while preserving exact argument quoting.

| Workflow | Validation phase |
| -------- | ---------------- |
| Quick | none |
| Standard | linter + tester |
| With validation | linter + tester + validator |
| Full pipeline | linter + tester + validator + auditor |
| Security focus | auditor |

```ts
subagent({ workflow: { phases: [
  { name: "Build", tasks: [{ agent: "builder", task: "Implement spec" }] },
  { name: "Checks", tasks: [{ agent: "linter", task: "Lint changes" }, { agent: "tester", task: "Run tests" }] },
] } })
```

First failed task cancels unfinished sibling checks and queued checks never start. After all started siblings settle, workflow reruns previous builder phase with bounded failure feedback, then reruns whole failed validation phase. Every phase has initial attempt plus three retries by default; exhausted retries stop later phases. External abort cancels active work and starts no repair. Workflow history retains completed, failed, canceled, and pending task states for rendering; retries retain chronological phase-attempt history.

## Development

```bash
cd extensions/subagent
npm test
npm run typecheck
```

Tests use Node's built-in test runner and do not invoke real Pi processes or models.

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
