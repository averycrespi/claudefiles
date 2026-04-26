# Task-list agent tools + sticky widget

**Status:** design / not yet implemented
**Authors:** Avery, Claude
**Date:** 2026-04-26

## Summary

Give the Pi agent direct tools to manage the task list (currently only mutated by other extensions like autopilot), replace the inline message-stream rendering with a sticky widget, and clean up autopilot's misuse of `task.description` as a cross-phase transport for implementation context.

## Motivation

Today the `task-list` extension exposes a singleton store via `api.ts` for sibling extensions, plus an inline custom-message renderer. There are no agent-facing tools — Pi can't manage its own todo list during a session — and the inline render produces a noisy stale-snapshot trail when a workflow drives many mutations. Separately, autopilot abuses `Task.description` to ferry implementation-context strings between its plan and implement phases, conflating user-facing task tracking with workflow-internal state.

This design adds two agent tools (`task_list_set`, `task_list_get`), replaces the inline renderer with a sticky widget, and strips `description` out of the task model entirely.

## Design decisions

The design rests on five decisions, made during brainstorming:

1. **One shared list.** Agent and workflows write to the same singleton store. Workflows refuse to start if the agent has live tasks; the existing strict state machine becomes the conflict gate.
2. **Bulk-write tool.** A single `task_list_set` tool that takes the entire desired list with status per task. The agent rewrites the list each call; the system reconciles. Mirrors Claude Code's TodoWrite. Agent doesn't track ids across calls (though optional `id` is supported for continuity).
3. **Strict state machine semantics.** Bulk-write reconciles each task through the existing `VALID_TRANSITIONS` table. Sticky completion is preserved. All validation errors are collected before rejecting (no partial writes, no fail-fast).
4. **Drop terminal omissions, error on live omissions.** Tasks not in the new payload: removed if `completed`/`failed`, but reject the entire call if any are `pending`/`in_progress`. Forces explicit reconciliation rather than silent abandonment.
5. **Sticky widget replaces inline rendering.** Task list is _state_, not events. Inline custom-message rendering goes away; a sticky widget shows the current list (auto-shown when non-empty, auto-hidden when empty). Owns the rendering of the list; autopilot's widget shrinks to phase/subagent/clock and stops carrying task rows.

## API changes

### `state.ts` — `Task` type loses `description`

```ts
export interface Task {
  id: number;
  title: string;
  status: TaskStatus;
  startedAt?: number;
  completedAt?: number;
  summary?: string;
  failureReason?: string;
  activity?: string;
}

taskList.create(tasks: { title: string }[]): Task[]
taskList.add(title: string): Task
```

`description` disappears from the type, from `create`, from `add`, from the renderer's input shape.

`taskList.clear()` stays public on the store API. Used by tests for scaffolding and by `session_shutdown` for end-of-session reset. Not exposed to the agent (the agent gets `task_list_set` with `tasks: []` for the same effect).

### Agent tools

Both tools registered by the `task-list` extension's `index.ts`:

**`task_list_set`** — bulk replace.

```ts
{
  tasks: Array<{
    id?: number;
    title: string;
    status?: "pending" | "in_progress" | "completed" | "failed";
    summary?: string;
    failure_reason?: string;
  }>;
}
```

Schema rules:

- `summary` required when `status` is `completed`.
- `failure_reason` required when `status` is `failed`.
- `id` provided → must reference an existing task in the store.
- No duplicate ids in the payload.

**`task_list_get`** — read current state.

No parameters. Returns the same compact shape as `task_list_set`'s success result text.

### Reconciliation algorithm for `task_list_set`

1. **Validate the entire payload up front.** Walk every task; collect _all_ errors (field-level, identity, transition, cross-task). No early return.
2. **Compute the diff:**
   - **New** (no `id`): will be appended with auto-assigned id.
   - **Carried** (`id` exists in store): may have a status change, validated against `VALID_TRANSITIONS`.
   - **Omitted** (in store, not in payload): partitioned into terminal vs. live.
3. **Cross-task validation:** if any omitted task is `pending`/`in_progress`, append an error.
4. **Reject or apply atomically:**
   - On any errors → reject the whole call, return error list + current unchanged state.
   - On zero errors → drop terminal omissions, apply transitions/field updates, append new tasks, single `notify()` at end.
5. **Build result text** for the agent: counts header + one line per task (`id`, title, status, plus `summary`/`failure_reason` if terminal).

### Result text format

Success:

```
5 tasks (2 completed, 1 in_progress, 2 pending)

1. Bug fix — completed (summary: "Fixed the off-by-one in pagination")
2. Add docs — completed (summary: "Added README section on task ids")
3. Refactor utils — in_progress
4. Wire CI — pending
5. Add benchmarks — pending
```

Error:

```
task_list_set rejected — fix all of these and retry:

- Task 3 ("Add tests"): cannot transition completed → pending (completion is sticky)
- Task 5 ("Refactor utils"): status is "completed" but summary is missing
- Live tasks omitted from payload: 2 ("Bug fix"), 4 ("Add docs")

Current list (unchanged):
1. Bug fix — in_progress
2. Add docs — pending
3. Add tests — completed
...
```

Both shapes are identical between `task_list_set` (success result) and `task_list_get`. No `description` in either. Compact by construction.

### Slash command

The `task-list` extension registers `/task-list-clear`, which calls `taskList.clear()` unconditionally. No confirmation prompt — the command name communicates intent. Used as the user's escape hatch when the workflow conflict gate fires.

## Workflow conflict gate

Today autopilot does `taskList.clear(); taskList.create(plan)` at `autopilot/index.ts:152`. The leading `clear()` masks `create()`'s built-in guardrail (which throws if any task is non-terminal). The fix is one line: drop the `clear()`.

After that change, when the user runs `/autopilot-start` and the agent has live tasks, `create()` throws and `_workflow-core`'s pre-flight error path surfaces a user-facing message:

```
autopilot cannot start: task list has 2 live tasks.
Complete or fail them via the agent, or run /task-list-clear to drop them.
```

The message text is built in `state.ts` (the throw site) so any future workflow gets it for free without touching `_workflow-core`. The error includes the live-task count and concrete recovery paths.

`_workflow-core` itself needs no special integration with the task list — it already surfaces pre-flight errors to the user, and `create()`'s throw is just one more.

## Sticky widget

### Why replace inline

The current inline custom-message renderer fires on every store mutation. During a workflow run (autopilot drives 5+ mutations per task), the user sees stale snapshots scrolling past in the message stream while the live picture sits in autopilot's sticky widget. The inline trail is dead history that pollutes scrollback.

A task list is _state_, not an event stream. It belongs in a sticky surface that updates in place.

### Widget mechanics

The `task-list` extension owns its own sticky widget — **no dependency on `_workflow-core`'s widget abstraction.** Built directly on Pi's `pi.ui.setWidget(key, content, options?)` API.

Lifecycle:

- Store goes from empty → non-empty: `pi.ui.setWidget("task-list", render(state))`.
- Store mutates while non-empty: same call, content updates in place (Pi reconciles by key).
- Store goes from non-empty → empty: `pi.ui.setWidget("task-list", undefined)`.
- `session_shutdown`: store clears, widget dismisses.

The 100ms debounce currently used for the inline emission is removed — `setWidget` calls are cheap and Pi handles its own render scheduling.

### 10-line cap

`pi.ui.setWidget` enforces `MAX_WIDGET_LINES = 10` for string-array content. The renderer budget becomes: 1 header line + up to 9 task rows, or 1 header + 8 rows + a `+N more` summary line. The existing `truncateWithPriority` ordering (recently-completed → in_progress → pending → older completed → failed) is preserved.

If during implementation we discover the component-factory form of `setWidget` bypasses the cap, we may revisit — but the 10-line render is fine for the intended use case.

### Multi-widget coexistence

Pi supports multiple simultaneous widgets, stacked vertically in their placement zone. `task-list` and `autopilot` register separately and both render. Stacking order is determined by insertion order _or_ explicit placement (`aboveEditor` vs `belowEditor`).

**TBD during implementation:** which widget sits where. Lean: autopilot above (live workflow status, fast-changing) and task-list below (the plan, slower-changing). Implementable as `autopilot: aboveEditor (default)`, `task-list: belowEditor` for deterministic positioning that survives mount/unmount cycles.

## Autopilot refactor

`task.description` is currently used in exactly one place: `autopilot/phases/implement.ts:61` templates it into the subagent prompt as `{TASK_DESCRIPTION}`. Autopilot's plan phase parses a design doc into `[{ title, description }]` and passes both through the task list to reach the implement phase.

This conflates user-facing task tracking with workflow-internal data transport. Fix: autopilot's orchestrator carries a sidecar `Map<taskId, string>` for implementation context, scoped to the workflow run.

```ts
// autopilot/index.ts (orchestrator) — replaces today's clear; create
const plan = await runPlan(...);
const created = taskList.create(plan.data.tasks.map(t => ({ title: t.title })));
const planContext = new Map<number, string>();
for (let i = 0; i < created.length; i++) {
  planContext.set(created[i].id, plan.data.tasks[i].description);
}
// pass planContext into implement phase

// autopilot/phases/implement.ts
const description = args.planContext.get(task.id);
prompt.replace("{TASK_DESCRIPTION}", description);
```

Implement phase signature gains a `planContext: Map<number, string>` parameter. Tests adapt.

The autopilot widget body (`autopilot/lib/widget-body.ts:24-25, :30`) loses its task-list rendering and the task-list subscription — both now owned by the task-list extension. `autopilot/lib/widget-tasks.ts` deletes outright. Autopilot widget shrinks to phase, subagent, clock, breadcrumb, counter.

## Test changes

- `taskList.clear()` calls in test setup stay (`autopilot/index.test.ts:129`, `:267`; `autopilot/phases/implement.test.ts:13`). They're scaffolding, not bypassing semantics.
- New tests in `task-list/`:
  - Unit: bulk-write reconciliation including all-errors-collected behavior, drop-terminal/error-on-live omission rule, sticky-completion violations.
  - Integration: widget mount/dismiss on empty↔non-empty transitions; widget content matches store state after mutations.
- Updated tests in `task-list/`:
  - `render.test.ts` shifts from "produces a custom message" to "produces a widget body string array".
  - `state.test.ts` drops `description` from all fixtures and `Task` assertions.
- Updated tests in `autopilot/`:
  - Widget body tests lose task-list assertions (autopilot widget no longer renders the rows).
  - `phases/implement.test.ts` adapts to new `planContext` parameter.
  - Smoke test (`autopilot/index.test.ts`) updated for the no-`clear()` flow and the new conflict-gate error message.

## Migration order

The autopilot refactor and the task-list changes ship together — same PR — because dropping `description` from `Task` is a breaking change for autopilot and there's no way to land them independently without a transitional state.

Roughly:

1. Update `state.ts`: drop `description`, simplify `create`/`add`, build new conflict error message in `create()`.
2. Update `task-list/index.ts`: remove inline message renderer, register sticky widget, register `/task-list-clear`, register `task_list_set` and `task_list_get` tools.
3. Update `task-list/render.ts`: produce widget body string array instead of `Text` component.
4. Update autopilot: drop `clear()` call, add `planContext` map, update implement phase signature, remove task-list section from widget body, delete `widget-tasks.ts`.
5. Update tests across both extensions.

## Open questions / known warts

- **Stacking order placement** (`aboveEditor` vs `belowEditor` for each widget): TBD during implementation.
- **Component-factory form vs 10-line cap:** worth checking whether `setWidget` accepts a function for dynamic content that escapes the line cap. If yes, we could optionally lift the cap. Not blocking.
- **Insertion order vs widget remount:** if autopilot widget transiently disappears mid-run (does it?), does it re-insert at the end of the order? Mostly hypothetical for v1; explicit placement sidesteps it.

## Out of scope

- Persisting the task list across sessions (today and after this design, it's session-scoped, in-memory).
- Coordination model for >1 simultaneous workflow widget (only autopilot exists today).
- Hierarchical / nested task lists for sub-workflow tasks.
- Activity field exposure in agent tools (workflow-only).
