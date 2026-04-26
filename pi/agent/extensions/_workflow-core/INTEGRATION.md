# Building workflows on workflow-core

> Reference for extension authors building a new workflow on top of `workflow-core`. Organized by API user's perspective.

## Walkthrough: a minimal workflow end-to-end

Walk a new author through building a small workflow step-by-step. For a real-world worked example of a full three-phase pipeline (plan → implement → verify), see `../autopilot/` — it is the first extension to migrate onto `workflow-core` and demonstrates all the major primitives in production use.

## API reference

### Subagent

Typed dispatch with retries. See [`api.ts`](./api.ts) for the full type signatures.

`ctx.subagent.dispatch(spec)` — single dispatch. Returns a tagged `DispatchResult`. Failure modes: `dispatch | parse | schema | timeout | aborted`. Default retry policy is `one-retry-on-dispatch`; opt out with `retry: "none"`.

`ctx.subagent.parallel(specs, opts?)` — fan-out with optional concurrency limit.

### Run

`registerWorkflow(pi, def)` registers `/<name>-start` and `/<name>-cancel`. The `run(ctx)` function returns `Promise<string[] | null>` — those lines become the final report.

### Widget

`ctx.widget.setTitle / setBody / setFooter` accept `string | () => string` (or `string[]`). Function form is re-evaluated on tick + on subagent events. Live data: `widget.subagents`, `widget.elapsedMs()`, `widget.theme`.

`widget.invalidate()` triggers a single immediate re-render outside the normal tick cadence. Use it when your workflow's underlying state mutates (e.g. a task list changes) and you want the widget to reflect the new state right away rather than waiting for the next tick. It calls the same internal `render()` path as `setTitle`/`setBody`/`setFooter`, so function-form setters are re-evaluated exactly once.

### Report

The framework appends `Log: <path>` after the workflow's lines (opt-out via `emitLogPath: false`). Workflow owns its banners on cancel/failure — use `formatCancelledBanner` / `formatFailureBanner` from `report.ts`.

### Logging

`ctx.log(type, payload)` writes a workflow-named-prefixed event (`<workflow>.<type>`) to events.jsonl. Calls after `run()` returns are silently dropped.

`ctx.workflowDir` points at `<run-dir>/workflow/` — write any workflow-owned files there.

## Helpers

### render.ts

- `renderClock(elapsedMs)` — `MM:SS` (or `HH:MM:SS` past an hour).
- `renderStageBreadcrumb({stages, active, theme?})` — `plan › implement › verify`-style header.
- `renderCounter({label, current, total?, theme?})` — `iter 7/50` or `iter 7`.
- `renderSubagents(slots, opts?)` — `↳ <intent> (MM:SS)` lines for each running slot.

### report.ts

- `formatHeader(title)` — boxed title.
- `formatLabelValueRow(label, value, opts?)` — padded `Label:   value` row.
- `formatGitInfoBlock({branch, commitsAhead, baseBranch?})` — `Branch:   <branch>  (N commits ahead of <base>)`.
- `formatSection(title, indentedLines)` — titled, indented section.
- `formatKnownIssues(issues)` — `Known issues:` section (empty input → empty array).
- `formatCancelledBanner(elapsedMs)` / `formatFailureBanner(reason)`.

### preflight.ts

- `requireFile(path)` / `requireCleanTree(cwd)` / `captureHead(cwd)`.

## Common patterns

### Sequential subagent dispatches with halt-on-failure

```ts
for (const item of items) {
  const r = await ctx.subagent.dispatch(/* ... */);
  if (!r.ok) return [`Failed at ${item.name}: ${r.error}`];
}
```

### Parallel reviewers

```ts
const results = await ctx.subagent.parallel([
  reviewer1Spec,
  reviewer2Spec,
  reviewer3Spec,
]);
const ok = results.filter((r) => r.ok);
```

### Capped fix loop

```ts
let rounds = 0;
while (rounds < 2 && !ctx.signal.aborted) {
  const check = await ctx.subagent.dispatch(checkSpec);
  if (!check.ok || isPassing(check.data)) break;
  const fix = await ctx.subagent.dispatch(fixSpec(check.data));
  if (!fix.ok) break;
  rounds++;
}
```

(_v1 ships no pattern helpers — these inline loops are intentional. See design §6._)

## Gotchas

- **The detach pattern.** `registerWorkflow` returns immediately from the slash-command handler so `/<name>-cancel` can fire. If you write your own runner, remember not to `await` your pipeline inside the handler.
- **Function-form widget setters.** `setBody(() => ...)` is re-evaluated on every tick and every subagent event. Don't put expensive work in there — keep it pure rendering of state.
- **`ctx.log` workflow-name auto-prefix.** `ctx.log("foo", ...)` writes `<workflow>.foo` in events.jsonl. Don't include the workflow name yourself.
- **Framework owns the run-dir top level.** Write your own files only inside `ctx.workflowDir`. Never write to events.jsonl, run.json, prompts/, outputs/.
- **Tagged results, not throws.** `subagent.dispatch` never throws on subagent failure. Always check `r.ok`.

## Testing your workflow

The framework's `RegisterWorkflowOpts` accepts `spawn` and `logBaseDir` injection points for tests. Inject a fake spawner that returns canned JSON for each subagent dispatch and point `logBaseDir` at a temp directory. For a worked example, see `../autopilot/index.test.ts`, which drives the full plan → implement → verify pipeline using fake spawn and asserts that the run-log directory is populated and the final report contains the expected sections.
