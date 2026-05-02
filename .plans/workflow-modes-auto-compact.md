# Workflow Modes Auto-Compact on Mode Switch

## Goal

Reduce expensive prompt-cache misses caused by workflow-mode tool-set changes by optionally compacting large sessions before switching modes and sending the mode kickoff message.

## Constraints

- Mode switches currently change active tools/thinking and inject a mode-specific contract in `pi/agent/extensions/workflow-modes/index.ts`, which changes the provider request prefix.
- Pi's `ctx.compact()` is callback-based and returns immediately, so mode transition sequencing must be explicit.
- Auto-compaction can add latency and can lose raw history, so it should not run for small sessions.
- Do not surprise users by aborting an in-flight agent turn; skip pre-switch compaction unless the command context is idle.
- Use the shared config helpers in `pi/agent/extensions/_shared/config.ts` rather than inventing a one-off settings loader.
- Keep behavior public-repo safe: no private examples or environment-specific paths in docs/tests.

## Acceptance Criteria

1. With default configuration and an idle command context whose `getContextUsage().tokens` is at or above the configured threshold, `/plan`, `/execute`, and `/verify` trigger compaction before applying the new mode and before sending the kickoff message.
2. If context usage is below threshold, unknown, or the command context is not idle, mode commands keep the current immediate behavior and do not call `ctx.compact()`.
3. If pre-switch compaction succeeds, the mode switch, workflow-mode event, tool/thinking updates, and kickoff message happen after the compaction completion callback.
4. If pre-switch compaction fails, the user is notified when UI is available and the requested mode switch still proceeds without compaction.
5. Configuration can disable the feature and can change the token threshold through extension-scoped Pi settings, with optional boolean/number environment overrides if implementation stays small.
6. Unit tests cover enabled/default, disabled, below-threshold, non-idle, success sequencing, and error fallback behavior.

## Chosen Approach

Implement **threshold-gated auto-compaction, default on**.

Rationale: the cache-miss concern is valid because changing the active tool list changes the provider request prefix. However, unconditional compaction would make every mode switch slower and more lossy. A threshold keeps the optimization focused on sessions where the next cache miss is materially expensive.

Suggested config shape:

```json
{
  "extension:workflow-modes": {
    "autoCompactOnModeSwitch": true,
    "autoCompactMinTokens": 50000
  }
}
```

Implementation outline:

- Add a small workflow-modes config module or local helper that:
  - imports `getAgentDir` from `@mariozechner/pi-coding-agent` if needed,
  - reads global and project settings via `readPiSettingsFiles({ agentDir: getAgentDir(), cwd: ctx.cwd })`,
  - extracts `extension:workflow-modes` via `readExtensionSettings`,
  - merges defaults with project/global/env via `mergeExtensionConfig`,
  - normalizes invalid values back to defaults.
- Add `maybeCompactBeforeModeSwitch(ctx, targetMode)` around `ctx.compact()`:
  - return immediately if config disabled,
  - return immediately if `!ctx.isIdle()`,
  - return immediately if `ctx.getContextUsage()?.tokens` is not a number or is below threshold,
  - wrap `ctx.compact({ onComplete, onError })` in a `Promise<boolean>` so command handlers can await sequencing,
  - optionally notify UI that pre-switch compaction started/completed/failed.
- Update `transitionToMode()` so it performs pre-switch compaction before `applyMode(mode)`, `state.mode = mode`, `publishWorkflowModeState()`, and `sendKickoffMessage()`.
- Avoid compacting when re-entering the same mode unless the command would otherwise change tools/prefix. Re-entering the same mode currently does not reapply tools/thinking, so keep it out of scope unless evidence says the kickoff alone causes the same cache issue.
- Keep `/normal` out of scope initially: exiting to normal does not send a kickoff turn and does not immediately incur the same provider request cost.

## Documentation Impact

Update `pi/agent/extensions/workflow-modes/README.md`:

- Add the default pre-switch auto-compaction behavior.
- Document the extension-scoped settings keys and defaults.
- Mention skip conditions: disabled, below threshold, unknown token usage, or command invoked while the agent is not idle.

No `API.md` change is expected unless implementation exposes config or state through `api.ts`.

## Assumptions / Open Questions

- Assumption: `ctx.getContextUsage().tokens` is a good enough proxy for cache-miss cost; no provider-specific cache metrics are available in this extension.
- Assumption: default threshold of `50000` tokens is a reasonable starting point because Pi keeps about `20000` recent tokens by default after compaction.
- Open question for execution: whether to include env overrides. Use them only if they are trivial with existing helpers; extension-scoped settings are the important knob.
- Open question for execution: exact UI notification wording; keep it terse and avoid noisy notifications when compaction is skipped.

## Ordered Tasks

1. Add config loading/normalization for `workflow-modes` using shared config helpers.
2. Add tests for config defaults, settings override, invalid-value fallback, and optional env override if implemented.
3. Implement `maybeCompactBeforeModeSwitch()` with Promise-wrapped `ctx.compact()` callbacks and idle/usage/threshold gating.
4. Wire pre-switch compaction into `/plan`, `/execute`, and `/verify` command flow without changing `/normal`.
5. Extend `index.test.ts` mocks to capture compaction calls and manually drive completion/error callbacks for sequencing assertions.
6. Update `README.md` with behavior, settings, and skip conditions.
7. Run `make typecheck` and `make test`.

## Verification Checklist

- `make typecheck` passes.
- `make test` passes.
- Tests prove kickoff message is not sent until compaction completion when compaction runs.
- Tests prove error fallback still switches modes.
- Tests prove skipped compaction preserves current behavior for below-threshold/unknown/non-idle contexts.
- Documentation Impact was followed: README updated, and `API.md` left unchanged only if no public API changed.

## Known Issues / Follow-ups

- This optimizes cost after mode-switch-triggered prefix invalidation, but it does not preserve provider prompt caches across different tool sets.
- Threshold tuning may need real usage data; keep the value configurable rather than overfitting now.
- A future follow-up could add a manual `/mode-compact` or statusline hint, but that is not required for the initial feature.
