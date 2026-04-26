# Migrate `autopilot` onto `workflow-core`

Pure migration of the `autopilot` Pi extension onto the new `workflow-core` shared library. No behavior change; same plan → implement → verify pipeline, same prompts, same fix-loop caps, same termination rules, same final-report shape. Just the surrounding scaffolding gets swapped.

State-of-the-art improvements from `.designs/2026-04-24-autopilot-sota-research.md` are explicitly **out of scope** for this design — to be folded in later, after the migration baseline is stable. Migrating the sibling `autoralph` extension is also deferred.

## Goals & non-goals

**Goals**

- Delete every line of autopilot code that has a generic equivalent in workflow-core (dispatch wrapper, parse helper, status widget plumbing, single-active-run lock, abort plumbing, report emission, preflight primitives).
- Preserve current behavior, the prompt set, the report layout, and the failure matrix.
- Pick up workflow-core's free observability — per-run log directory, `events.jsonl`, sidecar prompts/outputs, mirrored final report.

**Non-goals**

- Renaming the extension. (`autopilot` stays.)
- Any of the SOTA additions (AC-extraction phase, localization, plan-repair gate, cross-family verify, per-phase reasoning effort, etc.).
- Migrating `autoralph`.
- Worktree isolation, ticket-to-PR scope shifts.

## Decisions taken during design

| #   | Decision                               | Chosen                                                                                                                      |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scope                                  | Pure migration only                                                                                                         |
| 2   | Name                                   | Keep `autopilot`                                                                                                            |
| 3   | Command surface                        | Adopt workflow-core convention: `/autopilot-start <design.md>` and `/autopilot-cancel`                                      |
| 4   | Widget refresh on task-list mutations  | Add `widget.invalidate()` to workflow-core (small, generic, future-useful)                                                  |
| 5   | `Log: <run-dir>` line in report        | Yes, on by default                                                                                                          |
| 6   | `runSlug`                              | `basename(designPath, ".md")`                                                                                               |
| 7   | `workflowDir/design.md` copy           | Yes (run is self-contained for replay)                                                                                      |
| 8   | `ctx.log` instrumentation              | Five log lines in `run()`: plan-tasks, implement-task-start/end, verify-validation, verify-findings-synth, verify-fix-round |
| 9   | Empty-file preflight check             | Inline in autopilot's preflight hook (autopilot-specific, ~3 lines)                                                         |
| 10  | `parseJsonReport` byte-for-byte parity | Not required — fix or delete tests as needed                                                                                |

## Architecture

```
pi/agent/extensions/autopilot/
├── index.ts                  ← thin: registerWorkflow(...) call only
├── prompts/                  ← unchanged (7 .md files)
├── lib/
│   ├── schemas.ts            ← unchanged (TypeBox schemas)
│   ├── widget-body.ts        ← NEW: renders the task-window body
│   ├── widget-tasks.ts       ← extracted from old status-widget.ts (taskWindow + renderTaskLine)
│   └── report.ts             ← simplified: composes workflow-core helpers
├── phases/
│   ├── plan.ts               ← uses ctx.subagent.dispatch
│   ├── implement.ts          ← uses ctx.subagent.dispatch
│   ├── validate.ts           ← uses ctx.subagent.dispatch
│   ├── review.ts             ← uses ctx.subagent.parallel
│   └── verify.ts             ← unchanged orchestration, new dispatch type
└── *.test.ts                 ← updated to the new ctx-injection shape
```

**Deleted entirely:**

- `lib/dispatch.ts` + tests — replaced by `ctx.subagent.dispatch`
- `lib/parse.ts` + tests — workflow-core uses its own `parseJsonReport` internally
- `lib/status-widget.ts` + tests — replaced by `ctx.widget` + the small body composer
- `preflight.ts` — replaced by workflow-core's `requireFile` / `requireCleanTree` / `captureHead` (empty-file check inlined)
- ~80% of `index.ts` — `registerWorkflow` owns the lock, abort plumbing, command registration, report emission, run-log lifecycle

Net diff: roughly **-700 LOC, +250 LOC, net ~-450**.

## Component design

### Command lifecycle (`index.ts`)

```ts
import { registerWorkflow } from "../workflow-core/api.ts";
import {
  requireFile,
  requireCleanTree,
  captureHead,
} from "../workflow-core/preflight.ts";
import { setupAutopilotWidget } from "./lib/widget-body.ts";
import { formatAutopilotReport } from "./lib/report.ts";
import { runPlan } from "./phases/plan.ts";
import { runImplement } from "./phases/implement.ts";
import { runVerify } from "./phases/verify.ts";
import { taskList } from "../task-list/api.ts";
import { basename } from "node:path";
import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";

export default function (pi) {
  registerWorkflow(pi, {
    name: "autopilot",
    description:
      "Run the autonomous plan → implement → verify pipeline on a design document.",
    parseArgs: (raw) => {
      const path = raw.trim();
      if (!path) return { ok: false, error: "requires a design file path" };
      return { ok: true, args: { designPath: path } };
    },
    preflight: async (cwd, args) => {
      const f = await requireFile(args.designPath);
      if (!f.ok) return f;
      const text = await readFile(args.designPath, "utf8");
      if (text.trim().length === 0)
        return { ok: false, error: "design file is empty" };
      const c = await requireCleanTree(cwd);
      if (!c.ok) return c;
      const baseSha = await captureHead(cwd);
      return { ok: true, data: { baseSha } };
    },
    runSlug: (args) => basename(args.designPath, ".md"),
    run: runAutopilot,
  });
}
```

`registerWorkflow` owns:

- `/autopilot-start` and `/autopilot-cancel` registration.
- Single-active-run lock.
- `AbortController` plumbed into every subagent dispatch.
- Per-run log directory creation under `~/.pi/workflow-runs/autopilot/<timestamp>-<slug>/`.
- "Always emit a report" guarantee (workflow returns `string[]`; framework sends the message and mirrors to disk).

### `run()` composition

```ts
async function runAutopilot(ctx): Promise<string[]> {
  const { designPath } = ctx.args;
  const { baseSha } = ctx.preflight;
  const widget = setupAutopilotWidget(ctx.widget);

  // Copy the design doc into the run dir so the run is self-contained.
  await copyFile(designPath, join(ctx.workflowDir, "design.md"));

  // Per-task SHA capture (autopilot-specific; lives here, not in workflow-core).
  const commitShas: Record<number, string> = {};
  const captured = new Set<number>();
  const unsub = taskList.subscribe(async (s) => {
    for (const t of s.tasks) {
      if (t.status === "completed" && !captured.has(t.id)) {
        captured.add(t.id);
        commitShas[t.id] = await getHead(ctx.cwd);
      }
    }
  });

  try {
    // --- Plan ---
    widget.setStage("plan");
    const plan = await runPlan({ designPath, subagent: ctx.subagent });
    if (!plan.ok)
      return formatAutopilotReport({
        designPath,
        baseSha,
        cwd: ctx.cwd,
        tasks: [],
        commitShas: {},
        verify: null,
        error: `plan failed: ${plan.error}`,
        cancelled: ctx.signal.aborted
          ? { elapsedMs: ctx.widget.elapsedMs() }
          : undefined,
      });

    taskList.clear();
    taskList.create(plan.data.tasks);
    ctx.log("plan-tasks", {
      count: plan.data.tasks.length,
      titles: plan.data.tasks.map((t) => t.title),
    });

    // --- Implement ---
    widget.setStage("implement");
    const impl = await runImplement({
      archNotes: plan.data.architecture_notes,
      subagent: ctx.subagent,
      getHead: () => getHead(ctx.cwd),
      log: ctx.log,
    });
    if (!impl.ok || ctx.signal.aborted)
      return formatAutopilotReport({
        designPath,
        baseSha,
        cwd: ctx.cwd,
        tasks: taskList.all(),
        commitShas,
        verify: null,
        cancelled: ctx.signal.aborted
          ? { elapsedMs: ctx.widget.elapsedMs() }
          : undefined,
      });

    // --- Verify ---
    widget.setStage("verify");
    const verify = await runVerify({
      subagent: ctx.subagent,
      getDiff: () => diffSince(ctx.cwd, baseSha),
      archNotes: plan.data.architecture_notes,
      taskListSummary: summarize(taskList.all()),
      log: ctx.log,
    });

    return formatAutopilotReport({
      designPath,
      baseSha,
      cwd: ctx.cwd,
      tasks: taskList.all(),
      commitShas,
      verify,
      cancelled: ctx.signal.aborted
        ? { elapsedMs: ctx.widget.elapsedMs() }
        : undefined,
    });
  } finally {
    unsub();
    widget.dispose();
  }
}
```

Notable simplifications vs. today's index.ts:

- No `activeRun` flag, no `try/finally { activeRun = null }` — workflow-core owns the lock.
- No detached-pipeline-vs-await fork — workflow-core handles interactive vs. headless.
- No manual `pi.sendMessage({ customType: "autopilot-report" })` — `run()` returns `string[]`.
- No four explicit `if (isCancelled())` checks per phase — cancellation falls through, `formatAutopilotReport` adds the banner from `ctx.signal.aborted`.

### Subagent dispatch (per phase)

Today every phase calls `dispatchWithOneRetry` + `parseJsonReport` separately. workflow-core's `subagent.dispatch` combines both into one schema-validated call.

**Before** (current `phases/plan.ts`):

```ts
const r = await dispatchWithOneRetry(
  args.dispatch,
  {
    prompt,
    tools: ["read", "ls", "find", "grep"],
    cwd: args.cwd,
    intent: "Plan",
  },
  args.signal,
);
if (!r.ok) return { ok: false, error: r.error ?? "dispatch failed" };
return parseJsonReport(r.stdout, PlanReportSchema);
```

**After**:

```ts
const r = await ctx.subagent.dispatch({
  intent: "Plan",
  prompt,
  schema: PlanReportSchema,
  schemaName: "PlanReport",
  tools: ["read", "ls", "find", "grep"],
});
if (!r.ok) return { ok: false, error: r.error };
return { ok: true, data: r.data };
```

Free wins:

- Tagged failure modes (`dispatch | parse | schema | timeout | aborted`) — verify can distinguish "dispatch crashed, retry candidate" from "subagent returned bad JSON, don't retry."
- Default retry policy `one-retry-on-dispatch` — the same behavior as `dispatchWithOneRetry`. Reviewers, validation, and fixers opt out with `retry: "none"` (matching today, which uses plain `dispatch` not `dispatchWithOneRetry`).
- Run-level abort signal threaded automatically.
- Every dispatch logged to `events.jsonl` with intent, schema name, tools, prompt, retry policy, model, thinking — free per-run forensics.
- `cwd` resolved once in `createSubagent` from the workflow context; phases don't pass it per-call.
- Reviewers' fan-out becomes one `ctx.subagent.parallel([...specs])` call.

### Status widget

workflow-core's `Widget` provides `setTitle / setBody / setFooter` (function-form re-eval on tick + subagent events), live `widget.subagents`, `widget.elapsedMs()`, `widget.theme`, and lifecycle → log wiring. autopilot owns the _content_ — specifically the task-window logic.

```ts
// lib/widget-body.ts
import type { Widget } from "../../workflow-core/api.ts";
import {
  renderClock,
  renderStageBreadcrumb,
  renderSubagents,
} from "../../workflow-core/render.ts";
import { taskList } from "../../task-list/api.ts";
import { renderTaskWindowLines } from "./widget-tasks.ts";

const STAGES = ["plan", "implement", "verify"] as const;
type Stage = (typeof STAGES)[number];

export function setupAutopilotWidget(widget: Widget) {
  let stage: Stage | null = null;

  widget.setTitle(
    () =>
      `autopilot · ${renderStageBreadcrumb({ stages: STAGES, active: stage, theme: widget.theme })} · ${renderClock(widget.elapsedMs())}`,
  );
  widget.setBody(() => [
    ...renderSubagents(widget.subagents, { theme: widget.theme }),
    ...renderTaskWindowLines(taskList.all(), widget.theme),
  ]);
  widget.setFooter("type /autopilot-cancel to stop");

  // Re-render on taskList mutations (workflow-core only re-evals on tick + subagent events).
  const unsub = taskList.subscribe(() => widget.invalidate());
  return {
    setStage(s: Stage | null) {
      stage = s;
      widget.invalidate();
    },
    dispose: unsub,
  };
}
```

`widget.invalidate()` is a small new addition to workflow-core's `Widget` API — three lines + one test in `workflow-core/lib/widget.ts`. Generic and reusable for any future workflow that drives content from an external store.

### Report

workflow-core helpers cover the boilerplate; autopilot keeps the bespoke Tasks and Verify sections.

**Workflow-core covers:** `formatHeader("Autopilot Report")`, `formatGitInfoBlock`, `formatCancelledBanner`, `formatLabelValueRow`. `formatKnownIssues` _almost_ fits but autopilot mixes string and Finding entries with severity grouping — keep autopilot's bespoke version.

**autopilot keeps:** Tasks block (per-task glyph `✔ ✗ ◻`, aligned commit SHA, indented failure-reason line) and Verify block (Automated checks `✔ tests  ✔ lint  ✔ typecheck`, Reviewers with optional `(skipped)`, Fixed count, Known issues breakdown by severity).

```ts
export function formatAutopilotReport(input: ReportInput): string[] {
  const lines: string[] = [];
  lines.push(formatHeader("Autopilot Report"));
  if (input.cancelled)
    lines.push(...formatCancelledBanner(input.cancelled.elapsedMs));
  lines.push("");
  lines.push(formatLabelValueRow("Design", input.designPath));
  lines.push(
    ...formatGitInfoBlock({
      branch: input.branchName,
      commitsAhead: input.commitsAhead,
      baseBranch: "main",
    }),
  );
  lines.push("");
  lines.push(...formatTasksSection(input.tasks, input.commitShas)); // autopilot-specific
  lines.push("");
  lines.push(...formatVerifySection(input.verify, input.cancelled)); // autopilot-specific
  return lines;
}
```

Workflow-core appends `Log:     <run-dir>` at the bottom unless `emitLogPath: false`. Left on — points the user at events.jsonl + sidecar prompts/outputs without any code in autopilot.

### Per-run observability

Free from workflow-core, written to `~/.pi/workflow-runs/autopilot/<timestamp>-<slug>/`:

```
2026-04-25T14-32-08-rate-limiter/
├── run.json              ← args, preflight, outcome, elapsedMs, subagent count + retries
├── events.jsonl          ← every workflow + subagent lifecycle event
├── prompts/              ← one file per subagent: full prompt sent
├── outputs/              ← one file per subagent: raw stdout
├── workflow/             ← autopilot-owned scratch
│   └── design.md         ← copy of the input design doc
└── final-report.txt      ← the report we emitted, mirrored to disk
```

Five `ctx.log(type, payload)` calls in `run()` add autopilot-named events to events.jsonl:

- `plan-tasks` — count + titles after plan parses
- `implement-task-start` / `implement-task-end` — per task (id, title, durationMs, commit sha)
- `verify-validation` — test/lint/typecheck status
- `verify-findings-synth` — auto + knownIssues counts
- `verify-fix-round` — round number, fixed descriptions

## Tests

Mostly mechanical port. Phase tests inject a fake `Subagent` (workflow-core type) instead of a fake `DispatchFn`; fixtures return `{ ok, data: <typed-object>, raw: '...' }` directly instead of `{ ok, stdout: '<json>' }`.

**Deleted:** `lib/dispatch.test.ts`, `lib/parse.test.ts`, most of `lib/status-widget.test.ts` (only a small `widget-body.test.ts` survives, ~40 LOC), `preflight.test.ts` (one new test for the inline empty-file check).

**New:** `index.test.ts` smoke test (~80 LOC) that calls `registerWorkflow` with fake `pi`, fake `spawn`, fake `logBaseDir`, and a happy-path mock driving plan → implement → verify to completion. workflow-core's `RegisterWorkflowOpts` already exposes `spawn` and `logBaseDir` injection points for exactly this.

`parseJsonReport` parity is not required — autopilot tests that assert on specific malformed-JSON strip behavior get fixed or deleted as needed; that test surface belongs to workflow-core now.

## Implementation sequence

Single PR, four commits.

1. **`workflow-core: add widget.invalidate()`** — three lines + one test in `workflow-core/lib/widget.ts`.
2. **`autopilot: migrate phases to ctx.subagent`** — convert all five phase files from `dispatchWithOneRetry` + `parseJsonReport` to `ctx.subagent.dispatch({ schema, ... })`. Convert preflight to workflow-core helpers + inline empty-file check. Update phase tests. **Don't touch `index.ts` yet.** Phases keep their public shape; the orchestrator still drives them. `make typecheck && make test` should pass.
3. **`autopilot: migrate orchestrator to registerWorkflow`** — rewrite `index.ts`. Add `lib/widget-body.ts` and `lib/widget-tasks.ts`. Add `runSlug`, `workflowDir/design.md` copy, five `ctx.log` calls. Slim `lib/report.ts` to compose workflow-core helpers. Delete `lib/dispatch.ts`, `lib/parse.ts`, `lib/status-widget.ts`, `preflight.ts` (and their tests). Add `index.test.ts` smoke test. This is the commit where `/autopilot` becomes `/autopilot-start`.
4. **`autopilot: README + cleanup`** — update README (command surface, `Log:` line, run-log dir). Add an `## Architecture` section pointing at workflow-core's INTEGRATION.md.

**Validation gate:** run `/autopilot-start` on a real design doc end-to-end. Confirm the report renders, the run-log dir gets populated, cancellation works mid-run.

## Risks & mitigations

- **Behavioral regression in dispatch.** workflow-core's `subagent.dispatch` retry policy must match `dispatchWithOneRetry` exactly (one retry, only on dispatch transport failure, never on parse/abort/already-aborted). Already reviewed — matches. Smoke-test in commit 3.
- **Status widget refresh latency.** Without `widget.invalidate()`, task-list mutations would be invisible until the 1s tick or the next subagent event. Resolved by the workflow-core extension in commit 1.
- **Empty-file check loss.** Mitigated by inlining the 3-line check in autopilot's preflight hook.
- **Run-log disk growth.** Per-run dirs accumulate. workflow-core's `retainRuns` field exists for this; default is unbounded. Out of scope for this PR — set later if it becomes a problem.

## What this unblocks

The SOTA additions in `.designs/2026-04-24-autopilot-sota-research.md` become substantially easier to land once the migration is done:

- Per-phase `reasoning_effort` is one field on the `DispatchSpec`.
- Cross-family verification is per-subagent `model` selection on the same spec.
- AC-extraction phase is one new file in `phases/` + one new prompt; the orchestrator stays untouched.
- The `workflowDir` is a natural home for `ac.json`, `PR_BODY.md`, `localization.json`, future plan-repair artifacts.

That's the strategic case for landing this even though it's "just a migration."
