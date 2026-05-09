# Spec Workflow Design

Spec Workflow is a Pi extension for long-running, spec-driven coding work. It separates human intent from execution state: markdown artifacts are editable by users and agents, while `runtime.json` is the compiled contract used by execution, verification, and reporting.

The extension is intentionally in-session for v1. Pi still drives the agent loop, but the extension provides durable files, phase contracts, narrow mutation tools, and deterministic validation points so progress survives compaction, restarts, and review.

## Goals and non-goals

Goals:

- Create a durable `.specs/<slug>/` workspace for each spec.
- Keep planning readable in markdown and execution state machine-readable in `runtime.json`.
- Thread requirements, acceptance criteria, task dependencies, owned paths, validations, commits/skipped checkpoints, findings, and reports through the workflow.
- Coexist with the existing `workflow-modes`, `goal`, `todo`, and `subagents` extensions.
- Keep v1 implementation sequential and observable rather than parallel and opaque.

Non-goals for v1:

- No background worker process or queue.
- No write-capable subagent fan-out.
- No worktree-per-task execution.
- No GitHub PR, push, deploy, or CI orchestration.
- No browser viewer.
- No public `api.ts`/`API.md` integration surface until there is a stable external API.
- No custom compaction hook; use phase-boundary compaction only.

## System shape

```text
user /spec-* command
        │
        ▼
  spec-workflow extension
        │
        ├─ phase contract injected before agent start
        ├─ safe artifact tools scoped to .specs/<slug>/
        ├─ compiler: markdown → runtime.json
        ├─ semantic runtime update tool
        └─ compact status/rendering helpers
        │
        ▼
.specs/<slug>/
  brief.md
  requirements.md
  design.md
  tasks.md
  runtime.json
  events.jsonl
  report.md
```

The high-level phase model is:

```text
plan ──approve──▶ execute ──all tasks complete──▶ verify ──terminal verdict──▶ report
  ▲                   │                                │
  │                   │                                ├─ fix rounds remaining ─▶ execute
  │                   │                                └─ fix cap reached ─────▶ report
  └──── manual edits / recompile before approval
```

Execution state is stored in `runtime.json`; audit history is appended to `events.jsonl`.

```text
markdown artifacts                runtime state                 append-only events
──────────────────                ─────────────                 ─────────────────
requirements.md ─┐                                               spec_created
 design.md      ├─ compile_spec_runtime ───▶ runtime.json ───▶  runtime_compiled
 tasks.md       ┘                         ▲                    phase_started
                                           │                    task_completed
                                           └─ spec_runtime_update ─ commit_skipped
                                                                 report_written
```

## Current module map

- `index.ts` registers `/spec-*` commands, registers tools, loads config, and injects the active phase contract.
- `config.ts` loads settings and environment overrides using shared config helpers.
- `artifacts.ts` constrains artifact paths to `.specs/<slug>/`, validates slugs and filenames, adapts exact-text edits, and manages `.git/info/exclude`.
- `parser.ts` parses manual-edit-friendly markdown sections and task annotations.
- `compiler.ts` validates requirements, acceptance criteria, task dependencies, validations, documentation impact, and preserves execution history across recompiles.
- `schema.ts` validates compiled runtime shape.
- `events.ts` appends and reads JSONL events, tolerating corrupt historical lines on read.
- `state.ts` reads/writes `runtime.json`, restores compact session state, and provides atomic runtime+event updates.
- `tools.ts` exposes the agent-facing artifact, compile, status, and semantic runtime mutation tools.
- `render.ts` provides compact tool-call/result rendering helpers.

Planned modules still to be filled out include phase orchestration, approval/challenge gates, execute/verify/report prompt contracts, git helpers, compaction, and the status widget.

## Key design decisions

### New extension, not a rewrite

Spec Workflow is a separate directory extension instead of a rewrite of `workflow-modes`. The current repo already has `/plan`, `/execute`, and `/verify` in `workflow-modes`, and those commands are useful for lightweight work. This extension uses `/spec-*` names so both models can coexist.

Tradeoff: there is some duplicated phase vocabulary. The benefit is low migration risk and a cleaner boundary: `workflow-modes` remains prompt/tool-mode scaffolding; `spec-workflow` owns durable spec artifacts and runtime state.

### Local `.specs/<slug>/`, excluded but not tracked

Specs are stored under repo-root `.specs/<slug>/` so they are easy for the agent to read and edit, but they are local execution artifacts rather than project source. The extension updates `.git/info/exclude` instead of tracked `.gitignore`.

Tradeoff: spec artifacts are not automatically shared with collaborators. That is intentional for v1 because specs may include working notes, raw validation summaries, or local execution details. Users can still copy selected reports into committed docs if needed.

### Markdown for intent, `runtime.json` for control flow

Markdown is the human authoring surface. `runtime.json` is the compiled execution surface. The compiler validates IDs, dependency edges, acceptance-criterion references, validation references, task ownership, and documentation impact before execution relies on the spec.

Tradeoff: there is a compiler step and a possibility of markdown/runtime drift. The benefit is that execution does not depend on prompt memory or ad hoc markdown interpretation. Recompilation preserves execution history for matching task IDs, so edits can continue without discarding progress.

### Narrow semantic runtime mutations

The agent does not get an arbitrary JSON patch tool for runtime state. It gets `spec_runtime_update`, which supports named transitions such as phase changes, task start/completion, skipped commits, findings, report writing, and aborts.

Tradeoff: every new transition needs explicit implementation. The benefit is auditability and recoverability: runtime updates and event appends happen together, and malformed or unsupported state changes are rejected as readable tool output.

### Sequential writes, read-only fan-out

v1 keeps implementation writes in the main Pi session and reserves subagents for read-only exploration, challenge, review, and failure diagnosis. This follows the repo’s agent-engineering guidance that subagents are most reliable as context firewalls for read-heavy work, while parallel write-heavy work creates hidden merge decisions.

Tradeoff: v1 gives up potential parallel speed. The benefit is simpler correctness: one writer owns task decisions, owned-path violations are easier to detect, and runtime state stays linear.

### Continue on amendments, do not stop on every drift

After approval, discovered drift is recorded as amendments and surfaced in verification/reporting. Execution stops only when progress is impossible, platform-blocked, or safety constraints require it.

Tradeoff: this is less strict than workflows that abort whenever the approved plan changes. The benefit is practical momentum: the approved spec remains an auditable baseline while execution can adapt to real repository conditions.

### Conditional task checkpoints

When `autoCommitTasks` is enabled, validated tasks and verify-driven fix batches should commit with explicit file staging and never include `.specs/`. When disabled, the workflow records a validated checkpoint with changed files, validation evidence, and `commitSkipped` metadata.

Tradeoff: supporting no-commit mode makes verification slightly more complex because missing commits are only failures when auto-commit was enabled for that checkpoint. The benefit is that users can opt out of automatic commits without losing checkpoint evidence.

### Phase-boundary cache and compaction strategy

Tool sets and thinking levels should change at phase boundaries, not per task. Large phase transitions should persist files first, optionally compact, then start the next phase with artifact paths rather than pasted plan content.

Tradeoff: phase transitions become heavier. The benefit is better prompt-cache stability and less reliance on conversation memory. This mirrors the broader context-engineering pattern: durable notes on disk plus just-in-time retrieval beat long prompt chains.

### README/DESIGN split

`README.md` is user-facing usage, configuration, and logging behavior. `DESIGN.md` is architecture, rationale, and tradeoffs. There is no `API.md` in v1 because the extension does not yet expose a stable integration surface.

## Runtime contract

`runtime.json` is schema-versioned and currently includes:

- `schemaVersion: 1`
- `slug`
- lowercase `phase`
- overall `status`
- requirements and acceptance criteria
- validations
- tasks with dependency IDs, owned paths, AC links, validation links, status, attempts, commits, skipped-commit metadata, and amendments
- documentation impact
- approval/challenge placeholders
- fix-round count
- known issues and amendments
- `updatedAt`

Unknown newer schema versions are rejected before mutation. This is deliberately conservative: silently accepting unknown runtime versions would make resume behavior unsafe.

## Artifact safety model

Artifact writes are constrained in code:

```text
input slug + filename
        │
        ├─ slug must match kebab-case lowercase letters/numbers
        ├─ filename must be one of the known artifact basenames
        ├─ no absolute path, slash, backslash, or traversal
        ▼
repo/.specs/<slug>/<known-file>
```

Known artifact files are `brief.md`, `requirements.md`, `design.md`, `tasks.md`, `runtime.json`, `events.jsonl`, and `report.md`.

This protects against accidental path traversal and prompt-injection attempts that ask the agent to write outside the spec workspace through spec tools. Normal Pi file tools still exist when enabled, but the spec tools themselves are least-privilege.

## Event log model

`events.jsonl` is append-only operational history. It is intentionally compact: events should store event type, timestamp, short metadata, and pointers to normal command output when needed, not full raw logs by default.

The reader tolerates corrupt lines so one bad append does not make the entire history unreadable. Corruption is still observable through returned `corruptLines`, which later reporting can surface.

## Verification philosophy

Verification should run deterministic checks first, then evidence-based review against runtime artifacts, diffs, and acceptance criteria. Fix loops are bounded by `maxFixRounds`; after the cap, remaining findings become known issues and the report is written.

This follows three principles from the local agent-engineering guidance:

1. deterministic gates before agentic review,
2. acceptance criteria threaded through every phase,
3. bounded termination instead of open-ended verify/fix loops.

## Prior art and influences

- Pi extension examples in this repo: `pi/agent/extensions/workflow-modes/`, `pi/agent/extensions/goal/`, `pi/agent/extensions/todo/`, and `pi/agent/extensions/subagents/`.
- Local agent-engineering skill: `pi/agent/skills/agent-engineering/SKILL.md`, especially the guidance on code-orchestrated workflows, read-mostly subagents, machine-readable boundaries, deterministic gates, compaction-aware design, and termination.
- Local workflow references: `pi/agent/skills/agent-engineering/references/workflow-patterns.md`, `context-engineering.md`, `operations-safety.md`, and `models.md`.
- Brian Suh, “Agents need control flow”: https://bsuh.bearblog.dev/agents-need-control-flow/.
- Kiro feature specs: https://kiro.dev/docs/specs/feature-specs/.
- OpenAI Codex subagents: https://developers.openai.com/codex/concepts/subagents.
- Temporal durable execution/workflows: https://temporal.io/ and https://docs.temporal.io/workflows.
- `cc-sdd`: https://github.com/gotalab/cc-sdd.
- GSD: https://github.com/gsd-build/get-shit-done.
- Superpowers: https://github.com/obra/superpowers.
- Simon Willison, “The lethal trifecta for AI agents”: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/.

## Open implementation seams

- Approval needs content hashing and drift/amendment recording.
- Challenge needs read-only review integration and accepted-risk handling.
- Execute needs changed-file classification, validation evidence capture, explicit staging command generation, and no-commit checkpoint handling.
- Verify/report need AC verdicts, bounded fix routing, known-issue handling, and durable report generation.
- Compaction needs thresholded phase-transition summaries through Pi’s default compaction API.
- Widget needs lowercase phase labels, dim `·` separators, and width-aware truncation.
