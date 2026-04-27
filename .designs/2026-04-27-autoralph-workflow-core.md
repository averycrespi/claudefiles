# autoralph → workflow-core migration

Refactor `pi/agent/extensions/autoralph` to build on `_workflow-core/`, mirroring the migration already done for `autopilot`. Drops ~700 lines of vendored infra (dispatch, parse, preflight, hand-rolled status widget, manual abort/timeout plumbing) in favor of workflow-core primitives.

## Goals

- Replace hand-rolled command registration, single-active-run lock, abort plumbing, and "always emit a report" guarantee with `registerWorkflow`.
- Replace `lib/dispatch.ts` + `lib/parse.ts` with `ctx.subagent.dispatch` (typed, schema-validated, retry-on-transport-failure built in).
- Replace `lib/status-widget.ts` (with its own `setInterval` tick + live-subagent map) with `ctx.widget` and the shared `renderSubagents` / `renderClock` helpers.
- Replace `preflight.ts` with `requireFile` + `requireCleanTree` + `captureHead` from `_workflow-core/preflight.ts`.
- Move per-run state files (task file, handoff blob, history) from project-local `.autoralph/` into `ctx.workflowDir` (`~/.pi/workflow-runs/autoralph/<run-id>/workflow/`).

## Non-goals

- No change to the iteration prompt template (paths inside it are updated to point at `ctx.workflowDir`, but the prompt logic, reflection block, and JSON contract are unchanged).
- No change to outcome semantics (`complete` / `max-iterations` / `failed` / `stuck` / `cancelled`) or the three-consecutive-timeouts → stuck rule.
- No integration with the `task-list` extension API. Autoralph stays iteration-driven; the iteration history continues to render in autoralph's own widget body.
- No automatic resume across runs (same as today).

## Public-surface changes

- `/autoralph <design.md>` → **`/autoralph-start <design.md>`** (workflow-core hardcodes `<name>-start` / `<name>-cancel`).
- `/autoralph-cancel` — unchanged.
- `.autoralph/<basename>.{md,handoff.json,history.json}` → run-scoped files under `~/.pi/workflow-runs/autoralph/<run-id>/workflow/`.
- Final report no longer prints `Log:` itself; workflow-core appends `Log: <run-dir>` automatically.

## File layout (post-migration)

```
pi/agent/extensions/autoralph/
  README.md                 # rewritten: workflow-core foundation, /autoralph-start, run-log location
  index.ts                  # ~50 lines: registerWorkflow(...) only
  index.test.ts             # NEW — mirrors autopilot/index.test.ts (fake spawn end-to-end)
  lib/
    args.ts                 # parseArgs returns { ok, args } | { ok: false, error }
    args.test.ts
    schemas.ts              # IterationReportSchema (TypeBox) — unchanged
    state.ts                # NEW — consolidates handoff.ts + history.ts; drops isBootstrap
    state.test.ts
    widget-body.ts          # NEW — setupAutoralphWidget(ctx.widget); mirrors autopilot
    widget-body.test.ts
    report.ts               # formatAutoralphReport returns string[]; uses _workflow-core helpers
    report.test.ts
  phases/
    iterate.ts              # accepts Subagent; timeoutMs drives abort
    iterate.test.ts
  prompts/
    iterate.md              # paths reference ctx.workflowDir
    reflection-block.md
```

**Deleted:** `preflight.ts`, `preflight.test.ts`, `lib/dispatch.ts`, `lib/dispatch.test.ts`, `lib/parse.ts`, `lib/parse.test.ts`, `lib/status-widget.ts`, `lib/status-widget.test.ts`, `lib/handoff.ts`, `lib/handoff.test.ts`, `lib/history.ts`, `lib/history.test.ts`.

## `index.ts` shape

```ts
export default function (
  pi: ExtensionAPI,
  testOpts: RegisterWorkflowOpts = {},
) {
  registerWorkflow(
    pi,
    {
      name: "autoralph",
      description:
        "Run the autonomous Ralph-style iteration loop on a design document.",
      parseArgs: (raw) => {
        const r = parseArgs(raw);
        if ("error" in r) return { ok: false, error: r.error };
        return { ok: true, args: r };
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
      runSlug: (args) => basename(args.designPath, extname(args.designPath)),
      run: async (ctx) => {
        /* see `run` body below */
      },
    },
    testOpts,
  );
}
```

## `run` body (the iteration loop)

```ts
run: async (ctx) => {
  const { designPath, reflectEvery, maxIterations, timeoutMins } = ctx.args;
  const { baseSha } = ctx.preflight;
  const widget = setupAutoralphWidget(ctx.widget);

  const slug = basename(designPath, extname(designPath));
  const taskFilePath = join(ctx.workflowDir, `${slug}.md`);
  const handoffPath = join(ctx.workflowDir, `${slug}.handoff.json`);
  const historyPath = join(ctx.workflowDir, `${slug}.history.json`);

  let outcome: FinalOutcome = "max-iterations";
  let consecutiveTimeouts = 0;
  let finalHandoff: string | null = null;

  try {
    for (let i = 1; i <= maxIterations; i++) {
      if (ctx.signal.aborted) {
        outcome = "cancelled";
        break;
      }
      widget.setIteration(i, maxIterations);

      const priorHandoff = i === 1 ? null : await readHandoff(handoffPath);
      const isReflection =
        reflectEvery > 0 && i > 1 && (i - 1) % reflectEvery === 0;

      const result = await runIteration({
        iteration: i,
        maxIterations,
        designPath,
        taskFilePath,
        priorHandoff,
        isReflection,
        timeoutMs: timeoutMins * 60_000,
        cwd: ctx.cwd,
        subagent: ctx.subagent,
        getHead: () => getHead(ctx.cwd),
        log: ctx.log,
      });

      const record = { iteration: i, ...result, reflection: isReflection };
      await appendHistory(historyPath, record);
      widget.setHistory(await readHistory(historyPath));
      if (result.handoff !== null) {
        await writeHandoff(handoffPath, result.handoff);
        finalHandoff = result.handoff;
      }

      if (result.outcome === "timeout") {
        consecutiveTimeouts++;
        if (consecutiveTimeouts >= 3) {
          outcome = "stuck";
          break;
        }
        continue;
      }
      consecutiveTimeouts = 0;

      if (ctx.signal.aborted) {
        outcome = "cancelled";
        break;
      }
      if (result.outcome === "complete") {
        outcome = "complete";
        break;
      }
      if (result.outcome === "failed") {
        outcome = "failed";
        break;
      }
      // in_progress, parse_error, dispatch_error → continue loop
    }

    const history = await readHistory(historyPath);
    const [branchName, commitsAhead] = await Promise.all([
      resolveBranch(ctx.cwd),
      resolveCommitsAhead(ctx.cwd, baseSha),
    ]);
    return formatAutoralphReport({
      designPath,
      branchName,
      commitsAhead,
      taskFilePath,
      finalHandoff,
      totalElapsedMs: Date.now() - ctx.startedAt,
      outcome,
      history,
    });
  } finally {
    widget.dispose();
  }
};
```

**What gets cleaner vs today:**

- Hand-rolled `setTimeout(controller.abort, timeoutMs)` and parent-signal linking go away. `runIteration` just sets `timeoutMs` on the dispatch spec; workflow-core handles abort linkage and tags failed dispatches with `reason: "timeout"`.
- `dispatchResult.aborted` differentiation is replaced by the tagged `reason` field on `DispatchResult`.
- Retry-on-transport-failure is automatic via `retry: "one-retry-on-dispatch"` (the default).
- The three-consecutive-timeouts → stuck rule stays in the loop body — it's autoralph-specific.

## `phases/iterate.ts` (slimmed)

```ts
export interface RunIterationArgs {
  iteration: number;
  maxIterations: number;
  designPath: string;
  taskFilePath: string;
  priorHandoff: string | null;
  isReflection: boolean;
  timeoutMs: number;
  cwd: string;
  subagent: Subagent; // ← replaces DispatchFn + signal
  getHead: () => Promise<string>;
  log?: (type: string, payload?: Record<string, unknown>) => void;
}

export async function runIteration(
  args: RunIterationArgs,
): Promise<IterationOutcomeRecord> {
  const prompt = renderPrompt(args); // template substitution unchanged
  const headBefore = await args.getHead();
  const startedAt = Date.now();

  const r = await args.subagent.dispatch({
    intent: `Iteration ${args.iteration}${args.isReflection ? " (reflection)" : ""}`,
    prompt,
    schema: IterationReportSchema,
    tools: ["read", "write", "edit", "bash"],
    extensions: ["format"],
    timeoutMs: args.timeoutMs,
  });

  const durationMs = Date.now() - startedAt;
  const headAfter = await args.getHead();

  if (!r.ok) {
    if (r.reason === "timeout") {
      return {
        outcome: "timeout",
        summary: `iteration timed out after ${Math.round(durationMs / 1000)}s`,
        handoff: null,
        headBefore,
        headAfter,
        durationMs,
      };
    }
    if (r.reason === "parse" || r.reason === "schema") {
      return {
        outcome: "parse_error",
        summary: `invalid report: ${r.error}`,
        handoff: null,
        headBefore,
        headAfter,
        durationMs,
      };
    }
    return {
      outcome: "dispatch_error",
      summary: `dispatch failed: ${r.error}`,
      handoff: null,
      headBefore,
      headAfter,
      durationMs,
    };
  }

  return {
    outcome: r.data.outcome,
    summary: r.data.summary,
    handoff: r.data.handoff,
    headBefore,
    headAfter,
    durationMs,
  };
}
```

## Widget (`lib/widget-body.ts`)

Mirrors `autopilot/lib/widget-body.ts` with autoralph-specific state (iteration counter + history records). The history block — counter line + last-2 iteration rows with reflection 🪞 / commit SHA glyphs — is lifted verbatim from today's `status-widget.ts`. Live subagent rendering is delegated to `renderSubagents` from `_workflow-core/render.ts`, so the hand-rolled `live: Map<number, LiveSubagent>` and `setInterval` tick disappear — workflow-core owns both.

```ts
export function setupAutoralphWidget(widget: Widget): {
  setIteration(i: number, max: number): void;
  setHistory(h: IterationRecord[]): void;
  dispose(): void;
} {
  let iter = 0,
    max = 0;
  let history: IterationRecord[] = [];

  widget.setTitle(
    () =>
      `${widget.theme?.bold("autoralph") ?? "autoralph"} · iter ${iter}/${max} · ${renderClock(widget.elapsedMs())}`,
  );
  widget.setBody(() => [
    ...renderSubagents(widget.subagents, { theme: widget.theme }),
    ...renderHistoryBlock(history, widget.theme),
  ]);
  widget.setFooter("type /autoralph-cancel to stop");

  return {
    setIteration(i, m) {
      iter = i;
      max = m;
      widget.invalidate();
    },
    setHistory(h) {
      history = h;
      widget.invalidate();
    },
    dispose() {},
  };
}
```

## State (`lib/state.ts`)

Consolidates `handoff.ts` + `history.ts` (~40 LOC total) — both deal with the same per-run dir.

```ts
export async function readHandoff(p: string): Promise<string | null>;
export async function writeHandoff(p: string, h: string): Promise<void>;
export async function readHistory(p: string): Promise<IterationRecord[]>;
export async function appendHistory(
  p: string,
  r: IterationRecord,
): Promise<void>;
```

`isBootstrap(path)` is dropped — bootstrap is now `iteration === 1`, which avoids a stat call.

## Report (`lib/report.ts`)

`formatAutoralphReport` now returns `string[]` (was: `string`) to match `WorkflowDefinition.run`'s return type. Use existing helpers from `_workflow-core/report.ts`:

- `formatHeader("Autoralph Report")` — boxed banner
- `formatLabelValueRow("Design", designPath)` — label rows
- `formatGitInfoBlock({ branch, commitsAhead })` — branch line
- `formatCancelledBanner(elapsedMs)` — cancelled outcome

Iteration-list formatting stays inline (autoralph-specific glyph logic for ✔/✗/⏱/🪞 has no autopilot analog). The `Log:` line is dropped from autoralph's output — workflow-core appends it.

## Tests

| File                      | Notes                                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.test.ts`           | NEW — mirrors `autopilot/index.test.ts`. Drives `/autoralph-start` end-to-end with fake `spawn` returning canned iteration JSON; asserts run-log dir is populated and final report contains expected outcome line + history rows.                                             |
| `lib/args.test.ts`        | Trivially updated for new return shape.                                                                                                                                                                                                                                       |
| `lib/state.test.ts`       | Merge of `handoff.test.ts` + `history.test.ts`. Same coverage.                                                                                                                                                                                                                |
| `lib/widget-body.test.ts` | Tests against a fake `Widget`. Header shape, history block rendering, reflection 🪞 glyph.                                                                                                                                                                                    |
| `lib/report.test.ts`      | Updated for `string[]` return. Outcome variants, reflection glyph, no-commit suffix.                                                                                                                                                                                          |
| `phases/iterate.test.ts`  | Slimmer. Tests prompt template substitution + result mapping (timeout → `outcome: "timeout"`, dispatch failure → `dispatch_error`, parse failure → `parse_error`). Uses an in-memory `Subagent` stub. No more fake-timer abort tests — that's workflow-core's responsibility. |

**Deleted tests:** `preflight.test.ts`, `lib/dispatch.test.ts`, `lib/parse.test.ts`, `lib/status-widget.test.ts`, `lib/handoff.test.ts`, `lib/history.test.ts`.

## Migration sequence

Each step ends with `make typecheck && make test` green.

1. **Add `state.ts`** — consolidate `handoff.ts` + `history.ts`; drop `isBootstrap`. Old files stay temporarily.
2. **Refactor `report.ts`** — return `string[]`; use workflow-core helpers. Update `report.test.ts`. Old `index.ts` joins the array back to a string for `pi.sendMessage`.
3. **Add `lib/widget-body.ts`** — workflow-core-shaped widget; lift `renderHistoryBlock` from `status-widget.ts`. Old `status-widget.ts` stays unused.
4. **Refactor `phases/iterate.ts`** — accept `subagent: Subagent`; let `timeoutMs` drive the abort. Tests rewritten against `Subagent` stub.
5. **Replace `index.ts`** — `registerWorkflow`. Wire preflight via `requireFile` + `requireCleanTree` + `captureHead`. Add `index.test.ts`.
6. **Delete dead code** — `preflight.ts`, `lib/dispatch.ts`, `lib/parse.ts`, `lib/status-widget.ts`, `lib/handoff.ts`, `lib/history.ts` and their tests. Update `README.md`.
7. **Final verification** — `make typecheck && make test`.

## Risks

- **Step 4 — timeout semantics drift.** Workflow-core tags timeouts as `reason: "timeout"` distinctly from `reason: "aborted"` (parent cancel). The iteration-test rewrite must verify: `timeoutMs` exceeded → `outcome: "timeout"` even when the run-level signal isn't aborted; run-level abort during dispatch → outcome reflects the dispatch's reported reason, and the loop's outer abort check exits next iteration.
- **Step 5 — end-to-end harness.** Copy `autopilot/index.test.ts` structure verbatim to start, then add autoralph-specific assertions (multiple iteration rounds, reflection cadence, three-timeout stuck path).

## Backwards compatibility

- `/autoralph` (no suffix) ceases to exist. Users invoke `/autoralph-start <design>` instead. README gets a v2 migration note explaining the rename.
- Existing `.autoralph/` directories from prior runs become inert. Users can delete them. No migration logic — the old layout was for inspection only ("no automatic resume in v1") so there's nothing to preserve.
