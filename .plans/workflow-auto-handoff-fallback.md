# Workflow Auto Handoff Fallback Plan

## Goal

Make workflow auto handoff robust against agents ending Execute or Verify mode without calling the required workflow tool, while still providing an explicit terminal/abort path.

## Constraints

- Edit source files under `pi/agent/extensions/workflow-modes/`; do not edit stowed files under `~/.pi/`.
- Use the breaking `workflow_advance` tool name and `state` schema; no backwards compatibility with `workflow_handoff` is required.
- Keep the change focused on Execute/Verify auto-handoff reliability; do not redesign workflow modes generally.
- Avoid infinite follow-up loops by capping missing-tool reminders at 2 per Execute/Verify mode entry or successful handoff.
- Terminal workflow decisions should exit to Normal mode and return a terminating tool result.
- Follow repo conventions: update extension README for user-facing config/behavior changes; run both `make typecheck` and `make test` before reporting completion.

## Acceptance Criteria

- AC-1: With `autoHandoffEnabled=true`, Execute mode ending without a successful `workflow_advance` queues a follow-up prompt instructing the agent to call `workflow_advance` to hand off to Verify or abort/finish explicitly.
- AC-2: With `autoHandoffEnabled=true`, Verify mode ending without a successful `workflow_advance` queues a follow-up prompt instructing the agent to call `workflow_advance` to hand off to Execute for fixable issues or finish/abort explicitly.
- AC-3: Missing-tool follow-ups are capped at 2 per Execute/Verify mode entry or successful handoff, skip when `ctx.hasPendingMessages()` reports pending work, and do not fire when auto handoff is disabled or mode is Normal/Plan.
- AC-4: `workflow_advance` supports terminal completed/aborted states that restore Normal mode, publish workflow state, update/clear UI status, and return `terminate: true`.
- AC-5: Existing Execute→Verify and Verify→Execute handoff behavior remains intact, including UI deny prompt, handoff compaction, target-mode kickoff, `terminate: true`, and Verify→Execute fix-loop cap.
- AC-6: Tests cover fallback follow-ups, cap/reset behavior, pending-message suppression, terminal exit-to-Normal behavior, breaking tool rename/schema behavior, and existing handoff semantics.
- AC-7: `workflow-modes` README documents the new required phase-decision behavior, terminal states, follow-up cap/config, and logging/persistence implications.

## Chosen Approach

Replace `workflow_handoff` with `workflow_advance` as the single required phase-decision tool for auto handoff runs. The tool uses one `state` discriminator for both handoffs and terminal decisions. Add terminal states for completed/aborted so Verify pass/blocked/unfixable outcomes and Execute unable-to-handoff outcomes have an explicit non-looping exit path. Add an `agent_end` fallback, modeled after the goal extension, that infers a missing required tool call from unchanged workflow state and queues a bounded follow-up message.

The key trade-off is requiring a tool call even for terminal Verify outcomes when auto handoff is enabled. That adds one explicit step, but it gives the harness a deterministic completion signal instead of guessing from free-text reports.

## Documentation Impact

Update `pi/agent/extensions/workflow-modes/README.md`:

- Explain that when `autoHandoffEnabled` is true, Execute and Verify should finish by calling `workflow_advance`.
- Document handoff vs terminal completed/aborted parameters with JSON examples.
- Document the missing-tool follow-up behavior and 2-follow-up cap.
- Add any new configuration field/environment variable if execution chooses to make the cap configurable; otherwise explicitly state the cap is fixed at 2.
- Update Logging/Persistence text to mention missing-tool follow-ups are transient user messages/status notifications and retained no separate logs.

No other docs are expected to require updates unless implementation changes the public integration API shape.

## Assumptions / Open Questions

- Q1: Terminal tool calls should exit to Normal mode. Status: confirmed by user.
- Q2: Missing-tool follow-up cap should be 2. Status: confirmed by user.
- Q3: The cap may be a constant rather than a user-facing config field unless implementation finds configurability is cleaner. Status: implementation decision; if configurable, update README config table and env parsing.
- Q4: The old `workflow_handoff({ target_mode, reason })` shape is intentionally unsupported. Status: confirmed by user.

## Ordered Tasks

### T1: Model workflow handoff decisions and runtime state

Covers: AC-3, AC-4, AC-5

- In `pi/agent/extensions/workflow-modes/index.ts`, add runtime state for missing-handoff follow-up count and reset it on explicit mode transitions, successful handoffs, terminal exits, session start/tree/shutdown, and Normal mode transitions.
- Add a small helper to reset or increment the counter so tests can observe behavior through sent messages/status rather than internal state.
- Decide during implementation whether the cap is a constant or `WorkflowModesConfig` field; prefer a constant unless the code becomes clearer with config.

### T2: Replace `workflow_handoff` with `workflow_advance` state schema

Covers: AC-4, AC-5

- Extend `HANDOFF_PARAMS` so the tool can represent:
  - handoff to `execute` or `verify` with `state` and `reason`;
  - terminal `completed`/`aborted` with `state` and `reason` or evidence text.
- Do not preserve compatibility for the old `target_mode` shape; this is a breaking rename/schema change.
- For terminal completed/aborted:
  - validate it is only accepted in Execute or Verify when auto handoff is enabled;
  - restore Normal mode/tool/thinking defaults using existing baseline helpers;
  - clear auto-handoff status, reset reminders/follow-up counters, publish workflow state;
  - return text describing the terminal outcome plus `terminate: true`.
- Keep existing handoff validation, deny prompt, compaction, target kickoff, and fix-loop cap semantics unchanged.

### T3: Update mode contracts and fallback prompts

Covers: AC-1, AC-2, AC-3

- In `pi/agent/extensions/workflow-modes/modes.ts`, update Execute and Verify contracts when `autoHandoffEnabled` is true:
  - Execute: call `workflow_advance` with `state: "verify"` when ready; call terminal `state: "completed"` or `state: "aborted"` if unable to proceed or not ready to hand off but choosing to stop.
  - Verify: call `workflow_advance` with `state: "execute"` for fixable issues; call terminal `state: "completed"` or `state: "aborted"` for pass, blocked, unfixable, or unable-to-decide outcomes.
- Add helper(s) in `index.ts` to build concise follow-up messages for Execute and Verify that tell the agent it stopped without the required workflow decision tool and must call `workflow_advance` or continue only if it is not actually at a stopping point.

### T4: Add `agent_end` fallback

Covers: AC-1, AC-2, AC-3

- Add an `agent_end` handler in `workflow-modes/index.ts` modeled on `pi/agent/extensions/goal/index.ts`.
- Conditions to send a follow-up:
  - `autoHandoffEnabled` is true;
  - current mode is Execute or Verify;
  - there is no pending queued message according to `ctx.hasPendingMessages()` when available;
  - the per-mode missing-handoff follow-up count is below 2.
- Queue the follow-up with `pi.sendUserMessage(message, { deliverAs: "followUp" })`.
- Increment the follow-up count before or immediately after queueing to avoid repeated prompts.
- When the cap is reached, stop queueing; optionally notify in UI that the workflow handoff fallback cap was reached.

### T5: Add and update tests

Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

- Extend the `index.test.ts` harness if needed so test contexts can simulate `hasPendingMessages()` returning true.
- Add tests for Execute missing-tool follow-up, Verify missing-tool follow-up, disabled auto handoff no-op, pending-message suppression, cap after 2 follow-ups, and counter reset after mode transition/handoff.
- Add tests for terminal completed/aborted restoring Normal mode and returning `terminate: true`.
- Keep existing handoff semantics tests passing; assert the new `workflow_advance` name and `{ state, reason }` shape.

### T6: Update README documentation

Covers: AC-7

- Update `pi/agent/extensions/workflow-modes/README.md` sections: What it does, Execute, Verify, Automatic handoff, Configuration if applicable, Logging, and Persistence/compaction if relevant.
- Include concise JSON examples for handoff and terminal exit.

### T7: Verify implementation

Covers: AC-6, AC-7

- Run `make typecheck`.
- Run `make test`.
- If either fails, fix boundedly and rerun the failing check, then the full required check if changes could affect broader behavior.

## Verification Checklist

- [ ] V1: `make typecheck` passes.
- [ ] V2: `make test` passes.
- [ ] V3: Tests demonstrate missing-tool follow-ups in Execute and Verify and no follow-up when disabled/pending/capped.
- [ ] V4: Tests demonstrate terminal completed/aborted exits to Normal and terminates the run.
- [ ] V5: Existing Execute↔Verify handoff tests still pass with deny prompt, compaction, kickoff, and fix-loop cap behavior intact.
- [ ] V6: Confirm Documentation Impact was followed: README updated for behavior/config/logging, or no extra docs needed beyond README.

## Known Issues / Follow-ups

- The fallback remains state-based rather than semantically parsing the assistant’s final text. This is intentional: deterministic tool decisions are more reliable than free-text classifiers.
- If future usage shows 2 follow-ups is too noisy or too weak, promote the cap to a documented config field with an environment override.
