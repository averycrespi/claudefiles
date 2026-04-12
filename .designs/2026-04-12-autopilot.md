# Autopilot: Autonomous Pi Workflow Design

> **Status:** Design complete, ready for plan.

## Overview

An autonomous Pi workflow extension that takes a design document and produces a PR-ready branch without user intervention between phases. Intended to fit the "personality" of OpenAI GPT-5-class models (instruction literalists with perfectionist tendencies), in contrast to the existing Claude Code workflow which is tuned for Claude Opus's forward-momentum disposition.

### Problem

Adapting the Claude Code structured workflow (brainstorm → plan → execute → verify → complete) directly to Pi with GPT-5-class models exposes three issues:

1. **Dropped TODOs in bundled requests.** GPT-5 "drops items when you give it multiple TODOs in one message" (Nathan Lambert, _Interconnects_). A plan-then-execute model that hands the model a long list to work through will silently skip tasks.
2. **Perfectionist drift under accumulated context.** GPT-5 tends to re-read and re-edit files that were already working, produce convoluted defensive fallbacks, and struggle to declare "done." Multi-stage review gates with open-ended "until approved" loops amplify this.
3. **User-blocking questions break autonomy.** The Claude verifying-work skill asks the user about ambiguous findings. For an autonomous pipeline, this is a dead stop.

### Core Insight

GPT-5's strength is _precise execution of a single crisply-scoped instruction_. It performs best as a "master agent coordinator unleashing an AI army on distributed tasks" (Lambert). The right architecture is a thin orchestrator dispatching fresh, narrowly-scoped worker invocations — fresh context per task to reset the perfectionist ratchet, narrow scope to exploit the instruction-literalist strength.

### Design Principles

1. **Main session is a thin orchestrator.** All real work happens in subagents. The orchestrator is imperative TypeScript, not an LLM.
2. **One subagent per unit of work.** Fresh context per task. No shared LLM state across tasks.
3. **Hard caps on every loop.** No open-ended "until approved" cycles. Pipeline always terminates in bounded time.
4. **Autonomous triage over user questions.** Pipeline never blocks on user input mid-run. Every decision has a default.
5. **Always terminate with a report.** Clean branch or branch-with-known-issues — never a stuck state.

### Scope

- Picks up _after_ brainstorming. An adapted Pi `brainstorming` skill produces the design doc; Autopilot consumes it.
- Stops _before_ pushing. Produces a branch with commits; user decides whether to push or open a PR.

---

## Architecture

### Components

```
pi/agent/extensions/
├── task-list/              ← new: reusable task tracking primitive
│   └── index.ts
└── autopilot/                ← new: orchestrates the workflow
    ├── index.ts            ← /autopilot command handler + pipeline
    ├── phases/
    │   ├── plan.ts
    │   ├── implement.ts
    │   └── verify.ts
    └── prompts/
        ├── plan.md
        ├── implement.md
        ├── reviewer-plan-completeness.md
        ├── reviewer-integration.md
        ├── reviewer-security.md
        └── fixer.md

pi/agent/skills/
└── brainstorming.md        ← adapted from claude/skills/brainstorming
```

### Pipeline Flow

```
User runs /brainstorm  →  design doc at .designs/YYYY-MM-DD-<topic>.md
User runs /autopilot .designs/YYYY-MM-DD-<topic>.md
│
├─ Orchestrator validates design file and clean working tree
├─ Orchestrator captures base SHA
│
├─ PLAN
│   └─ Dispatch plan subagent → { architecture_notes, tasks[] }
│      └─ taskList.create(tasks)
│
├─ IMPLEMENT
│   └─ For each task (sequential):
│       ├─ taskList.start(id)
│       ├─ Dispatch fresh implement subagent with arch_notes + this task only
│       ├─ Parse report (OUTCOME, COMMIT, SUMMARY)
│       ├─ Verify commit exists
│       └─ taskList.complete(id, summary)  or  taskList.fail(id, reason) + break
│
├─ VERIFY
│   ├─ Run automated checks (tests, lint, typecheck)
│   │   └─ On fail: fixer subagent, cap 2 rounds
│   ├─ Dispatch 3 parallel reviewer subagents (plan-completeness, integration, security)
│   ├─ Synthesize findings (confidence ≥ 80, dedupe, severity triage)
│   ├─ Auto-fix blocker + important findings
│   │   └─ Fixer subagent, cap 2 rounds
│   └─ Remaining suggestions and unfixable findings → known issues
│
└─ Print final report, pipeline ends
```

### Architectural Choices

- **Orchestrator is pure TypeScript code.** The `/autopilot` command handler is an `async` function sequencing subagent dispatches and state updates programmatically. No LLM in the main session during pipeline execution.
- **Task list is a reusable primitive.** Exposes LLM-facing read-only tool plus a programmatic API that Autopilot imports directly.
- **Subagents dispatched via the existing `subagents` extension.** Builds on existing infrastructure; no new subagent machinery.
- **Session-scoped, in-memory state.** The task list doesn't persist across sessions. If the user aborts mid-pipeline, they re-run `/autopilot` from scratch.
- **Sequential, not parallel, at the implement step.** One task at a time keeps each task's base SHA predictable and avoids merge conflicts between concurrent implement subagents.

---

## The `task-list` Extension

### Purpose

A reusable primitive that manages a session-scoped list of tasks, exposes a read-only tool for LLM visibility, provides a programmatic API for other extensions, and renders progress richly in the TUI.

### State

```typescript
type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

interface Task {
  id: number; // 1-based, assigned on create
  title: string; // short, imperative
  description: string; // 1-2 sentences
  status: TaskStatus;
  startedAt?: number; // epoch ms
  completedAt?: number;
  summary?: string; // filled on completion
  failureReason?: string; // filled on failure
  activity?: string; // dim second-line text while in_progress
}

interface TaskListState {
  tasks: Task[];
  createdAt: number;
}
```

Module-level singleton, scoped to one Pi session. No disk persistence in v1.

### Programmatic API

```typescript
export const taskList = {
  create(tasks: Omit<Task, "id" | "status">[]): Task[];
  add(title: string, description: string): Task;
  start(id: number): void;
  complete(id: number, summary: string): void;
  fail(id: number, reason: string): void;
  setActivity(id: number, text: string): void;
  get(id: number): Task | undefined;
  all(): Task[];
  clear(): void;
  subscribe(fn: (state: TaskListState) => void): () => void;
};
```

The programmatic API enforces the same state-transition rules as the LLM tools (see below). `start`, `complete`, `fail` each validate the current status before mutating and throw on invalid transitions. `clear()` is API-only (not exposed as an LLM tool) and is used by autopilot for cleanup.

Autopilot imports this directly. `subscribe` lets the TUI re-render on state changes.

### LLM-Facing Tools

Task-list is designed as a general-purpose primitive for any Pi session, mirroring the Claude Code pattern where the agent manages its own working memory via task tools.

| Tool                                                              | Description                                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `task_list_create(tasks)`                                         | Initialize the list with an array of tasks. Implicit clear of fully-terminal lists (see below). |
| `task_add(title, description)`                                    | Append a new pending task to the list.                                                          |
| `task_update(id, {status?, summary?, failureReason?, activity?})` | Update one task's fields. Enforces state-transition rules.                                      |
| `task_list_view`                                                  | Read-only. Returns the current list.                                                            |

No `task_list_clear` tool is exposed. Clearing state is destructive, has no undo, and would let the LLM bypass the "completion is sticky" rule by clearing and recreating. The programmatic API still has `taskList.clear()` for orchestrator use (autopilot calls it for cleanup).

**`task_list_create` semantics:**

- If the list is empty → creates the new list.
- If every existing task is terminal (`completed` or `failed`) → clears the list and creates the new one. This handles the "I'm done with the last multi-step thing, starting a new one" case without needing an explicit clear.
- If any existing task is `pending` or `in_progress` → errors. The agent must terminate active work (complete or fail) before starting a new list.

**`task_add` semantics:**

- Appends one new `pending` task. Order in the list matches creation order.
- No `prepend` option in v1 — YAGNI. Execution order is driven by LLM choice, not list position.

**`task_update` semantics:**

Fields:

| Field           | Rule                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `status`        | Must be a valid transition from current status (see table below). Invalid transitions return an error.            |
| `summary`       | Required on transition to `completed`. Ignored on other transitions.                                              |
| `failureReason` | Required on transition to `failed`. Ignored on other transitions.                                                 |
| `activity`      | May be set at any time while the task is `in_progress`. Cleared automatically on transition out of `in_progress`. |
| `title`         | Not updatable. Identity is fixed at creation.                                                                     |
| `description`   | Not updatable. Same rationale.                                                                                    |

Valid state transitions:

| From          | To            | Notes                                       |
| ------------- | ------------- | ------------------------------------------- |
| `pending`     | `in_progress` | Start work                                  |
| `pending`     | `failed`      | Task determined impossible without starting |
| `in_progress` | `completed`   | Finish work (requires `summary`)            |
| `in_progress` | `failed`      | Give up (requires `failureReason`)          |
| `failed`      | `pending`     | Retry                                       |
| `failed`      | `in_progress` | Retry directly                              |
| `completed`   | _(anything)_  | **Not allowed.** Completion is sticky.      |

The sticky-completion rule is the key anti-perfectionism nudge. If the LLM realizes a completed task had a bug, it has to `task_add` a new task ("Fix regression from task N") rather than reopening. Preserves forward motion and history.

**Exposure rules:**

- **Main Pi session (normal use):** all four tools available. Agent manages its own task list.
- **Autopilot subagents:** no task-list tools at all. Each subagent works on a single task that is inlined into its prompt — there's nothing to view or update.

The `subagents` extension lets the dispatcher configure which tools are exposed to each dispatched subagent, so autopilot simply omits the whole task-list extension when dispatching.

**Programmatic API** (orchestrator uses this, not the LLM tools):

The API defined earlier (`taskList.create/start/complete/fail/setActivity/…`) operates on the same state as the LLM tools. Orchestrators and the LLM cannot conflict because:

- The autopilot orchestrator holds the Pi session while it runs — the main-session LLM is not active during `/autopilot`.
- Autopilot subagents don't have any task-list tools.
- Outside of autopilot, only the main-session LLM mutates state.

### TUI Rendering

Adopts the visual design of Claude Code's `TaskListV2` component.

Per-line rendering:

```
  ✔ Add rate limiter config          ← completed: green, dim, strikethrough
  ◼ Wire config into middleware      ← in_progress: bold, accent color
    └ modifying src/middleware.ts    ← dim second line: activity text
  ◻ Add tests for rate limiter       ← pending: plain
  ✗ Update README                    ← failed: dim red
```

Standalone mode adds a header: `5 tasks (2 done, 1 in progress, 2 open)`.

Key behaviors:

- Three statuses visible via glyph + color + text decoration (plus a fourth failed state).
- Dim activity second line under in-progress tasks, populated by the orchestrator.
- Auto-hide when empty. Never renders "no tasks" placeholder.
- 30-second grace window for recently-completed tasks to linger before demotion.
- Row-budget truncation: capped at `min(10, max(3, rows - 14))`. Priority order: recently-completed (<30s) → in_progress → pending → older-completed. Overflow line: `… +N in progress, M pending, K completed`.
- Two render modes: compact (inline with activity) and standalone-with-header.

Rendering strategy in Pi:

- Task-list extension sends inline transcript messages via `pi.sendMessage({ customType: "task-list", ... })` on state change.
- Registers a custom renderer for that `customType` producing multi-line output using `pi-tui` primitives.
- Debounced: coalesce multiple state changes within ~100ms into one re-render.
- Footer widget (`ctx.ui.setStatus`) still used with a minimal summary (`tasks 3/7`) — complementary, not replacing.

> **Implementation unknown:** Verify `pi.sendMessage` + custom renderers support this shape. If not, fall back to a synthetic-tool rendering mechanism. Resolve in first implementation task by reading `pi-mono` source.

---

## Plan Phase

### Trigger

`/autopilot <design-file-path>` reads the design file, validates clean working tree, and dispatches the plan subagent.

### Plan Subagent

Fresh context. Gets the prompt below with `{DESIGN_PATH}` substituted.

```
You are the planning phase of an automated coding pipeline.

Read the design document at {DESIGN_PATH} and produce an implementation plan
as strict JSON matching this schema:

{
  "architecture_notes": "<=200 words. Key architectural decisions, file
                         locations, patterns to follow. This block will be
                         included verbatim in every implementation subagent's
                         prompt — write it for a fresh reader with no context.",
  "tasks": [
    {
      "title": "<short imperative, e.g. 'Add rate limiter config'>",
      "description": "<1-2 sentences: what changes, which files, what success
                       looks like. The subagent implementing this task will
                       only see this description plus architecture_notes — be
                       concrete but not over-specified.>"
    }
  ]
}

Constraints:
- At least 1 task, at most 15. Most features fit in 3-10.
- Tasks must be outline-level, NOT TDD steps. "Add rate limiter" is a task;
  "Write failing test for rate limiter" is not. If you're writing many tasks,
  double-check each one is still outline-level.
- Order tasks so each is independently implementable given arch_notes + its
  own description. If a task needs output from a prior task, fold them together.
- Do NOT include code. Do NOT include test cases. Do NOT decompose into
  sub-bullets. Over-specification fights the implementation model.
- Output ONLY the JSON object, no prose before or after, no markdown fence.

Return the JSON and end your turn.
```

### Output Validation

1. Parse subagent output as JSON. On parse failure → abort pipeline.
2. Validate against TypeBox schema: `architecture_notes` is string, `tasks` is array of 1-15 items with `title` and `description`.
3. If valid → `taskList.create(tasks)`.

### Retry Policy

No retry in v1. If plan fails, pipeline aborts with a clear message. User can re-run `/autopilot`. May revisit later with explicit format-correction retries.

### Failure Modes

| Mode                                   | Handling              |
| -------------------------------------- | --------------------- |
| JSON parse error                       | Abort, report         |
| Schema validation error                | Abort, report         |
| Fewer than 1 or more than 15 tasks     | Abort, report         |
| Subagent returns prose instead of JSON | Caught by parse error |

---

## Implement Phase

### Orchestrator Loop

```typescript
for (const task of taskList.all()) {
  if (task.status !== "pending") continue;

  taskList.start(task.id);
  const result = await dispatchImplementSubagent(task, archNotes);

  if (result.ok) {
    taskList.complete(task.id, result.summary);
  } else {
    taskList.fail(task.id, result.reason);
    break; // stop the pipeline on first failure
  }
}
```

Sequential. One fresh subagent per task.

### Implement Subagent Prompt

```
You are the implementation phase of an automated coding pipeline. Your job
is to complete ONE task from a larger plan and commit the result.

=== Architecture notes (shared across all tasks in this plan) ===
{ARCHITECTURE_NOTES}

=== Your task ===
Title: {TASK_TITLE}
Description: {TASK_DESCRIPTION}

=== Protocol ===
1. Read any files you need to understand the current state.
2. Make the changes required by this task.
3. If tests are applicable for this task, write and run them.
4. Commit your work. Use a conventional commit message: `<type>(<scope>):
   <description>`, imperative mood, under 50 chars.
5. Report back in this exact format:

OUTCOME: success | failure
COMMIT: <sha or "none">
SUMMARY: <one sentence describing what you did or why you failed>

=== Constraints ===
- Do ONLY what this task describes. Do not fix unrelated issues you notice.
  Do not refactor adjacent code. Do not add features beyond the task.
- If the task is impossible or blocked (e.g. missing dependency, unclear
  requirement), STOP, report OUTCOME: failure, and end your turn. Do not
  guess.
- Do not re-read or re-edit files you've already handled in this task.
  Produce a working commit and end your turn.
- Do not create documentation files unless this task explicitly asks for it.
```

### Key Prompt Choices for GPT-5

- **"Do only what this task describes"** — counters perfectionist urge to fix adjacent code.
- **"Do not re-read or re-edit files you've already handled"** — lifted from OpenAI's Codex prompting guide; specifically addresses the known over-refinement loop.
- **Structured report format** — orchestrator parses `OUTCOME:`, `COMMIT:`, `SUMMARY:` lines; avoids fragile free-form parsing.
- **"STOP, report failure, end your turn"** — clean exit when blocked, rather than thrashing.
- **No TDD ceremony** — "if tests are applicable" rather than forcing test-first. GPT-5 applied literally to TDD produces test-file ping-pong.

### Orchestrator Responsibilities

1. Fill prompt template with `{ARCHITECTURE_NOTES}`, `{TASK_TITLE}`, `{TASK_DESCRIPTION}`.
2. Dispatch subagent, wait for completion.
3. Parse `OUTCOME:`, `COMMIT:`, `SUMMARY:` lines from the report.
4. Verify commit exists: `git rev-list <pre-task-head>..HEAD --count` must be ≥ 1. If the subagent reports success but no new commit exists, treat as failure.
5. Update task list accordingly.

### Activity Updates During Task

Orchestrator sets in-progress task's activity line via `taskList.setActivity(id, text)`:

- On dispatch: `"dispatching subagent…"`
- Periodic heartbeat (~5s): if the `subagents` extension exposes per-subagent state, surface that; otherwise generic `"in progress (Xs elapsed)"`.

---

## Verify Phase

### Structure

```
1. Automated checks        (orchestrator runs, fixer subagent on fail, cap 2)
2. Parallel reviewers      (3 subagents in parallel, one shot each)
3. Synthesize findings     (orchestrator: filter + dedupe + triage)
4. Auto-fix loop           (fixer subagent on blocker+important, cap 2)
5. Final report            (printed, ends pipeline)
```

### Step 1 — Automated Checks

Orchestrator runs checks directly via shell. Commands are auto-detected from the project:

- Tests: `package.json` `scripts.test`, `cargo test`, `pytest`, `go test ./...`, etc.
- Lint: `npm run lint`, `cargo clippy`, `ruff check`, `golangci-lint run`, etc.
- Typecheck: `npx tsc --noEmit`, `mypy`, `pyright`, etc.

On failure, dispatch a fixer subagent with the failure output. Narrow prompt: fix only the failing cause, commit with `fix: <summary>`, no adjacent refactoring.

Cap: **2 fix rounds.** After 2 rounds, remaining failures become known issues (pipeline still completes).

### Step 2 — Parallel Reviewers

Three reviewer subagents, dispatched in parallel. Each gets the full diff (`git diff <base>...HEAD`), all changed files' contents, `architecture_notes`, and the task list.

| Reviewer          | Scope                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| plan-completeness | Are all tasks from the task list actually implemented in the diff?    |
| integration       | Do tasks wire together? Data flow, cross-file contracts, types align. |
| security          | Input validation, auth, secrets, injection.                           |

Shared prompt scaffolding (scope-specific body):

```
You are a reviewer in an automated coding pipeline. Your scope: {SCOPE_DESC}.

Produce findings in this exact format:
FINDINGS:
- <file>:<line> | <severity> | <confidence> | <description>
NO_FINDINGS  (if nothing to report)

Severity: blocker | important | suggestion
Confidence: integer 0-100

Rules:
- Flag only things within YOUR scope. Do not flag other categories.
- "blocker" = will break in production or lose data.
- "important" = real bug, broken feature, or security issue.
- "suggestion" = nice-to-have, style, hypothetical edge case. Use sparingly.
- Prefer NO_FINDINGS over low-confidence speculation.
- Do not propose fixes. Findings only.
```

### Step 3 — Synthesize

1. Parse each reviewer's `FINDINGS:` lines.
2. Drop confidence < 80.
3. Deduplicate: merge findings on the same file within 3 lines, keep highest severity, record contributing reviewers.
4. Triage: `blocker` + `important` → fix loop; `suggestion` → known issues (never fixed).

### Step 4 — Auto-Fix Loop (capped 2 rounds)

- Dispatch fixer subagent with all blocker + important findings.
- Fixer commits with `fix(verify): <summary>`.
- Re-run automated checks after fix commit. Note new failures as known issues; don't loop further on automated-check regressions.
- Re-parse the same reviewer outputs against the new diff; findings present in both pre- and post-fix state remain.
- After 2 rounds, remaining findings become known issues.

### Step 5 — Final Report

(See "Final Report" section below.)

---

## Failure Handling

Unified principle: **always terminate with a report. Never leave the user in a stuck state.**

| Failure                                                  | Handling                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Plan subagent returns invalid/unparseable output         | Abort pipeline. No branch changes. Report.                                            |
| Implement subagent fails on task N                       | Stop pipeline. Tasks 1..N-1 remain committed. Tasks N+1..end never attempted. Report. |
| Verify automated checks still failing after 2 fix rounds | Pipeline still completes. Checks flagged as known issues in report. User gets branch. |
| Reviewer subagent fails to run                           | Orchestrator skips that reviewer. Skip noted in report. Other reviewers still run.    |
| Fix subagent breaks something that was passing           | Record as known issue. Do not roll back.                                              |
| Dirty working tree at `/autopilot` invocation            | Abort immediately before plan phase.                                                  |

No implicit retries (beyond the explicit fixer loops). No implicit rollbacks. Every commit that lands during the pipeline stays on the branch.

---

## Final Report & Handoff

### Entry Point

```
/autopilot <path-to-design-file>
```

Takes exactly one argument. Validates file exists and is readable. No flags in v1.

### Pre-flight Checks

1. Design file exists and is readable
2. Working tree is clean (no uncommitted changes)
3. Capture base SHA (for later diff)

### Report Format

Printed as a single transcript message at pipeline end:

```
━━━ Autopilot Report ━━━

Design:  .designs/2026-04-12-rate-limiter.md
Branch:  workflow  (5 commits ahead of main)

Tasks (5/5):
  ✔ 1. Add rate limiter config          (abc1234)
  ✔ 2. Wire config into middleware      (def5678)
  ✔ 3. Add tests for rate limiter       (ghi9012)
  ✔ 4. Add IP-based rate limit key      (jkl3456)
  ✔ 5. Update README                    (mno7890)

Verify:
  Automated checks:  ✔ tests  ✔ lint  ✔ typecheck
  Reviewers:         plan-completeness  integration  security
  Fixed:             2 findings  (1 blocker, 1 important)
  Known issues:      1 suggestion
    └ src/middleware.ts:42 | suggestion | rate limit could be extracted to a helper

Next:
  Review the branch, run /push or gh pr create when ready.
```

### Report Variants

- **Full success**: same layout, `Known issues: none`.
- **Implement failure on task N**: tasks 1..N-1 marked ✔, task N marked ✗ with failureReason, tasks N+1..end marked ◻. Verify section: `skipped (implement failed)`.
- **Verify partial**: findings unresolved after 2 fix rounds listed as known issues.
- **Automated checks still failing**: listed as known issues, pipeline still completes.

### What `/autopilot` Does NOT Do

- Does not push the branch
- Does not create a PR
- Does not switch branches
- Does not modify remote state in any way

Handoff is deferred to the user. Keeps `/autopilot` a pure local operation.

### Brainstorming Skill Handoff

The adapted Pi `brainstorming` skill ends with:

```
Design saved to .designs/YYYY-MM-DD-<topic>.md and committed.
Ready to build? Run: /autopilot .designs/YYYY-MM-DD-<topic>.md
```

No automatic chaining from brainstorm to ship. Manual, explicit.

---

## Explicit Non-Goals for v1

- No resume-from-failure / mid-pipeline restart
- No dry-run mode
- No cost or token budgeting
- No ability to skip or re-run specific phases
- No persistence across Pi sessions
- No automatic PR creation or push
- No LLM-driven task creation (orchestrator owns task state)
- No parallel implement subagents (strictly sequential)
- No task reordering or dependency graphs in task-list
- No nested subtasks in task-list
