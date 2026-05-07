# Workflow Modes Handoff Compaction Plan

## Goal

Make `workflow_handoff` more prompt-cache-friendly by compacting large Execute ↔ Verify sessions before applying the target mode/tool set, and add separate handoff-specific compaction thresholds so handoff loops can compact earlier than explicit slash-command mode switches.

## Constraints

- Keep slash-command pre-switch compaction behavior compatible by leaving `autoCompactOnModeSwitch` and `autoCompactMinTokens` semantics intact.
- Use TDD: add failing tests for each behavior change before production edits.
- Keep the existing handoff safety model: disabled-by-default auto handoff, user cancel window when UI exists, Verify → Execute fix-loop cap, and `terminate: true` on successful handoff.
- Handoff compaction must not strand the workflow if compaction fails; match slash-command behavior by notifying and continuing.
- Follow repository convention: after Pi extension changes, run both `make typecheck` and `make test`.

## Acceptance Criteria

1. `workflow_handoff` triggers compaction before switching modes when `autoCompactOnHandoff` is true and current context tokens are at least `autoCompactHandoffMinTokens`.
2. During handoff compaction, the session compaction summary records the target mode, not the current mode.
3. Handoff compaction is skipped when disabled, token usage is unknown, or token usage is below the handoff threshold.
4. If handoff compaction fails, the extension notifies the UI when available, still applies the target mode, sends the follow-up kickoff, and returns a terminating successful handoff result.
5. Configuration supports settings and environment overrides for `autoCompactOnHandoff` and `autoCompactHandoffMinTokens`, with defaults `true` and `30000`.
6. README configuration and persistence/compaction docs describe the new handoff-specific behavior and no longer claim tool-driven handoffs never run pre-switch compaction.
7. `make typecheck` and `make test` pass.

## Chosen Approach

Add handoff-specific compaction settings:

- `autoCompactOnHandoff: true`
- `autoCompactHandoffMinTokens: 30000`
- `WORKFLOW_MODES_AUTO_COMPACT_ON_HANDOFF`
- `WORKFLOW_MODES_AUTO_COMPACT_HANDOFF_MIN_TOKENS`

Refactor existing pre-switch compaction into a reusable helper that accepts:

- target workflow mode
- context object
- enabled flag
- token threshold
- action label/custom instructions for user-facing notifications

Use this helper from both slash-command transitions and `transitionToModeFromHandoff`. For handoffs, run it after all handoff validation and any UI cancel window, but before `applyMode(targetMode)`. Preserve the existing sequence for fix-loop accounting: only increment Verify → Execute loop budget once the handoff is accepted and is about to proceed.

When compaction starts, set `state.pendingCompactionMode = targetMode` so `session_before_compact` emits a workflow-aware summary for the target mode. Clear it in both success and failure callbacks. On failure, notify with an error message and continue to `applyMode`, publish state, update status, and send the follow-up kickoff.

## Documentation Impact

Update `pi/agent/extensions/workflow-modes/README.md`:

- Add the two new config fields and environment variables to the unified configuration table and JSON example.
- Update the feature list to say automatic handoffs can compact large sessions before switching modes.
- Update Automatic handoff / Persistence and compaction sections to describe handoff-specific threshold behavior, failure behavior, and target-mode summary preservation.
- Preserve the Logging section’s statement that no retained logs are written; update it to mention handoff compaction failure notifications if needed.

No changelog exists in this repository, so no changelog update is required.

## Assumptions / Open Questions

- Assumption: calling `ctx.compact` from the `workflow_handoff` tool and awaiting callback completion is acceptable in Pi’s extension API. The existing docs describe `ctx.compact()` as available in all contexts and callback-based.
- Assumption: the handoff should wait for compaction before returning the tool result, so the target mode and follow-up kickoff are only sent after the compacted context is in place.
- Decision made: handoff compaction failure should notify and continue.
- Decision made: slash-command threshold remains `50000`; handoff threshold defaults to `30000`.

## Ordered Tasks

1. Add failing config tests in `pi/agent/extensions/workflow-modes/config.test.ts`:
   - environment variables map to `autoCompactOnHandoff` and `autoCompactHandoffMinTokens`
   - invalid/non-finite/negative values fall back through existing config validation behavior if currently covered by load config patterns
2. Add failing behavior tests in `pi/agent/extensions/workflow-modes/index.test.ts`:
   - successful Execute → Verify handoff above 30k compacts before tools/thinking/kickoff change
   - handoff compaction summary uses target mode
   - handoff skips compaction below threshold and when disabled
   - handoff compaction failure notifies and still completes handoff
3. Update `WorkflowModesConfig`, `DEFAULT_CONFIG`, `loadConfig`, and `readEnvSettings` in `pi/agent/extensions/workflow-modes/index.ts` for the new settings.
4. Extract or generalize `maybeCompactBeforeModeSwitch` so command switches and handoffs share compaction logic without duplicating callback cleanup/notification code.
5. Wire handoff transition to run the generalized helper before `applyMode(targetMode)`.
6. Update tests to pass with minimal production code.
7. Update `pi/agent/extensions/workflow-modes/README.md` according to Documentation Impact.
8. Run targeted tests during TDD, then run full verification commands.

## Verification Checklist

- [ ] Watch each new failing test fail for the expected reason before implementation.
- [ ] Run targeted workflow-modes tests, e.g. `npx tsx --test pi/agent/extensions/workflow-modes/index.test.ts pi/agent/extensions/workflow-modes/config.test.ts`.
- [ ] Run `make typecheck`.
- [ ] Run `make test`.
- [ ] Confirm README updates match the implemented defaults, env names, and failure behavior.
- [ ] Confirm Documentation Impact was followed and no extra docs were created.

## Known Issues / Follow-ups

- This plan does not redesign active tool sets or move mode contracts out of the system prompt; it only reduces the cost of cache misses at handoff boundaries.
- If Pi’s runtime behavior shows that awaiting `ctx.compact()` from a tool aborts tool-result delivery, adjust implementation to a callback-driven handoff completion pattern and cover that with tests before shipping.
