# workflow-core

A shared Pi extension that provides primitives for building structured-state-machine-around-subagents workflows. Sibling extensions (autopilot, autoralph, future PR-review / debug / research / triage / etc.) consume it as a library.

## Mental model

**A workflow is an `async` TS function the user invokes via a slash command.** `workflow-core` gives that function four primitives — Subagent, Run, Widget, Report — and otherwise stays out of its way. This is the deliberate divergence from declarative engines like [`pi-workflows`](https://github.com/davidorex/pi-project-workflows): theirs executes a YAML/spec; ours is a library the workflow uses.

**The atomic unit is a typed subagent dispatch, not a "step."** "Step" implies something a framework executes; "subagent dispatch" is something workflow code calls. Keeping the framework out of the executor role means any control flow you can write in TS — capped fix loops, recursive descent, conditional retry, while-not-done, fan-out-then-join — works without registering a new step kind.

**Trade.** The shared core can't enforce anything cross-workflow (no DAG validation, no static introspection, no checkpoint resume). To know what a workflow does, you read its TS function. We trade introspection for flexibility.

---

## §1. Subagent

Typed dispatch with retries. Every workflow calls this on every line.

```ts
interface DispatchSpec<S extends TSchema> {
  intent: string; // shown in widget: "Plan", "Iteration 5", "Reviewer: security"
  prompt: string; // already-substituted
  schema: S; // TypeBox schema for the JSON response
  tools: ReadonlyArray<ToolName>;
  extensions?: string[];
  model?: string;
  thinking?: "low" | "medium" | "high";
  timeoutMs?: number; // wall-clock; aborts with reason: "timeout"
  retry?: RetryPolicy; // "none" | "one-retry-on-dispatch" (default) | custom
}

type DispatchResult<S extends TSchema> =
  | { ok: true; data: Static<S>; raw: string }
  | {
      ok: false;
      reason: "dispatch" | "parse" | "schema" | "timeout" | "aborted";
      error: string;
      raw?: string;
    };

interface Subagent {
  dispatch<S extends TSchema>(
    spec: DispatchSpec<S>,
  ): Promise<DispatchResult<S>>;
  parallel<S extends TSchema>(
    specs: DispatchSpec<S>[],
    opts?: { concurrency?: number },
  ): Promise<DispatchResult<S>[]>;
}
```

**Why tagged results (not throws).** Failure policy is the whole reason the same primitive serves both autopilot (aborts on parse failure) and autoralph (continues on parse failure). Making policy explicit at every dispatch site is the thing that lets a workflow's character come through. Throws also make failure look exceptional; here, parse/timeout/abort are normal runtime outcomes.

**Retry policy default: one-retry-on-dispatch.** Identical to today's `dispatchWithOneRetry`: retries dispatch-level failures (process crash, transport error) once with `(retry)` appended to intent. Guards: never retry if first attempt was aborted, never retry if run-level signal already aborted, never retry parse/schema/timeout (those are systematic, not transient).

**Subagent activity wiring is automatic.** The framework wires `onEvent` from `dispatch` into the active widget's subagent slot — workflows don't thread events.

---

## §2. Run

Lifecycle, slash-command registration, lock, abort plumbing, "always emit something" guarantee.

```ts
interface WorkflowDefinition<Args, Pre = unknown> {
  name: string; // "autopilot"
  description: string;
  parseArgs: (
    raw: string,
  ) => { ok: true; args: Args } | { ok: false; error: string };
  preflight?: (
    cwd: string,
    args: Args,
    signal: AbortSignal,
  ) => Promise<{ ok: true; data: Pre } | { ok: false; error: string }>;
  run: (ctx: RunContext<Args, Pre>) => Promise<string[] | null>; // returns final report lines, or null
}

interface RunContext<Args, Pre> {
  args: Args;
  cwd: string;
  signal: AbortSignal;
  preflight: Pre; // typed per-workflow
  subagent: Subagent;
  widget: Widget;
  ui: ExtensionAPI;
  startedAt: number;
}

function registerWorkflow<Args, Pre>(
  pi: ExtensionAPI,
  def: WorkflowDefinition<Args, Pre>,
): void;
```

`registerWorkflow(pi, def)` does all of:

1. Registers `/<name>-start` and `/<name>-cancel`.
2. Single-active-run lock scoped to `def.name`. Concurrent runs of _different_ workflows are allowed; concurrent runs of the _same_ workflow are not.
3. AbortController plumbing. `/<name>-cancel` calls `controller.abort()`; the signal is wired into `RunContext`, into `Subagent.dispatch`, into the widget cancel footer.
4. **Detach pattern.** The registered command handler returns immediately so Pi's interactive loop can dispatch `/<name>-cancel`. The pipeline runs as a detached `async` IIFE. _This is non-obvious and easy to forget when hand-rolling — the main reason `registerWorkflow` earns its keep._
5. Widget setup before `run()`, dispose after.
6. Subagent wrapping — events forwarded to widget slots, signal inheritance.
7. **Always-emit-a-report guarantee.** Workflow returns `string[] | null`; framework calls `pi.sendMessage` with `customType: "<name>-report"`. Backstop: if `run` throws, framework emits a generic `/<name>: run crashed: <error>` stub. Workflow `run` is _expected_ not to throw (failure modes go through tagged Subagent results), but the backstop covers bugs.

**Preflight is optional and per-workflow.** No fixed shape. Workflows compose from helpers in `preflight.ts`:

```ts
preflight: async (cwd, args) => {
  const f = await requireFile(args.designPath);                    if (!f.ok) return f;
  const tree = await requireCleanTree(cwd);                        if (!tree.ok) return tree;
  const baseSha = await captureHead(cwd);
  return { ok: true, data: { designPath: args.designPath, baseSha } };
},
```

PR-review's preflight returns `{ prUrl, prMeta }`. Debug's might be `{}`. Each workflow's `Pre` type is precise.

---

## §3. Widget

The sticky surface above the editor. The framework owns only what the workflow can't reasonably hand-roll. Everything else is workflow-rendered.

### Framework owns

1. **Existence + dispose** tied to run lifecycle.
2. **Tick scheduling** (1Hz default) so clocks update without the workflow polling.
3. **Subagent activity capture** — only the framework sees `onEvent` callbacks from dispatch; it normalizes them into a `SubagentSlot[]` live data structure.
4. **Theme handle** passed through from `pi.ui.theme`.

### Workflow renders

Title, body, footer — produced as strings.

```ts
interface Widget {
  setTitle(content: string | (() => string)): void;
  setBody(content: string[] | (() => string[])): void;
  setFooter(content: string | (() => string)): void;

  readonly subagents: ReadonlyArray<SubagentSlot>; // live; updated as events arrive
  elapsedMs(): number;
  readonly theme: WidgetTheme;
}

interface SubagentSlot {
  id: number;
  intent: string;
  startedAt: number;
  recentEvents: ReadonlyArray<ToolEvent>; // last K events; K configurable
  status: "running" | "finished";
}
```

**Setters accept `T | () => T`.** Function form re-evaluated on tick + on subagent event arrival. This is the mechanism that lets a workflow include subagent rendering in its body without manually re-calling `setBody` every time a tool event fires.

**No default rendering of anything.** If a workflow doesn't render subagents anywhere, subagent activity is invisible — that's the workflow's choice. Convention pressure is "the helper is the obvious thing to call," not "the framework forces it on you."

### The escape valve

A workflow with an unusual shape (debug session with a hypothesis tree, multi-stage doc generator, monitor with a state view) ships its own body renderer and calls `widget.setBody(lines)`. No framework change. The framework didn't have to anticipate "tree" as a `HistoryEntry` variant because the framework doesn't model entries at all.

---

## §4. Report

Workflow's `run` returns `Promise<string[] | null>`. Framework calls `pi.sendMessage` with `customType: "<name>-report"`. That's the entire framework surface for reports.

No fluent builder. No structural API. The workflow returns its own composed lines.

**Workflow owns its banners.** On detected cancel (`signal.aborted`), workflow includes `formatCancelledBanner(elapsed)` in the returned report. On detected failure, includes `formatFailureBanner(reason)`. Framework only intervenes if `run` _throws_ unexpectedly — emits the generic stub. The flexibility is real (some workflows might not have a meaningful "elapsed" to show, or might want a custom banner format).

---

## §5. Helpers (opt-in, pure functions)

Built strictly on top of the primitives. Workflows import the ones they want and ignore the rest.

### Render helpers (`render.ts`)

Workflow-level concerns only — clocks, stages, counters, subagent activity. Anything work-item-shaped (lists of tasks, files, hypotheses) is the workflow's responsibility (or comes from a sibling extension like `task-list`). See §6 for why no generic history-window helper.

```ts
renderSubagents(slots: ReadonlyArray<SubagentSlot>, opts?): string[];
renderClock(elapsedMs: number): string;
renderStageBreadcrumb({ stages, active, theme }): string;
renderCounter({ label, current, total?, theme }): string;
```

### Report helpers (`report.ts`)

```ts
formatHeader(title: string): string;                            // "━━━ <Title> ━━━"
formatLabelValueRow(label: string, value: string, opts?): string;
formatGitInfoBlock({ branch, commitsAhead, baseBranch? }): string[];
formatSection(title: string, indentedLines: string[]): string[];
formatKnownIssues(issues): string[];
formatCancelledBanner(elapsedMs: number): string;
formatFailureBanner(reason: string): string;
```

### Preflight helpers (`preflight.ts`)

```ts
requireFile(path: string): Promise<Result<{ path }>>;
requireCleanTree(cwd: string): Promise<Result<{}>>;
captureHead(cwd: string): Promise<string>;                      // throws on git error
```

Composable, not a fixed sequence.

### Composition example

```ts
// autopilot — composes workflow-core helpers with task-list's own renderers
import { renderTaskWindow } from "../task-list/render.ts";

ctx.widget.setTitle(
  () =>
    `autopilot · ${renderStageBreadcrumb({ stages, active })} · ${renderClock(ctx.widget.elapsedMs())}`,
);
ctx.widget.setBody(() => [
  ...renderTaskWindow(taskList.all(), { theme: ctx.widget.theme }), // from task-list
  "",
  ...renderSubagents(ctx.widget.subagents, { theme: ctx.widget.theme }), // from workflow-core
]);
ctx.widget.setFooter(
  ctx.widget.theme.fg("dim", "type /autopilot-cancel to stop"),
);
```

---

## §6. What we deliberately don't ship in v1

- **Pattern helpers** (`fixLoop`, `sequentialMap`, `iterationLoop`). Inlined loops with the primitives are ~10 lines and have workflow-specific bookkeeping (handoff persistence, history append, timeout wrapping) that a generic helper either bloats or covers only the trivial 20%. Revisit when 3+ workflows independently grow the same shape.
- **Generic run journal / persistence.** Each workflow manages its own files (autoralph already writes `.autoralph/<name>.{handoff,history}.json`). Revisit when a second case demands the same shape.
- **Contract tests** (shared scaffolding asserting "every workflow emits a report on every exit path"). With 2 workflows you can hand-audit; manual smoke testing during dev catches the obvious bug. Revisit at 4-5 workflows.
- **Multiple-command workflows** (`/foo-status`, `/foo-pause`). v1 ships exactly `/<name>-start` + `/<name>-cancel`. Add an `extraCommands` knob if a real case appears.
- **Declarative pipeline / DAG layer.** Explicit non-goal. We're library, not framework.
- **Diagnostics command** (`/workflow-runs` listing active runs). `index.ts` is a no-op for v1; if needed, add later.
- **Generic history/work-item rendering** (`HistoryEntry`, `renderHistoryWindow`, `formatHistoryRows`). Lists of work items are a per-workflow concern. Autopilot uses `task-list` (separate sibling extension) which has its own state machine and renderers; autoralph keeps iteration-window rendering local. If a third workflow shows up wanting windowed-list rendering that fits neither model, add a generic helper then.

### Relationship to `task-list`

`task-list` stays as its own sibling extension, not folded into `workflow-core`. `workflow-core` is "structured state machine around _subagents_." `task-list` is "structured state machine for _work items_." They're orthogonal and compose cleanly: workflows that want task tracking import both. Autoralph proves task-list isn't universal — it doesn't use task-list at all and tracks iterations in its own `lib/history.ts`.

---

## §7. Module layout

```
pi/agent/extensions/workflow-core/
  README.md                        # design doc lifted from this file
  index.ts                         # Pi extension default export — no-op (registers no commands)
  api.ts                           # PUBLIC: registerWorkflow, types, Subagent/Widget interfaces
  render.ts                        # PUBLIC: widget render helpers (re-exports render/*)
  report.ts                        # PUBLIC: report format helpers (re-exports report/*)
  preflight.ts                     # PUBLIC: composable preflight helpers

  lib/                             # internal — not imported by consumers
    subagent.ts + .test.ts         # Subagent implementation (wraps spawnSubagent)
    run.ts + .test.ts              # registerWorkflow + lifecycle + lock + detach + abort
    widget.ts + .test.ts           # Widget implementation (setters, tick, slot tracking)
    parse.ts + .test.ts            # parseJsonReport (lifted from autopilot/lib/parse.ts)
    types.ts                       # shared types: DispatchSpec, RunContext, ToolEvent, SubagentSlot

  render/                          # render helpers, re-exported from render.ts
    subagents.ts + .test.ts
    clock.ts + .test.ts
    breadcrumb.ts + .test.ts
    counter.ts + .test.ts

  report/                          # report helpers, re-exported from report.ts
    header.ts + .test.ts
    rows.ts + .test.ts
    sections.ts + .test.ts
    banners.ts + .test.ts
```

Consumer-side imports:

```ts
import {
  registerWorkflow,
  type RunContext,
  type DispatchSpec,
} from "../workflow-core/api.ts";
import {
  renderSubagents,
  renderClock,
  renderStageBreadcrumb,
  renderCounter,
} from "../workflow-core/render.ts";
import {
  formatHeader,
  formatSection,
  formatCancelledBanner,
} from "../workflow-core/report.ts";
import {
  requireCleanTree,
  requireFile,
  captureHead,
} from "../workflow-core/preflight.ts";
```

---

## §8. Testing approach

`node:test` + `tsx`, files colocated as `*.test.ts`, run via `make test` and `make typecheck`.

**Tight coverage on `lib/subagent.ts`, `lib/widget.ts`, `lib/run.ts`** — the tricky bits where silent regressions hurt most:

- **Subagent.** Tagged-result conversion for every failure mode (dispatch / parse / schema / timeout / aborted). Retry policy: one retry on dispatch failure, no retry on aborted, no retry on parse, no retry when run signal already aborted. `parallel` fan-out + concurrency limit. Widget event forwarding.
- **Widget.** Static vs function-form setter re-evaluation (fake timers). Subagent slot allocation/deallocation/event trim. Theme passthrough. Dispose semantics (tick stops, setters no-op).
- **Run.** Single-active-run lock. Detach pattern (handler returns immediately even though run is still going). Abort plumbing (`/<name>-cancel` aborts the controller; signal propagates). `run` return value handling (`string[]` → emit; `null` → no emit). Backstop on throw. Widget setup/teardown around `run`.

**Anything that interacts with `AbortSignal` has a test that fires `controller.abort()` mid-operation.** Abort handling is the most common silent-regression surface in libraries like this.

**Pure-function tests on every helper** in `render/`, `report/`, `preflight/`, `lib/parse.ts`. Snapshot-style tests for render output. Edge cases: empty list, single item, exact-window-boundary, unicode glyph width.

**Deferred.** Integration tests that run a real subagent through the framework — slow, flaky, better as manual smoke during workflow development.

---

## §9. Migration plan

**Defer until after implementation.** Once `workflow-core` is built and tested, autopilot and autoralph migrate onto it in separate PRs. Likely autoralph first (smaller surface area, fewer phases). Migration is internal — slash-command names change from `/autopilot` and `/autoralph` to `/autopilot-start` and `/autoralph-start`.

The deletion side: `dispatch.ts`, `parse.ts`, `preflight.ts` (currently identical copies in both extensions) all go. Status-widget and report files in each extension shrink to the workflow-specific composition. Phase files keep their workflow-specific orchestration logic but use `ctx.subagent.dispatch` instead of the local dispatch wrapper.

---

## Key design decisions (settled)

| Decision                | Choice                                                | Reasoning                                                                                          |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Library vs. framework   | Library                                               | Workflows stay TS functions; any control flow works without new step kinds                         |
| Atomic unit             | Subagent dispatch, not "step"                         | Framework stays out of executor role                                                               |
| Subagent failure        | Tagged result, not throw                              | Failure policy is per-call-site; same primitive, different policy per workflow                     |
| Run report              | Return value (`string[] \| null`), not callback       | Type-checked exhaustive paths; one report per run                                                  |
| Run on throw            | Backstop (framework emits stub)                       | `run` is expected not to throw; backstop is for bugs                                               |
| Run lock scope          | Per-workflow name                                     | `/autopilot` and `/pr-review` can run concurrently                                                 |
| Commands                | `/<name>-start` + `/<name>-cancel` only in v1         | Don't overengineer                                                                                 |
| Widget shape            | Three setters (`T \| () => T`), no structured data    | Don't bake in "linear list of past + current + upcoming" — too rigid for non-list-shaped workflows |
| Subagent rendering      | Framework captures, helper renders, workflow composes | Consistent with "framework owns plumbing, workflow owns rendering"                                 |
| Report builder          | None — workflow returns lines directly                | Don't bake in `header → rows → sections → knownIssues` shape                                       |
| Banners on cancel/fail  | Workflow owns                                         | Helper makes it a one-liner; flexibility is real                                                   |
| Pattern helpers         | Skip in v1                                            | Inline loops are ~10 lines; revisit at 3+ workflows                                                |
| Persistence             | Per-workflow                                          | Revisit when a second case appears                                                                 |
| Contract tests          | Skip in v1                                            | Hand-audit at N=2; revisit at N=4+                                                                 |
| `task-list` integration | Stays as its own sibling extension                    | Orthogonal concerns (subagents vs work items); autoralph proves task-list isn't universal          |
| Naming                  | `workflow-core`                                       | Library, not framework                                                                             |
