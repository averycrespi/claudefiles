# Goal Auto-Run Plan

## Goal

Evolve the Pi goal extension from a durable steering aid into a Codex-style bounded auto-run controller that can set a goal and keep the agent working toward it until completion or an explicit budget/stop condition.

## Constraints

- Keep the existing dashed management commands: `/goal-show`, `/goal-set`, `/goal-pause`, `/goal-resume`, and `/goal-clear`.
- Add bare `/goal <objective>` as the headless-friendly set-and-run command.
- Do not make `/goal-set` auto-run; preserve it as set-only steering/persistence behavior.
- Do not add a new `budget_limited` goal status in this iteration; keep goal lifecycle statuses as `active`, `paused`, and `complete`.
- Store auto-run lifecycle separately from goal status so budget exhaustion can stop automation while leaving the goal active for steering/manual continuation.
- Keep completion conservative: only `goal_update(status="complete", evidence=...)` marks completion, and only with concrete evidence.
- Avoid unbounded loops; auto-run must have default bounds and duplicate-message guards.
- Follow repo Pi extension conventions, including README config/logging docs and tests for meaningful logic.

## Acceptance Criteria

- AC-1: `/goal <objective>` trims and validates the objective, creates/replaces the active goal, starts auto-run state, persists a `goal-state` snapshot, updates the widget, and sends an initial agent user message for the goal.
- AC-2: Existing dashed commands keep their current core behavior, with `/goal-pause`, `/goal-clear`, and successful `goal_update(status="complete", evidence=...)` also stopping any active auto-run.
- AC-3: Auto-run queues bounded continuation turns after `agent_end` while the goal is active, auto-run is running, no user/pending work should take precedence, and configured turn/time budgets are not exhausted.
- AC-4: When the turn or time budget is exhausted, the goal remains `active`, auto-run becomes stopped, and persisted/displayed state records a clear stop reason.
- AC-5: `/goal-stop` stops auto-run without clearing or pausing the goal, persists state, and leaves active-goal prompt steering intact.
- AC-6: Configuration supports conservative defaults: max 10 continuation turns, max 60 active minutes, no token cap by default, plus environment overrides for each new setting.
- AC-7: README and tests document/verify headless usage, command semantics, continuation bounds, stop reasons, and non-goals.

## Chosen Approach

Implement auto-run as a deterministic controller inside the existing `goal` extension rather than relying on stronger prompting. The controller uses Pi lifecycle hooks (`agent_end`, `input`, `before_agent_start`, `message_end`) and `pi.sendUserMessage()` to schedule follow-up work only when explicit state and budget checks allow it.

The main trade-off is to keep goal status simple and add separate auto-run state. This avoids broad lifecycle churn while still making budget exhaustion observable and resumable.

## Documentation Impact

Update `pi/agent/extensions/goal/README.md`:

- Replace the current “does not run autonomously” framing with bounded auto-run behavior.
- Document bare `/goal <objective>` and `/goal-stop` while preserving dashed command docs.
- Document that `/goal-set` is set-only and `/goal <objective>` is set-and-run.
- Document default bounds, configuration fields, environment overrides, and stop reasons.
- Document headless usage, e.g. `pi "/goal <objective>"`.
- Update prior-art/non-goals to clarify that the extension still omits background scheduling outside an active Pi session, project-global goals, and hard token enforcement.
- Confirm logging docs remain accurate: no retained logs; goal and auto-run state persist in Pi session history.

## Assumptions / Open Questions

- Q1: Token cap is intentionally omitted for v1 defaults because Pi token usage is best-effort; a future iteration can add optional token caps if needed. Status: accepted.
- Q2: User-originated input should stop auto-run to avoid fighting the user; extension-origin continuation input should not self-stop. Status: assumed, verify against Pi `input` event behavior in tests where practical.
- Q3: In print/headless mode, UI notification calls are no-ops; command behavior should rely on persisted state and sent user messages, not dialogs. Status: assumed from Pi docs.

## Ordered Tasks

### T1: Extend goal state for auto-run metadata

Covers: AC-3, AC-4, AC-5

- Update `pi/agent/extensions/goal/state.ts` with an `autoRun` state object separate from `goal.status`.
- Suggested fields: `status` (`idle`/`running`/`stopped`), `startedAt`, `updatedAt`, `continuationTurns`, `stopReason`, and `lastContinuationAt`.
- Add store methods for starting, stopping, recording a continuation, and clearing auto-run when appropriate.
- Update persisted-state parsing to accept legacy snapshots without auto-run state.
- Update `formatGoalState` to include concise auto-run status/stop reason when relevant.

### T2: Add auto-run configuration

Covers: AC-3, AC-4, AC-6

- Update `pi/agent/extensions/goal/config.ts` and defaults with:
  - `autoRunMaxTurns`: default `10`
  - `autoRunMaxActiveMinutes`: default `60`
  - optional `autoRunEnabled`: default `true` if useful as a kill switch
  - optional continuation prompt text only if needed; otherwise keep prompt deterministic in code to avoid over-configuration.
- Add environment overrides such as `GOAL_AUTO_RUN_MAX_TURNS`, `GOAL_AUTO_RUN_MAX_ACTIVE_MINUTES`, and `GOAL_AUTO_RUN_ENABLED` if present.
- Validate positive integers for numeric bounds and boolean env overrides consistently with existing config helpers.

### T3: Implement command surface changes

Covers: AC-1, AC-2, AC-5

- Register a new `goal` command in `pi/agent/extensions/goal/index.ts`.
- Bare `/goal` with no objective should show current goal state, matching `/goal-show` behavior.
- `/goal <objective>` should set the goal, start auto-run, persist state, update widget, and send an initial user message that clearly asks the agent to work toward the active goal.
- Add `/goal-stop` to stop auto-run while preserving the active goal.
- Keep dashed commands and ensure `/goal-pause`, `/goal-clear`, and completion stop auto-run.

### T4: Implement continuation controller

Covers: AC-3, AC-4

- Add an `agent_end` handler that checks whether continuation should be scheduled.
- Required guards:
  - goal exists and status is `active`
  - auto-run state is `running`
  - auto-run config is enabled
  - configured turn/time bounds are not exhausted
  - no pending user work should take precedence (`ctx.hasPendingMessages()` when available)
  - no duplicate continuation is already pending
- Use `pi.sendUserMessage()` to trigger the next turn, choosing immediate send when idle and `deliverAs: "followUp"` only if needed.
- Record continuation count before or after successful scheduling in a way that prevents duplicate sends.
- When bounds are exhausted, stop auto-run with `turn_budget` or `time_budget`, persist state, and notify/update widget.

### T5: Refine prompt steering for active auto-run

Covers: AC-1, AC-3, AC-4

- Keep existing `before_agent_start` active-goal prompt injection.
- Add auto-run-specific context when auto-run is running: remaining turns/time, instruction to continue concrete progress, and reminder to call `goal_update` only after evidence-backed completion.
- Ensure objective is still framed as user-provided data, not higher-priority instructions.
- Add a budget-stop/wrap-up nudge only if useful; do not mark the goal complete on budget exhaustion.

### T6: Stop auto-run on user interruption and terminal states

Covers: AC-2, AC-5

- Use the `input` event to stop auto-run on real user/RPC input while ignoring `event.source === "extension"` continuation messages.
- Stop auto-run when `/goal-pause`, `/goal-clear`, or `goal_update` completion succeeds.
- On session shutdown, clear in-memory subscription/widget as today; persisted auto-run state should reflect the latest stopped/running state according to prior events.

### T7: Update tests

Covers: AC-1 through AC-6

- Extend `state.test.ts` for auto-run lifecycle, budget stop reasons, formatting, and legacy parse behavior.
- Extend `config.test.ts` for new defaults, settings, env overrides, and invalid values.
- Extend `index.test.ts` with mocked `sendUserMessage`, `isIdle`, and `hasPendingMessages` to verify:
  - `/goal <objective>` sets/runs/sends initial message
  - `/goal` with no args shows state
  - `agent_end` schedules continuation under valid conditions
  - continuation does not schedule when paused/complete/stopped/no goal/pending input/budget exhausted
  - `/goal-stop` leaves goal active but stops auto-run
  - user input stops auto-run, extension input does not
- Extend `tools.test.ts` to verify completion stops auto-run and persists updated state.

### T8: Update README

Covers: AC-7

- Update `pi/agent/extensions/goal/README.md` according to Documentation Impact.
- Include a concise headless example and config table rows for new settings/env vars.
- Make clear that auto-run is bounded and session-local; it does not run after Pi exits.

## Verification Checklist

- [ ] V1: `make typecheck` passes.
- [ ] V2: `make test` passes.
- [ ] V3: Unit tests verify `/goal <objective>` set-and-run, `/goal-stop`, budget exhaustion, and continuation scheduling guards.
- [ ] V4: README command/config docs match implemented behavior.
- [ ] V5: Confirm Documentation Impact was followed: `pi/agent/extensions/goal/README.md` updated, no extra docs created unless necessary.

## Known Issues / Follow-ups

- Optional token caps are intentionally deferred because Pi token accounting is best-effort; add later if real background usage shows turn/time bounds are insufficient.
- Auto-run only works while a Pi session/process is alive; this plan does not add an external daemon or scheduler.
- Compaction behavior remains non-composable with other compaction-providing extensions, as documented today.
