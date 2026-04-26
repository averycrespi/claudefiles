# Task-list Agent Tools + Sticky Widget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add agent-facing tools (`task_list_set`, `task_list_get`) to the task-list extension, replace its inline custom-message rendering with a sticky widget, and refactor autopilot to stop misusing `Task.description` as cross-phase transport for implementation context.

**Architecture:** Eight self-contained tasks, ordered so the codebase typechecks and all tests pass after each one. Autopilot is decoupled from `Task.description` first (Task 1) so the field can be safely dropped (Task 2). The sticky widget replacement (Task 6) lands before autopilot's widget loses its task-list rendering (Task 7) so the UI never goes dark. Design doc: `.designs/2026-04-26-task-list-agent-tools.md`.

**Tech Stack:** TypeScript, Pi extension API (`@mariozechner/pi-coding-agent`), `@sinclair/typebox` for tool schemas, `node:test` via `tsx` for unit tests.

---

## Task 1: Replace `task.description` reads with a `planContext` sidecar in autopilot

**Files:**

- Modify: `pi/agent/extensions/autopilot/phases/implement.ts:1-130` — extend `RunImplementArgs` (or equivalent) to include `planContext: Map<number, string>`; replace `task.description` read at line 61 with `args.planContext.get(task.id)`.
- Modify: `pi/agent/extensions/autopilot/index.ts:140-160` — after `taskList.create(plan.data.tasks)`, build a `Map<number, string>` from the created tasks' ids to `plan.data.tasks[i].description`. Pass into the implement-phase invocation.
- Modify: `pi/agent/extensions/autopilot/phases/implement.test.ts` — every test that calls into the implement phase passes a `planContext` map populated for each task fixture.

**Acceptance Criteria:**

- The implement phase no longer reads `task.description` anywhere — `grep -n 'task\.description' pi/agent/extensions/autopilot/` returns zero matches in `phases/`.
- Implement-phase tests pass without `Task` fixtures populating `description`-derived prompt placeholders directly; the `planContext` map is the only source.
- `make typecheck` and `make test` green.

**Notes:**

- This task preserves `Task.description` as a field on the type — it's still populated by `taskList.create` calls in autopilot (and test fixtures may still set it). Task 2 deletes it. Splitting these is what makes each task green-on-its-own.
- The implement phase's prompt template uses `{TASK_DESCRIPTION}`. The replacement reads from `planContext`; if a task id is missing from the map, throw with a clear message — workflow-internal contract violation, not user-facing.

**Commit:** `refactor(autopilot): replace task.description reads with planContext map`

---

## Task 2: Drop `description` from `Task` type and store API

**Files:**

- Modify: `pi/agent/extensions/task-list/state.ts` — remove `description: string` from `Task` interface; change `taskList.create` signature to `create(tasks: { title: string }[]): Task[]`; change `taskList.add(title, description)` to `add(title: string): Task`; remove `description` from the store implementation (line ~93, ~105).
- Modify: `pi/agent/extensions/task-list/api.ts` — type re-exports stay the same shape, just inherit the change.
- Modify: `pi/agent/extensions/task-list/state.test.ts` — drop `description` from all task fixtures and assertions.
- Modify: `pi/agent/extensions/task-list/render.test.ts` — drop `description` from any task fixtures (renderer doesn't read it but fixtures may set it).
- Modify: `pi/agent/extensions/task-list/api.test.ts` — drop `description` from fixtures.
- Modify: `pi/agent/extensions/task-list/smoke.test.ts` — drop `description` from fixtures.
- Modify: `pi/agent/extensions/autopilot/index.ts` — `taskList.create(plan.data.tasks.map(t => ({ title: t.title })))` (drop the description from the mapped object). The `planContext` map (built in Task 1) becomes the authoritative store for descriptions.
- Modify: `pi/agent/extensions/autopilot/lib/widget-tasks.ts` and `widget-tasks.test.ts` — if any reference `task.description`, drop those references (renderer didn't use it, but defensive grep).
- Modify any other autopilot test files that construct `Task` fixtures — drop `description`.

**Acceptance Criteria:**

- `grep -rn '\.description' pi/agent/extensions/task-list/ pi/agent/extensions/autopilot/lib/` shows zero matches against `Task` objects (matches against `description` on schemas/findings/etc. are fine).
- `make typecheck` green: `Task` type no longer has `description` and no source file references it on a Task instance.
- `make test` green: all task-list and autopilot tests pass with the simplified `Task` shape.

**Notes:**

- `taskList.create()` keeps its existing guardrail (throws if any non-terminal task exists, auto-clears if all terminal). Don't change that behavior here — Task 3 changes the error message.

**Commit:** `refactor(task-list): drop description field from Task model`

---

## Task 3: Improve `create()` conflict error and stop autopilot's preemptive `clear()`

**Files:**

- Modify: `pi/agent/extensions/task-list/state.ts` — replace the existing throw at create() (was `"Cannot create: existing list has pending or in_progress tasks"`) with a richer message that includes live counts and recovery paths. Example shape:

  ```
  Task list has 2 live tasks (1 pending, 1 in_progress). Complete or fail them via task_list_set, or run /task-list-clear to drop them.
  ```

  Compute counts from current state at throw time.

- Modify: `pi/agent/extensions/autopilot/index.ts:140-155` — remove the `taskList.clear()` call that precedes `taskList.create(...)`. The orchestrator now relies on `create()`'s natural guardrail; if the user has live tasks, the throw propagates to `_workflow-core`'s pre-flight error path and surfaces to the user.
- Modify: `pi/agent/extensions/task-list/state.test.ts` — add a test asserting `create()` throws with a message containing `"live tasks"` and `"/task-list-clear"` when called against state with pending/in_progress tasks; assert the count is correct.
- Modify: `pi/agent/extensions/autopilot/index.test.ts` — update the smoke test that exercised `clear; create` to confirm autopilot now starts cleanly when the list is empty/all-terminal, and surfaces a useful error when the list has live tasks. Tests at lines 129 and 267 that scaffold via `taskList.clear()` stay — they're test setup, not bypassing semantics.

**Acceptance Criteria:**

- `taskList.clear()` is no longer called in `pi/agent/extensions/autopilot/index.ts` (only in tests).
- `taskList.create()` throws with a message that includes the count of live tasks and references `/task-list-clear` as the recovery command.
- Autopilot startup against a list with live agent tasks produces a user-visible error mentioning both recovery paths; against an empty/all-terminal list it proceeds normally.

**Notes:**

- The slash command `/task-list-clear` is registered in Task 5 — it's safe for the error message to reference it now because the message is informational text, not a runtime dependency.
- `_workflow-core` doesn't need touching: it already surfaces pre-flight errors, and `create()`'s throw is just one more.

**Commit:** `feat(task-list): improve conflict error and let create() be the gate`

---

## Task 4: Add `task_list_set` and `task_list_get` agent tools

**Files:**

- Modify: `pi/agent/extensions/task-list/state.ts` — add a `reconcile(payload)` method to the `TaskStore` interface and implementation. Signature:

  ```ts
  type ReconcilePayload = Array<{
    id?: number;
    title: string;
    status?: TaskStatus;
    summary?: string;
    failureReason?: string;
  }>;

  type ReconcileResult =
    | { ok: true; tasks: Task[] }
    | { ok: false; errors: string[] };

  reconcile(payload: ReconcilePayload): ReconcileResult;
  ```

  Algorithm:
  1. Walk payload and collect ALL errors before rejecting:
     - Missing `summary` when `status === "completed"`.
     - Missing `failureReason` when `status === "failed"`.
     - `id` provided but not present in store.
     - Duplicate `id` in payload.
     - Carried task transition not in `VALID_TRANSITIONS`.
  2. Compute omitted tasks (in store, not in payload). Partition by terminal vs. live. Append a single error if any are live (with their ids and titles listed).
  3. If errors are non-empty: return `{ ok: false, errors }` and DO NOT mutate state. Single notify is _not_ called (no state change).
  4. On zero errors:
     - Drop terminal omissions from state.
     - Apply transitions and field updates to carried tasks (set `startedAt` on first start, `completedAt`+`summary` on complete, `completedAt`+`failureReason` on fail; clear `activity` when leaving in_progress).
     - Append new tasks (no `id` in payload) with auto-assigned ids.
     - Single `notify()` at the end.
     - Return `{ ok: true, tasks: state.tasks }`.

- Create: `pi/agent/extensions/task-list/tools.ts` — define typebox schemas for `task_list_set` and `task_list_get`, register both via `pi.registerTool({ name, label, description, parameters, async execute(...) })`. Build the result text via shared helpers:

  ```ts
  function formatList(tasks: Task[]): string; // header + numbered rows
  function formatErrors(errors: string[], current: Task[]): string; // bulleted errors + "Current list (unchanged):"
  ```

  Tool execute bodies:
  - `task_list_set`: call `taskList.reconcile(params.tasks)`. On `ok` return `{ content: [{ type: "text", text: formatList(result.tasks) }], details: { taskCount: result.tasks.length } }`. On `!ok` return formatErrors(result.errors, taskList.all()) wrapped as a text result. **Errors are returned as a normal tool result, not thrown** — tools return error text the agent can read.
  - `task_list_get`: no parameters; returns `formatList(taskList.all())`.

- Modify: `pi/agent/extensions/task-list/index.ts` — call `registerTools(pi)` from a new `tools.ts`. Keep all existing inline-rendering wiring intact for now (Task 6 replaces it).
- Test: `pi/agent/extensions/task-list/state.test.ts` — add a `reconcile` test suite covering:
  - Empty payload against empty store: ok with empty list.
  - Empty payload against all-terminal store: ok, tasks dropped.
  - Empty payload against live tasks: error mentioning each live task by id and title.
  - Status transition from `in_progress → completed` with `summary`: ok; `completedAt` stamped.
  - Status transition from `completed → pending`: error; sticky completion preserved.
  - Multiple errors in one call: all surfaced together, not just the first.
  - New tasks (no `id`) appended with ascending auto-ids after existing.
  - Carried task with unchanged fields: no-op transition, no error.
- Test: `pi/agent/extensions/task-list/tools.test.ts` (new file) — covers tool integration:
  - `task_list_set` happy path returns formatted success text including counts header and per-task rows.
  - `task_list_set` rejection returns formatted error text with bulleted errors and "Current list (unchanged):" tail.
  - `task_list_get` returns the same format as `task_list_set` success.
  - Tool registration: assert `pi.registerTool` is called twice with the right names. Test via a stub `pi` mock (similar pattern to existing tool tests in `mcp-broker` or `web-access`).

**Acceptance Criteria:**

- `taskList.reconcile()` collects all errors before rejecting; on success applies all changes atomically with one notify; on failure leaves state untouched.
- `task_list_set` and `task_list_get` are registered as Pi tools and produce the result-text shapes specified in the design doc (no `description` field in the output).
- Reconciliation honors the existing `VALID_TRANSITIONS` table (sticky completion preserved).
- Live omissions reject the call with task ids and titles in the error message.

**Notes:**

- This task is the largest in the plan. The reconciliation algorithm is the substance; the tool wrappers are thin. Test coverage for `reconcile` is the priority — tools.test.ts can lean on smaller integration smoke tests because the heavy logic is in `state.ts`.
- The renderer (`render.ts`) is _not_ touched here — it still produces a `Text` component for the inline message system. Task 6 changes that.
- The agent's bulk-write tool does not expose `activity` (workflow-only field). Don't add it to the schema.
- Tool `description` strings (in the schema) should be agent-facing, concise, and explain when to use each tool. Lean on Claude Code's TodoWrite tone as a reference.

**Commit:** `feat(task-list): add task_list_set and task_list_get agent tools`

---

## Task 5: Register `/task-list-clear` slash command

**Files:**

- Modify: `pi/agent/extensions/task-list/index.ts` — register a slash command using `pi.registerCommand("task-list-clear", { description, handler })`. Handler calls `taskList.clear()` unconditionally; emit a brief `ctx.ui.notify(...)` confirmation (look at `_workflow-core/lib/run.ts:47-57` for the registration pattern).
- Test: `pi/agent/extensions/task-list/index.test.ts` (new file if it doesn't exist) — register the extension against a stub `pi`, invoke the command handler, assert `taskList.all()` is empty afterwards regardless of starting state. If a smoke test exists already, extend it.

**Acceptance Criteria:**

- `/task-list-clear` is registered when the extension loads.
- Invoking the handler drops all tasks (including live ones) without confirmation.
- A user-facing notification confirms the clear.

**Notes:**

- No confirmation prompt by design — the command name communicates intent.
- This is intentionally a tiny task. Keeping it separate from Task 4 because it's a different audience (user vs. agent) and a different surface (slash command vs. tool).

**Commit:** `feat(task-list): register /task-list-clear slash command`

---

## Task 6: Replace inline message renderer with sticky widget

**Files:**

- Modify: `pi/agent/extensions/task-list/index.ts`:
  - Remove the `pi.registerMessageRenderer(CUSTOM_TYPE, ...)` call.
  - Remove the `pi.sendMessage(...)` call inside `flush()`.
  - Remove the 100ms debounce timer wiring (`debounceTimer`, `latest`, `flush`).
  - Replace the subscriber with one that calls `pi.ui.setWidget("task-list", lines, { placement: "belowEditor" })` whenever the list is non-empty, and `pi.ui.setWidget("task-list", undefined)` when empty. Use the rendering helpers in `render.ts` to produce the `string[]` body (see next bullet).
  - On `session_shutdown`: dismiss the widget (`setWidget("task-list", undefined)`), clear the store, unsubscribe.
- Modify: `pi/agent/extensions/task-list/render.ts`:
  - Add a new exported function `renderWidgetLines(state: TaskListState, opts: { rows?: number }): string[]` returning a string array suitable for `pi.ui.setWidget`. Reuses the existing `glyphFor`/`styleFor`/`summarizeCounts`/`truncateWithPriority` helpers.
  - Output respects the 10-line widget cap: 1 header line + up to 9 task rows, or 1 header + 8 rows + a `+N more` line. The truncation budget for `truncateWithPriority` becomes `9` (rows) or `8` (rows + need a "+N more").
  - The existing `renderTaskListMessage` (returns a `Text` component) can be deleted — nothing consumes it after this task.
- Modify: `pi/agent/extensions/task-list/render.test.ts`:
  - Replace tests that asserted on `Text` component output with tests that assert on the `string[]` returned by `renderWidgetLines`.
  - Cover: header counts; one line per task; truncation with `+N more`; empty list returns empty array (or document and assert whatever the chosen empty behavior is — recommend returning `[]` and letting the index.ts decide to dismiss).
  - Re-test the truncation priority (recently-completed → in_progress → pending → older completed → failed) under the new 9-row budget.
- Modify: `pi/agent/extensions/task-list/smoke.test.ts` — if it asserts on `pi.sendMessage` or `pi.registerMessageRenderer`, switch to asserting on `pi.ui.setWidget` calls.

**Acceptance Criteria:**

- `pi.registerMessageRenderer` and `pi.sendMessage` are no longer called by the task-list extension.
- Mutations to the store result in a single `pi.ui.setWidget("task-list", ...)` call with the rendered string array; clearing the store dismisses the widget via `setWidget("task-list", undefined)`.
- The 100ms debounce timer is gone.
- Widget body is capped at 10 lines per Pi's `MAX_WIDGET_LINES` constant.

**Notes:**

- The widget key `"task-list"` and placement `"belowEditor"` are concrete choices. Placement of `belowEditor` keeps task-list visually below the editor and out of contention with autopilot's `aboveEditor` (default) widget — autopilot stays at top, task-list at bottom.
- Autopilot's widget body still renders the task-list rows at this point — both surfaces visible briefly during a workflow run. Task 7 fixes that.
- The `pi.ui.setWidget` API documented signature: `setWidget(key: string, content: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" })`. Confirm against the type definition during implementation; the design-doc research used `node_modules/@mariozechner/pi-coding-agent`.

**Commit:** `refactor(task-list): replace inline renderer with sticky widget`

---

## Task 7: Remove task-list section from autopilot's widget

**Files:**

- Modify: `pi/agent/extensions/autopilot/lib/widget-body.ts:1-50` — remove the `renderTaskWindowLines(taskList.all(), ...)` call (line ~25) and the `taskList.subscribe(() => widget.invalidate())` subscription (line ~30). The remaining widget body should produce phase, subagent, clock, breadcrumb, counter — no task rows.
- Delete: `pi/agent/extensions/autopilot/lib/widget-tasks.ts`.
- Delete: `pi/agent/extensions/autopilot/lib/widget-tasks.test.ts`.
- Modify: `pi/agent/extensions/autopilot/lib/widget-body.test.ts` — remove all assertions about task-list rows being present in the autopilot widget body. Keep assertions about phase/subagent/clock/breadcrumb/counter.

**Acceptance Criteria:**

- `pi/agent/extensions/autopilot/lib/widget-tasks.ts` and its test no longer exist.
- Autopilot's widget body produces no task-list rows; running autopilot with the task-list extension loaded shows the rows in the task-list widget below the editor, not in the autopilot widget above.
- `make typecheck` and `make test` green.

**Notes:**

- This task depends on Task 6 — without the sticky widget, removing autopilot's rendering leaves users with no way to see the task list during a workflow run.
- After this task, the `widget-body.ts` `taskList` import (`import { taskList } from "../../task-list/api.ts";` at line 7) is unused and should be removed.

**Commit:** `refactor(autopilot): remove task-list rendering from workflow widget`

---

## Task 8: Update READMEs

**Files:**

- Modify: `pi/agent/extensions/task-list/README.md` — substantially rewrite to reflect the new shape:
  - Public API section: drop `description` from `Task`, `create`, `add`. Note the new `reconcile` method (or document it as internal-only and let the agent tools be the public surface).
  - New "Agent tools" section documenting `task_list_set` and `task_list_get` with their schemas, result-text format (success and error), and the strict-state-machine semantics.
  - New "Slash command" section documenting `/task-list-clear`.
  - Replace the "TUI rendering" section (currently describes inline custom messages) with a "Sticky widget" section: describes `pi.ui.setWidget`, the 10-line cap, placement, and auto-show/auto-hide on empty.
  - Drop the v1-deferred-footer note in `index.ts` if still present (the footer is no longer the footer; it's a sticky widget below the editor).
- Modify: `pi/agent/extensions/autopilot/README.md` — anywhere it mentions rendering the task list inside the autopilot widget, update to "task-list extension renders the rows in its own sticky widget below the editor; the autopilot widget shows phase/subagent/clock/breadcrumb."
- Modify: `pi/README.md:35` — update task-list's purpose blurb: was `Session-scoped task tracking with rich inline TUI rendering`; new value should mention agent tools + sticky widget. Suggest: `Session-scoped task list with agent tools and a sticky TUI widget`.

**Acceptance Criteria:**

- README files describe the new sticky-widget surface, the agent tools, and the slash command. No remaining references to "inline custom-message rendering" or `Task.description` as a public field.
- `pi/README.md` table entry for task-list reflects the agent-tool surface.

**Notes:**

- This is a docs-only commit. No source files change.

**Commit:** `docs(task-list): update README for agent tools and sticky widget`

---

<!-- Documentation updates are covered by Task 8. -->
