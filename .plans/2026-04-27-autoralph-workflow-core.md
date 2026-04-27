# autoralph → workflow-core migration

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Refactor `pi/agent/extensions/autoralph` to build on `_workflow-core/`, dropping ~700 lines of vendored infra (dispatch, parse, preflight, hand-rolled status widget, manual abort/timeout plumbing) in favor of workflow-core primitives.

**Architecture:** Replace hand-rolled command registration / single-active-run lock / abort plumbing / report emission with a single `registerWorkflow(...)` call in `index.ts`. Replace `lib/dispatch.ts` + `lib/parse.ts` with `ctx.subagent.dispatch` (typed, schema-validated, retry built in). Replace `lib/status-widget.ts` with `ctx.widget` and shared `renderSubagents` / `renderClock` helpers. Move per-run state files from project-local `.autoralph/` into `ctx.workflowDir` (`~/.pi/workflow-runs/autoralph/<run-id>/workflow/`).

**Tech Stack:** TypeScript, `tsx --test` (Node's `node:test` runner), TypeBox (schemas), `@mariozechner/pi-coding-agent` (extension API), `_workflow-core/` (sibling extension providing primitives).

**Reference:** Full design at `.designs/2026-04-27-autoralph-workflow-core.md`. The autopilot extension (`pi/agent/extensions/autopilot/`) is the worked example — every primitive used here is already in production there.

**Public-surface change:** `/autoralph <design.md>` becomes `/autoralph-start <design.md>` (workflow-core hardcodes `<name>-start`/`<name>-cancel`). `/autoralph-cancel` is unchanged.

---

### Task 1: Consolidate handoff + history into `state.ts`

**Files:**

- Create: `pi/agent/extensions/autoralph/lib/state.ts`
- Create: `pi/agent/extensions/autoralph/lib/state.test.ts`

**Acceptance Criteria:**

- `lib/state.ts` exports `readHandoff`, `writeHandoff`, `readHistory`, `appendHistory`, `IterationOutcome`, and `IterationRecord` with semantics identical to today's `lib/handoff.ts` + `lib/history.ts`. The `isBootstrap` helper is **not** ported — its caller will switch to `iteration === 1`.
- `lib/state.test.ts` covers: handoff round-trip; handoff returns `null` on missing file / malformed JSON / non-string `handoff` field; history returns `[]` on missing file / malformed JSON / non-array root; history append creates parent directory and is order-preserving.
- `make typecheck && make test` pass with the new file in place; `lib/handoff.ts` + `lib/history.ts` are still present and untouched.

**Notes:**

- Copy the source verbatim from `lib/handoff.ts` + `lib/history.ts`, merging into one file. Re-export `IterationOutcome` and `IterationRecord` types from `state.ts` so later tasks can switch their imports.
- Don't yet update `index.ts` / `phases/iterate.ts` / `lib/report.ts` to import from `state.ts` — that happens organically as later tasks rewrite those files. The old files remain available; their test coverage is preserved until task 6 deletes them.
- See @CLAUDE.md "Testing" section: tests use `node:test` via `tsx`, import sources with `.ts` extensions.

**Commit:** `refactor(autoralph): consolidate handoff + history into state.ts`

---

### Task 2: Return report as `string[]` and adopt `_workflow-core/report.ts` helpers

**Files:**

- Modify: `pi/agent/extensions/autoralph/lib/report.ts`
- Modify: `pi/agent/extensions/autoralph/lib/report.test.ts`
- Modify: `pi/agent/extensions/autoralph/index.ts` (one-line bridge: join array → string before `pi.sendMessage`)

**Acceptance Criteria:**

- `formatAutoralphReport` (rename from `formatReport`) returns `string[]` and uses `formatHeader("Autoralph Report")`, `formatLabelValueRow("Design", designPath)`, `formatGitInfoBlock({ branch, commitsAhead })` from `../_workflow-core/report.ts`. The `cancelled` outcome routes through `formatCancelledBanner(elapsedMs)`. The iteration-row formatter (✔/✗/⏱/🪞 glyphs, no-commit suffix) stays inline — these are autoralph-specific and have no autopilot analog.
- `lib/report.test.ts` is updated to assert array contents and section ordering instead of joined string content. Coverage parity with today: `complete`, `max-iterations`, `failed` (with reason from last summary), `stuck`, `cancelled`; reflection 🪞 glyph; commit-SHA suffix vs no-commit suffix.
- `index.ts` calls `formatAutoralphReport(...).join("\n")` before passing to `pi.sendMessage` so the run still emits the correct text. The `Log:` line is **not** dropped from `index.ts` yet — workflow-core will append it once task 5 lands.
- `make typecheck && make test` pass.

**Notes:**

- Leave the function name as `formatAutoralphReport` (matching autopilot's `formatAutopilotReport` convention). Update both `report.ts` exports and `index.ts` import.
- The `Final task file:` and `Final handoff:` lines have no helper analog — keep them inline.

**Commit:** `refactor(autoralph): return report as string array`

---

### Task 3: Add `lib/widget-body.ts` (workflow-core widget shape)

**Files:**

- Create: `pi/agent/extensions/autoralph/lib/widget-body.ts`
- Create: `pi/agent/extensions/autoralph/lib/widget-body.test.ts`

**Acceptance Criteria:**

- `setupAutoralphWidget(widget: Widget)` returns `{ setIteration, setHistory, dispose }`. It calls `widget.setTitle/setBody/setFooter` once with function-form setters; `setIteration(i, max)` and `setHistory(h)` mutate captured state and call `widget.invalidate()`.
- Title renders `autoralph · iter N/MAX · MM:SS` using `renderClock(widget.elapsedMs())` from `../_workflow-core/render.ts`. Body composes `renderSubagents(widget.subagents, { theme: widget.theme })` followed by an inline `renderHistoryBlock(history, theme)` (lifted from today's `lib/status-widget.ts`: counter line `history: N done (M commits) · X timeouts` + last-2 iteration rows with reflection 🪞 / commit SHA glyphs). Footer is the static string `"type /autoralph-cancel to stop"`.
- `lib/widget-body.test.ts` drives a hand-rolled fake `Widget` (capturing `setTitle`/`setBody`/`setFooter` calls and exposing controllable `subagents`/`elapsedMs`/`theme`); asserts: header includes `iter 0/0` initially and updates after `setIteration(7, 50)`; body history block renders the counter line and last-2 rows; reflection record renders 🪞 glyph; commit SHA appears as `(abc1234)` when `headAfter !== headBefore`, `(no commit)` otherwise.

**Notes:**

- Mirror `pi/agent/extensions/autopilot/lib/widget-body.ts` for top-level shape.
- `renderHistoryBlock` is autoralph-specific — keep it as a private function in `widget-body.ts`, not a workflow-core helper. The data shape it consumes (`IterationRecord[]`) stays an autoralph type.
- Import `IterationRecord` from `./state.ts` (created in task 1), **not** from `./history.ts`.
- This task does **not** wire the new widget into `index.ts` yet — `lib/status-widget.ts` is still in use. The handoff happens in task 5.

**Commit:** `feat(autoralph): add workflow-core widget body`

---

### Task 4: Refactor `phases/iterate.ts` to consume a `Subagent`

**Files:**

- Modify: `pi/agent/extensions/autoralph/phases/iterate.ts`
- Modify: `pi/agent/extensions/autoralph/phases/iterate.test.ts`
- Modify: `pi/agent/extensions/autoralph/index.ts` (build a `Subagent` adapter via `createSubagent({ cwd, signal, ... })` from `../_workflow-core/api.ts` and pass it where `dispatch` was)

**Acceptance Criteria:**

- `RunIterationArgs` no longer takes `dispatch: DispatchFn` or `signal: AbortSignal`; it takes `subagent: Subagent` (from `../_workflow-core/lib/subagent.ts`). The body calls `args.subagent.dispatch({ intent, prompt, schema: IterationReportSchema, tools, extensions, timeoutMs })` once. The hand-rolled `setTimeout(controller.abort, timeoutMs)` block, the parent-signal listener registration, and the `parseJsonReport` call are all removed.
- Result mapping covers all `DispatchResult` failure reasons: `r.reason === "timeout"` → `outcome: "timeout"`; `r.reason === "parse" || "schema"` → `outcome: "parse_error"`; `r.reason === "dispatch"` → `outcome: "dispatch_error"`; `r.reason === "aborted"` → `outcome: "dispatch_error"` (the run-level abort check in the outer loop will exit on the next iteration). On `r.ok`, return `{ outcome: r.data.outcome, summary: r.data.summary, handoff: r.data.handoff, ... }`.
- `phases/iterate.test.ts` is rewritten against an in-memory `Subagent` stub (one `dispatch` method returning canned `DispatchResult` values; `parallel` can be a `notImplemented` throw). Coverage: prompt template substitution (iteration number, MAX, design path, task file path, bootstrap-vs-handoff branch, reflection block on/off); each result-mapping branch (`ok+complete`, `ok+in_progress`, `ok+failed`, `timeout`, `parse`, `dispatch`); `headBefore`/`headAfter`/`durationMs` populated correctly. Drop fake-timer abort tests — abort linkage is workflow-core's responsibility.
- `index.ts` instantiates a `Subagent` via `createSubagent({ cwd, signal: controller.signal, onSubagentEvent: ..., onSubagentLifecycle: ... })` matching today's widget-event wiring, and passes it into `runIteration`. `lib/dispatch.ts` is no longer imported.
- `make typecheck && make test` pass.

**Notes:**

- This is the only task where subtle behavior could drift (see `.designs/2026-04-27-autoralph-workflow-core.md` "Risks"). The retry policy is now `retry: "one-retry-on-dispatch"` (the default) — same intent-suffix behavior as today's hand-rolled retry, but tagged differently. Don't override it.
- Keep the existing `prompts/iterate.md` template unchanged for now. Path substitutions (`{TASK_FILE_PATH}`) still work because the bridge `index.ts` will continue to compute paths from `.autoralph/` until task 5 moves them to `ctx.workflowDir`.
- The subagent's lifecycle/event callbacks must still drive the legacy `lib/status-widget.ts` until task 5 swaps the widget. Wire them through the same `widget.subagent(intent)` handle pattern that `makeWrappedDispatch` uses today.

**Commit:** `refactor(autoralph): use workflow-core Subagent in iterate phase`

---

### Task 5: Adopt `registerWorkflow` in `index.ts` and add end-to-end test

**Files:**

- Modify: `pi/agent/extensions/autoralph/index.ts` (full rewrite — old body replaced by `registerWorkflow(...)` call)
- Create: `pi/agent/extensions/autoralph/index.test.ts`
- Modify: `pi/agent/extensions/autoralph/lib/args.ts` (return shape change)
- Modify: `pi/agent/extensions/autoralph/lib/args.test.ts` (assertion updates)

**Acceptance Criteria:**

- `index.ts` is a single `registerWorkflow(pi, { name: "autoralph", description, parseArgs, preflight, runSlug, run }, testOpts)` call. Preflight uses `requireFile` + inline empty-file check + `requireCleanTree` + `captureHead` from `../_workflow-core/preflight.ts`. The `run` body is the iteration loop from `.designs/2026-04-27-autoralph-workflow-core.md` (Section 3): builds per-run paths under `ctx.workflowDir`, calls `setupAutoralphWidget(ctx.widget)`, loops `runIteration` with reflection cadence + three-consecutive-timeouts → `stuck` rule, returns `formatAutoralphReport(...)` (the `string[]` return now flows through workflow-core directly — no `.join("\n")` bridge). `signature(pi, testOpts: RegisterWorkflowOpts = {})` matches autopilot.
- `parseArgs` in `lib/args.ts` returns `{ ok: true; args: ParsedArgs } | { ok: false; error: string }` (matches workflow-core's expected shape). `ParsedArgs` no longer needs the `error` union member. `lib/args.test.ts` updated accordingly.
- `prompts/iterate.md` paths still work because `index.ts` computes `taskFilePath = join(ctx.workflowDir, \`${slug}.md\`)`and substitutes it into the template the same way`phases/iterate.ts` already does. No change to the prompt file.
- `index.test.ts` mirrors `pi/agent/extensions/autopilot/index.test.ts`: real temp git repo, fake `spawn` returning canned iteration JSON, `logBaseDir` injection. Asserts: `/autoralph-start` and `/autoralph-cancel` are registered; full run produces a report containing `━━━ Autoralph Report ━━━`, an `Iterations (N):` section with at least one row, an `Outcome:` line, and a `Log:` footer (appended by workflow-core); the run-log dir contains `run.json`, `events.jsonl`, `prompts/`, `outputs/`, `final-report.txt`, and `workflow/<slug>.{md,handoff.json,history.json}`; `run.json.outcome === "success"`; `events.jsonl` contains an `autoralph.<event>` entry (use one `ctx.log(...)` call in the run body to seed it — e.g., `ctx.log("iteration-start", { iteration: i })`).
- `/autoralph` (no suffix) no longer exists — only `/autoralph-start` and `/autoralph-cancel`.
- `make typecheck && make test` pass.

**Notes:**

- `runSlug: (args) => basename(args.designPath, extname(args.designPath))` — keep extension stripping consistent with today's `designBasename`.
- The detach pattern (`registerWorkflow` returns immediately so `/autoralph-cancel` can fire) is owned by workflow-core; don't await the pipeline inside `run` — just write the loop normally.
- Reuse the autopilot test scaffolding (`makeTempRepo`, `makeDesignFile`, `fakePi`, `makeOkOutcome`) verbatim — copy into `index.test.ts`. Canned spawn response: `JSON.stringify({ outcome: "complete", summary: "done", handoff: "all checklist items complete" })`. To exercise multiple iterations before complete, return `outcome: "in_progress"` for the first N spawns and `outcome: "complete"` after — gate on a counter in the fake spawn closure.
- This task removes the legacy widget wiring (`lib/status-widget.ts` is no longer imported) and the legacy dispatch wiring (`lib/dispatch.ts` is no longer imported). Those files become dead — task 6 deletes them.

**Commit:** `refactor(autoralph): adopt workflow-core registerWorkflow`

---

### Task 6: Delete dead code and update README

**Files:**

- Delete: `pi/agent/extensions/autoralph/preflight.ts`
- Delete: `pi/agent/extensions/autoralph/preflight.test.ts`
- Delete: `pi/agent/extensions/autoralph/lib/dispatch.ts`
- Delete: `pi/agent/extensions/autoralph/lib/dispatch.test.ts`
- Delete: `pi/agent/extensions/autoralph/lib/parse.ts`
- Delete: `pi/agent/extensions/autoralph/lib/parse.test.ts`
- Delete: `pi/agent/extensions/autoralph/lib/status-widget.ts`
- Delete: `pi/agent/extensions/autoralph/lib/status-widget.test.ts`
- Delete: `pi/agent/extensions/autoralph/lib/handoff.ts`
- Delete: `pi/agent/extensions/autoralph/lib/handoff.test.ts`
- Delete: `pi/agent/extensions/autoralph/lib/history.ts`
- Delete: `pi/agent/extensions/autoralph/lib/history.test.ts`
- Modify: `pi/agent/extensions/autoralph/README.md`

**Acceptance Criteria:**

- All twelve files above are removed from the working tree. `grep -r "from \"./preflight" pi/agent/extensions/autoralph/` and equivalents for `dispatch`, `parse`, `status-widget`, `handoff`, `history` (with `state` excluded) return no matches inside the autoralph extension. `make typecheck && make test` pass — nothing in the rest of the codebase depended on those modules.
- `README.md` updates:
  - "Command surface" section: replace `/autoralph` with `/autoralph-start`. Update the example invocation line accordingly.
  - "Storage layout" section: replace the `.autoralph/<basename>.{md,handoff.json,history.json}` block with text describing the new location (`~/.pi/workflow-runs/autoralph/<run-id>/workflow/<slug>.{md,handoff.json,history.json}`). Drop the "All three files are gitignored by convention" sentence.
  - "Module layout" section: rewrite the file tree to match the post-migration shape (no `preflight.ts`, no `lib/{dispatch,parse,status-widget,handoff,history}.ts`; add `lib/state.ts` and `lib/widget-body.ts`). Replace the "Vendored, not shared" paragraph with a one-paragraph note that autoralph now builds on `_workflow-core` (mirrors autopilot).
  - "Failure matrix" section: in the "User Ctrl-C / process dies" row, replace the `.autoralph/<name>.{handoff,history}.json` reference with the new run-log path.
  - "Inspirations" section: leave unchanged.

**Notes:**

- Run `make typecheck && make test` after each batch of deletions to surface any straggler imports early.
- The README is long — touch only the sections listed above. Don't restructure the doc.

**Commit:** `chore(autoralph): remove vendored infra after workflow-core migration`

---

<!-- No additional documentation updates needed beyond the README touched in Task 6. The repo-level CLAUDE.md does not reference autoralph specifics. -->
