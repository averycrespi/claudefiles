# Autopilot run log

Ship a per-run observability artefact so a human (or a future coding agent) can, after the fact, answer: _what did autopilot actually do, where did it get stuck, and was each subagent spending its time productively?_

## Problem

Today the only durable artefact from an autopilot run is the final text report. That's enough to see the shape of the run (tasks, verify outcomes, known issues) but not enough to debug:

- **Why did a subagent fail?** Its stdout is already captured by `spawnSubagent` under `/tmp/pi-subagent-logs/<id>-<ts>.log`, but only on failure — successful runs delete the file.
- **Is the subagent thrashing?** Tool-use count, thinking rounds, and token spend are in `SubagentRunState` but evaporate when the widget tears down.
- **Why did the orchestrator pick _this_ task as failed, or drop _that_ finding?** The orchestrator's decisions (confidence filter, dedupe, fix-loop triage, reviewer skipping) are invisible after the run.
- **Timing / efficiency.** How long each phase took, and how many tokens it cost, is not surfaced anywhere.

## Goal

One per-run artefact rich enough for a future agent to replay and critique the pipeline — both fine-grained subagent events _and_ coarse-grained orchestrator decisions — without cluttering the interactive UI.

Non-goals:

- Live streaming to a UI (the widget already covers live progress).
- Shipping to an external service.
- Replacing the final text report (that stays; the log is additional).

## Shape

One directory per run, keyed by ISO timestamp + design slug:

```
~/.pi/autopilot-runs/2026-04-15T14-23-05Z-rate-limiter/
  run.json           # config + outcome summary (written at pipeline end)
  events.jsonl       # append-only event stream — the canonical spine
  design.md          # copy of the input design doc
  plan.json          # raw plan subagent output (architecture_notes + tasks)
  subagents/
    001-plan.stdout             # raw Pi `--mode json` stdout, one file per subagent
    002-implement-task-1.stdout
    003-implement-task-2.stdout
    004-validation.stdout
    005-reviewer-integration.stdout
    006-reviewer-plan-completeness.stdout
    007-reviewer-security.stdout
    008-fixer-review-round-1.stdout
    ...
  final-report.txt   # mirror of the text printed to the user
```

### Why a directory, not a single file

- Each subagent already emits a fat JSON event stream (the `spawn.ts` log format). Inlining them into one file would bury the orchestrator signal under hundreds of KB of raw Pi JSON and make grep painful.
- Per-subagent stdout files are already how `spawn.ts` works — reuse that shape and just relocate them into the run directory instead of deleting on success.

### Why a single canonical JSONL

`events.jsonl` is append-only, crash-safe (every flushed line is valid), and self-describing. One file = one easy entry point for a future agent: "read this, ask questions about the run". The per-subagent stdouts are referenced by path from events in the JSONL — they're on-demand detail, not the spine.

## `events.jsonl` schema

One JSON object per line. Every event carries `{ts, type}`. Timestamps are ISO-8601 UTC.

Event types, grouped by emitter:

**Pipeline / orchestrator**

- `run.start` — `{design_path, base_sha, cwd, branch}`
- `run.end` — `{outcome: "success" | "implement_failed" | "plan_failed" | "cancelled" | "crashed", elapsed_ms, error?}`
- `stage.enter` — `{stage: "plan" | "implement" | "verify"}` — mirrors every `widget.setStage(...)` call
- `preflight.fail` — `{reason}` — for runs that abort before the plan phase

**Subagent lifecycle** (emitted by the `dispatch` wrapper)

- `subagent.start` — `{id, intent, role: "plan" | "implement" | "validation" | "reviewer" | "fixer-validation" | "fixer-review", tools, extensions, model?, thinking?, stdout_path}`
- `subagent.event` — `{id, raw}` — the full forwarded Pi event (tool call, tool result, thinking, usage). **Fat lines**; this is what makes the log useful for "is it stuck?".
- `subagent.end` — `{id, ok, aborted, duration_ms, exit_code?, tool_use_count, total_tokens, stdout_path, error?}`

**Task lifecycle** (emitted by the implement-phase orchestration)

- `task.start` — `{task_id, title, pre_sha}`
- `task.complete` — `{task_id, commit_sha, summary}`
- `task.fail` — `{task_id, reason}`

**Decision events** (the bits currently invisible after the run)

- `decision.reviewer_filter` — `{total, dropped_low_confidence, deduped, blockers, importants, suggestions}`
- `decision.fixer_round` — `{round, findings_targeted, findings_resolved_after, new_regressions}`
- `decision.reviewer_skipped` — `{reviewer, reason}`

**Final artefacts**

- `report.emit` — `{path}` — points at `final-report.txt`

Filtering `subagent.event` is tempting to keep file sizes down — but each of those events is already small and they're exactly what answers "is the subagent looping / stuck / hitting errors". Keep them all; let retention take care of disk pressure.

## Surfacing to the user

Minimal. One line appended to the final report:

```
Log:     ~/.pi/autopilot-runs/2026-04-15T14-23-05Z-rate-limiter/
```

No inline display, no widget row. The widget stays lean; the log is a disk artefact the user opens on demand.

## Retention

`~/.pi/autopilot-runs/` grows unbounded otherwise. Default policy: keep the last 20 run directories; older ones deleted at pipeline start. Configurable via env (e.g. `AUTOPILOT_RUN_LOG_KEEP=20`). Simpler than TTL and bounds disk usage deterministically.

Alternative considered: delete _successful_ runs automatically, keep failed/cancelled ones forever. Rejected — successful runs are often the most useful reference ("why was this task so slow?"). Keep by recency, not outcome.

## Implementation sketch

Three small commits, each independently testable.

### 1. `RunLogger` infra + event plumbing

- New `pi/agent/extensions/autopilot/lib/run-log.ts`: exposes `createRunLogger({dir})` returning `{logEvent(type, payload), close()}`.
  - Writes append-only to `events.jsonl` via a `fs.createWriteStream` (flush on every line for crash-safety).
  - Assigns subagent ids and returns an `onSubagent(intent, role)` helper that returns a per-subagent emitter bound to the assigned id.
- `index.ts` creates the run directory (`mkdir -p`) and the logger before `preflight`; passes it into `makeWrappedDispatch` and the phase runners.
- `makeWrappedDispatch` emits `subagent.start` / `subagent.event` / `subagent.end` around each `rawDispatch` call. The existing `handle.onEvent` fan-out stays; the logger is just another consumer.
- `index.ts` emits `run.start`, `stage.enter` (each `widget.setStage` is mirrored), `run.end`, `report.emit`.
- Phase runners emit `task.*` and `decision.*` at the points where they already make those choices internally — most of these are a single `log(...)` call next to an existing if-branch.

No behaviour change; just writes. Smoke-test: run with a trivial design, inspect the JSONL.

### 2. Artefact capture

- Teach `spawnSubagent` to accept an optional `stdout_path` destination instead of the auto-temp path, and to _not_ delete on success when the caller provided one. Simplest change: add an option `preserveLog: boolean` or `logFile: string | undefined`.
- `RunLogger` allocates `subagents/NNN-<role>.stdout` per subagent and passes it through `dispatch` → `spawnSubagent`.
- At pipeline start, copy the design doc to `design.md`.
- On plan success, write `plan.json`.
- On pipeline end, write `run.json` (mirror of final report, structured) and `final-report.txt` (the text sent via `sendMessage`).

### 3. Retention + user-facing line

- On pipeline start, after computing the new run directory path, list siblings under `~/.pi/autopilot-runs/`, sort by mtime, delete everything past the keep count.
- Append `Log:     <path>` to the final report (new section or inline in the existing footer area — whichever reads better).

## Open questions

- **Path.** `~/.pi/autopilot-runs/` is clean and lives with the rest of Pi state. `$TMPDIR/autopilot-runs/` is more disposable but less grep-from-anywhere friendly. Going with `~/.pi/autopilot-runs/` unless user prefers tmp.
- **Slug source.** Using the design file's basename minus extension (`2026-04-12-rate-limiter.md` → `rate-limiter`). Falls back to `run` if the design is nameless.
- **Crash behaviour.** If autopilot crashes mid-pipeline, the run directory is left behind with a partial `events.jsonl` and no `run.json`. That's fine — the absence of `run.end` in the JSONL is itself diagnostic.
- **Redaction.** Subagent stdouts can contain file contents and shell output. They're local only and under the user's home — same trust boundary as the source they're editing. No redaction for v1.
