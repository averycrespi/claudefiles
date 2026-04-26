# Autopilot on workflow-core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Migrate the `autopilot` Pi extension onto the new `workflow-core` shared library without changing pipeline behavior, prompts, or report shape.

**Architecture:** Replace autopilot's bespoke dispatch wrapper, parse helper, status widget, single-active-run lock, abort plumbing, and report emission with the equivalent primitives from `workflow-core` (`registerWorkflow`, `ctx.subagent`, `ctx.widget`, `ctx.log`, helpers in `render.ts` / `report.ts` / `preflight.ts`). The plan → implement → verify pipeline, the seven prompt files, the TypeBox schemas, and the autopilot-specific report sections (Tasks, Verify) stay; everything around them is collapsed.

**Tech Stack:** TypeScript on Node, `@sinclair/typebox` for schemas, `node:test` via `tsx` for tests, GNU Stow symlinks `pi/agent/extensions/` into `~/.pi/agent/extensions/` (no stow re-run needed).

**Reference:** Design doc at `.designs/2026-04-25-autopilot-on-workflow-core.md` (committed as `de3675a`).

---

### Task 1: Add `widget.invalidate()` to workflow-core

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/widget.ts`
- Modify: `pi/agent/extensions/workflow-core/lib/types.ts` (the `Widget` interface)
- Modify: `pi/agent/extensions/workflow-core/lib/widget.test.ts` (new test case)
- Modify: `pi/agent/extensions/workflow-core/INTEGRATION.md` (document the new method under the Widget API reference)

**Acceptance Criteria:**

- `Widget.invalidate(): void` is exported on the `Widget` type and triggers a single re-render (same code path as the tick).
- New test in `widget.test.ts` asserts that `invalidate()` re-evaluates a function-form `setBody` exactly once when called outside the tick.
- `make typecheck && make test` pass.

**Notes:** The implementation is one method that calls the existing internal `render()` function. The `Widget` interface is defined in `lib/widget.ts` itself (not `types.ts`) — confirm the file layout before editing. INTEGRATION.md's "Widget" section under "API reference" is the natural place to document the new method.

**Commit:** `feat(workflow-core): add widget.invalidate()`

---

### Task 2: Migrate autopilot phases to `ctx.subagent`

**Files:**

- Modify: `pi/agent/extensions/autopilot/phases/plan.ts`
- Modify: `pi/agent/extensions/autopilot/phases/implement.ts`
- Modify: `pi/agent/extensions/autopilot/phases/validate.ts`
- Modify: `pi/agent/extensions/autopilot/phases/review.ts`
- Modify: `pi/agent/extensions/autopilot/phases/verify.ts`
- Modify: `pi/agent/extensions/autopilot/phases/plan.test.ts`
- Modify: `pi/agent/extensions/autopilot/phases/implement.test.ts`
- Modify: `pi/agent/extensions/autopilot/phases/validate.test.ts`
- Modify: `pi/agent/extensions/autopilot/phases/review.test.ts`
- Modify: `pi/agent/extensions/autopilot/phases/verify.test.ts`
- Modify: `pi/agent/extensions/autopilot/index.ts` (bridge: construct a `Subagent` from `createSubagent` and pass it to phases instead of the local `dispatch` wrapper — temporary; deleted in Task 3)

**Acceptance Criteria:**

- Every phase function takes `subagent: Subagent` (from `workflow-core/api.ts`) instead of `dispatch: DispatchFn`, and uses `subagent.dispatch({ schema, ... })` / `subagent.parallel(...)` instead of `dispatchWithOneRetry` + `parseJsonReport`.
- Reviewers, validation, and fixers pass `retry: "none"` (matching today's behavior — those phases use plain `dispatch`, not `dispatchWithOneRetry`).
- `/autopilot <design.md>` still runs end-to-end against the existing `index.ts` bridge; `make typecheck && make test` pass.

**Notes:**

- Each phase changes shape similarly. `plan.ts` example: today returns `parseJsonReport(r.stdout, PlanReportSchema)`; new code passes `schema: PlanReportSchema` to `subagent.dispatch` and the result `r.data` is already typed `Static<typeof PlanReportSchema>` — return `{ ok: true, data: r.data }`.
- `subagent.dispatch`'s default `retry` policy is `"one-retry-on-dispatch"` — matches `dispatchWithOneRetry`. Only opt out (`retry: "none"`) where today's call uses plain `dispatch`.
- `cwd` is resolved once by `createSubagent`; phases drop the per-call `cwd` parameter.
- Test fixtures change: instead of returning `{ ok: true, stdout: '<json>' }`, return `{ ok: true, data: <typed-object>, raw: '<json>' }`. Failure fixtures use the tagged `reason: "dispatch" | "parse" | "schema" | "timeout" | "aborted"` field.
- Bridge in `index.ts` (transient): `const subagent = createSubagent({ cwd, signal: controller.signal })`; pass `subagent` instead of `dispatch` to `runPlan` / `runImplement` / `runVerify`. The local `dispatch.ts` and its `makeWrappedDispatch` helper are still used by the widget plumbing — leave them in place; they're deleted in Task 3.
- `lib/dispatch.ts`, `lib/parse.ts`, `lib/dispatch.test.ts`, `lib/parse.test.ts` are NOT deleted in this task — they're still referenced by the bridge. Task 3 deletes them.

**Commit:** `refactor(autopilot): migrate phases to workflow-core subagent`

---

### Task 3: Replace orchestrator with `registerWorkflow`

**Files:**

- Rewrite: `pi/agent/extensions/autopilot/index.ts`
- Create: `pi/agent/extensions/autopilot/lib/widget-body.ts`
- Create: `pi/agent/extensions/autopilot/lib/widget-tasks.ts` (extracted from `lib/status-widget.ts`: `taskWindow()` and `renderTaskLine()` plus a new `renderTaskWindowLines(tasks, theme)` helper that wraps both)
- Create: `pi/agent/extensions/autopilot/lib/widget-tasks.test.ts` (~40 LOC: cover `taskWindow` anchor selection and the `… N earlier` / `… N more` summary lines)
- Modify: `pi/agent/extensions/autopilot/lib/report.ts` (slim: compose workflow-core helpers; rename to `formatAutopilotReport`; return `string[]` instead of `string`)
- Modify: `pi/agent/extensions/autopilot/lib/report.test.ts` (assertions on the new return type)
- Create: `pi/agent/extensions/autopilot/index.test.ts` (smoke test, ~80 LOC, using `RegisterWorkflowOpts.spawn` + `logBaseDir` injection)
- Delete: `pi/agent/extensions/autopilot/lib/dispatch.ts`
- Delete: `pi/agent/extensions/autopilot/lib/dispatch.test.ts`
- Delete: `pi/agent/extensions/autopilot/lib/parse.ts`
- Delete: `pi/agent/extensions/autopilot/lib/parse.test.ts`
- Delete: `pi/agent/extensions/autopilot/lib/status-widget.ts`
- Delete: `pi/agent/extensions/autopilot/lib/status-widget.test.ts`
- Delete: `pi/agent/extensions/autopilot/preflight.ts`
- Delete: `pi/agent/extensions/autopilot/preflight.test.ts`

**Acceptance Criteria:**

- `/autopilot-start <design.md>` runs the full plan → implement → verify pipeline and emits the report (autopilot-shaped Tasks/Verify sections plus the framework-appended `Log: <run-dir>` line); `/autopilot-cancel` aborts mid-run with the cancelled banner.
- `~/.pi/workflow-runs/autopilot/<timestamp>-<design-basename>/` is populated with `run.json`, `events.jsonl`, `prompts/`, `outputs/`, `final-report.txt`, and `workflow/design.md` (a copy of the input design doc).
- `make typecheck && make test` pass; the new `index.test.ts` smoke test drives plan → implement → verify to completion using fake `spawn` + injected `logBaseDir`.

**Notes:**

- New `index.ts` follows the design doc's Section 5 sketch verbatim. `registerWorkflow` takes `name: "autopilot"`, the `parseArgs` shape, the `preflight` hook (using workflow-core's `requireFile` + `requireCleanTree` + `captureHead` plus an inline 3-line empty-file check — autopilot today rejects empty design docs), `runSlug: (args) => basename(args.designPath, ".md")`, and a `run` function.
- The five `ctx.log(type, payload)` calls in `run()`: `plan-tasks` (count + titles), `implement-task-start` and `implement-task-end` (id, title, durationMs, sha), `verify-validation` (test/lint/typecheck status), `verify-findings-synth` (auto + knownIssues counts), `verify-fix-round` (round number, fixed[]). Pass `ctx.log` down to `runImplement` and `runVerify` as a `log` parameter.
- Per-task SHA capture stays in `run()` (autopilot-specific): `taskList.subscribe(...)` records HEAD SHA the moment a task transitions to `completed`. Don't move this into workflow-core.
- `lib/widget-body.ts` exports `setupAutopilotWidget(widget: Widget): { setStage, dispose }`. It calls `widget.setTitle(() => ...)` with the `autopilot · plan › implement › verify · MM:SS` line (using `renderStageBreadcrumb` + `renderClock` from `workflow-core/render.ts`); `widget.setBody(() => ...)` composes `renderSubagents(widget.subagents)` + `renderTaskWindowLines(taskList.all())`; `widget.setFooter("type /autopilot-cancel to stop")`. It subscribes to `taskList` and calls `widget.invalidate()` on every mutation. `setStage` updates a closure variable and calls `widget.invalidate()`.
- `lib/report.ts` slims to ~80 LOC — `formatAutopilotReport(input)` composes `formatHeader("Autopilot Report")`, optional `formatCancelledBanner`, `formatLabelValueRow("Design", path)`, `formatGitInfoBlock({ branch, commitsAhead, baseBranch: "main" })`, then the autopilot-specific `formatTasksSection` and `formatVerifySection` (both kept inline — workflow-core's `formatKnownIssues` doesn't fit autopilot's mixed string+Finding-with-severity-grouping).
- The smoke test in `index.test.ts` uses `RegisterWorkflowOpts.spawn` to inject a fake spawner that returns canned JSON for plan / implement / verify, and `logBaseDir` to write to a tmp dir. Asserts that the workflow registers `/autopilot-start` and `/autopilot-cancel`, that running it produces a populated log dir, and that the final-report.txt contains the expected sections.
- Don't worry about byte-for-byte parity of `parseJsonReport` between old autopilot code and workflow-core — adjust or delete tests that assert specific strip behavior.
- The `RunVerifyResult` type used by `lib/report.ts` is defined in `phases/verify.ts`; it doesn't need to change.

**Commit:** `refactor(autopilot): migrate orchestrator to workflow-core registerWorkflow`

---

### Task 4: Update docs

**Files:**

- Modify: `pi/agent/extensions/autopilot/README.md`
- Modify: `pi/agent/extensions/workflow-core/README.md` (line 3: drop the "future" framing now that autopilot consumes the library)
- Modify: `pi/agent/extensions/workflow-core/INTEGRATION.md` (the "Walkthrough" placeholder at line 5 + the "Testing your workflow" placeholder at line 105 can both reference autopilot as the worked example now that it has migrated)
- Modify: `pi/agent/extensions/autoralph/README.md` (the "Vendored, not shared" paragraph around line 269 currently says `dispatch.ts` / `parse.ts` / `preflight.ts` are byte-for-byte the same as autopilot's — that's no longer true; reframe as "vendored from autopilot's pre-workflow-core era")
- Modify: `pi/agent/skills/brainstorming/SKILL.md` (lines 51, 54: `/autopilot` → `/autopilot-start`)

**Acceptance Criteria:**

- `pi/agent/extensions/autopilot/README.md` reflects the new command surface (`/autopilot-start <design.md>` + `/autopilot-cancel`), mentions the `Log: <path>` line in the report, mentions the per-run log directory at `~/.pi/workflow-runs/autopilot/`, and adds an `## Architecture` section pointing readers at `../workflow-core/INTEGRATION.md` for the framework reference.
- `grep -rn "/autopilot " pi/ claude/` returns no results (every invocation has been updated to `/autopilot-start`).
- The cross-references in workflow-core's README and INTEGRATION.md no longer treat autopilot as a future consumer.

**Notes:**

- `pi/README.md:29` table description ("Autonomous plan → implement → verify pipeline from a design doc") is still accurate — no change needed.
- `pi/agent/extensions/task-list/README.md:110` mentions autopilot as the first consumer of `task-list` — still accurate.
- `claude/skills/pi-extensions/SKILL.md` mentions autopilot's directory layout (`lib/`, `phases/`, `prompts/`) and widget pattern — both still accurate.
- For autoralph's README: the "Vendored, not shared" paragraph's _reasoning_ still holds (independent mutation for A/B comparison), but the framing "byte-for-byte the same as autopilot's" is stale. Edit to something like: "Vendored from autopilot's pre-workflow-core implementation. Autopilot has since migrated onto `workflow-core`; autoralph still uses these local copies. Migration of autoralph onto `workflow-core` is a separate future work item."

**Commit:** `docs(autopilot): document workflow-core migration`

---

## After execution: validation gate

After Task 4 lands, run an end-to-end smoke test in a real Pi session before considering the migration complete:

1. `make typecheck && make test`
2. `/autopilot-start .designs/2026-04-24-autopilot-sota-research.md` (or another small design doc) — verify the report renders with the new `Log:` line and the run-log dir gets populated under `~/.pi/workflow-runs/autopilot/`.
3. `/autopilot-start <some-design.md>` then `/autopilot-cancel` mid-run — verify the report includes the cancelled banner.

This step is a manual user task, not an implementer subagent task.
