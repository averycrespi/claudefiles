# Automatic Execute/Verify Handoff Loop

## Goal

Add an opt-in, capped automatic handoff loop to `pi/agent/extensions/workflow-modes/` so the agent can move from Execute mode to Verify mode when implementation is complete, and from Verify mode back to Execute mode when fixable issues remain, while preserving user control through a short deny window in UI sessions.

## Constraints

- Keep the workflow deterministic: the extension performs mode switches; the agent only requests a handoff through explicit tools.
- Default behavior should be opt-in (`autoHandoffEnabled: false`) to avoid surprising autonomous loops.
- In TUI/RPC sessions, the user gets a 10s deny window before an automatic handoff proceeds.
- In non-UI sessions, skip the denial prompt/timeout and proceed immediately when the tool request is otherwise valid.
- Cap automatic loopbacks to avoid infinite Execute ↔ Verify cycling.
- Preserve existing slash-command behavior and pre-switch compaction semantics.
- Follow repo conventions: update README config/logging docs, use snake_case schemas for agent tools, and run `make typecheck` plus `make test` before reporting completion.

## Acceptance Criteria

1. When `autoHandoffEnabled` is false or unset, `workflow_handoff` returns a clear disabled message and does not change mode.
2. In Execute mode with auto handoff enabled, calling `workflow_handoff({ target_mode: "verify", reason })` prompts the user to deny for the configured timeout; if not denied, mode changes to Verify and a Verify kickoff/follow-up message is queued.
3. In Verify mode with auto handoff enabled, calling `workflow_handoff({ target_mode: "execute", reason })` prompts the user to deny for the configured timeout; if not denied and the cap is not exhausted, mode changes to Execute and an Execute kickoff/follow-up message is queued.
4. If the user denies a handoff in a UI session, the mode does not change and the tool result tells the agent the handoff was denied.
5. In non-UI sessions, handoffs skip the denial dialog and do not wait for the timeout.
6. Once the configured automatic loop cap is reached, Verify-to-Execute handoffs are blocked with a clear tool result and no mode change.
7. The status line or widget visibly indicates when auto handoff is enabled, including remaining loopback budget or disabled/exhausted state.

## Chosen Approach

Implement one explicit agent tool rather than trying to infer completion from free text or `agent_end`:

- `workflow_handoff` — active in Execute and Verify modes; accepts `target_mode` and `reason`.

Schema:

```ts
workflow_handoff({
  target_mode: "verify" | "execute",
  reason: string
})
```

The tool should:

1. Validate deterministic facts: config enabled, current mode supports the requested target, and loop cap is not exhausted.
2. Allow only Execute → Verify and Verify → Execute. Reject Plan/Normal calls and same-mode or unsupported target transitions.
3. Rely on the mode contract, not schema fields, for semantic intent: Execute should call the tool only when implementation is ready to verify; Verify should call it only when fixable issues remain.
4. If `ctx.hasUI`, show an inverted timed confirmation such as “Deny automatic handoff?” with `{ timeout: autoHandoffDenyTimeoutMs }`. Pi confirm timeouts return `false`, so `false` means “not denied; proceed.”
5. Apply the target mode using the existing mode transition path where possible, but avoid relying on slash-command handlers from tool execution.
6. Queue the target mode kickoff as a follow-up/steer message because tool calls happen during an active turn.
7. Return `terminate: true` so the handoff tool can end the current tool batch cleanly before the queued target-mode prompt runs.

Suggested config keys:

```json
{
  "extension:workflow-modes": {
    "autoCompactOnModeSwitch": true,
    "autoCompactMinTokens": 50000,
    "autoHandoffEnabled": false,
    "autoHandoffDenyTimeoutMs": 10000,
    "autoHandoffMaxFixLoops": 2
  }
}
```

Loop counting recommendation: count Verify → Execute loopbacks as “fix loops” and reset the counter on `/plan`, `/execute`, `/normal`, session start/tree/shutdown, or a successful Verify “no fixable issues” completion. Execute → Verify handoffs should not consume the fix-loop budget.

Status-line recommendation: use `ctx.ui.setStatus("workflow-modes", ...)` when UI exists, for example `↻ auto 1/2` in Execute/Verify modes when enabled, `↻ exhausted` when the cap is hit, and clear it in Normal mode or when auto handoff is disabled. Keep this compact rather than adding a large widget unless tests show status is not visible enough.

## Documentation Impact

Execution should update:

- `pi/agent/extensions/workflow-modes/README.md`
  - Add the auto handoff behavior to “What it does”.
  - Document the new `workflow_handoff` tool and the intended agent contract.
  - Extend the Configuration section with `autoHandoffEnabled`, `autoHandoffDenyTimeoutMs`, and `autoHandoffMaxFixLoops`.
  - Mention that no retained logs are written and prompts/denials are UI-only.
  - Update persistence/compaction notes if loop state remains in memory only.
- `pi/agent/extensions/workflow-modes/API.md` only if the public event state is extended with auto-handoff status. Prefer not extending the public API unless another extension needs it.

No changelog exists in the repo, so no changelog update is required.

## Assumptions / Open Questions

- Selected default: auto handoff is opt-in (`autoHandoffEnabled: false`).
- The denial dialog should be inverted (“Deny?”), because Pi’s timed `confirm()` defaults to `false` on timeout and the desired timeout behavior is to proceed.
- The initial cap should be 2 Verify → Execute fix loops unless the user requests a different default.
- A Verify pass should not auto-return to Execute; it should end with a normal final report/no-fixable-issues message.
- If both handoff and pre-switch compaction are enabled, reuse the existing pre-switch compaction path for consistency; if tool-context compaction proves unsafe or unavailable, skip compaction for tool-driven handoffs and document that difference.

## Ordered Tasks

1. Read current Pi tool/UI docs and `workflow-modes` tests enough to confirm exact `ctx.ui.confirm`, `pi.sendUserMessage`, and `terminate` behavior.
2. Extend `WorkflowModesConfig`, defaults, and `loadConfig()` validation with auto handoff settings.
3. Add runtime state for auto handoff loop count and denial/exhausted status; reset it on manual mode changes and session lifecycle events.
4. Refactor shared transition helpers so both slash commands and tools can apply a mode, publish events, update UI status, and queue the right kickoff message safely from command or tool contexts.
5. Register `workflow_handoff` with snake_case parameters and make it active only in Execute and Verify tool sets.
6. Update `buildModeContract()` so Execute/Verify prompts explain when to call `workflow_handoff` and how to report pass/blocked/unfixable outcomes.
7. Add status-line updates gated on `ctx.hasUI` / top-level Pi UI availability following the repo’s `setWidget`/UI safety conventions.
8. Add unit tests for disabled config, allowed handoff, denied handoff, non-UI skip, cap exhaustion, status updates, active tool sets, and mode contract text.
9. Update README documentation and API docs only if public state changes.
10. Run `make typecheck` and `make test`.

## Verification Checklist

- `make typecheck` passes.
- `make test` passes.
- Tests prove that `autoHandoffEnabled` defaults to false.
- Tests prove the 10s deny window is not used in non-UI contexts.
- Tests prove a denial blocks the mode switch.
- Tests prove the fix-loop cap blocks further Verify → Execute transitions.
- Tests prove Documentation Impact was followed: README updated, and API.md left unchanged unless the public event contract changed.

## Known Issues / Follow-ups

- The cap is intentionally simple. If later workflows need richer accounting, consider exposing loop state in `WorkflowModeState`, but avoid expanding the public API now.
- The agent may still choose not to call the handoff tools. The mode contracts should strongly guide usage, but the design should not rely on parsing final text.
