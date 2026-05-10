# Pi Extension Config Commands Plan

## Goal

Add a consistent `/EXTENSION-NAME-config` slash command for every Pi extension with user-facing config so users can inspect the current effective config with sensitive values obscured.

## Constraints

- Keep changes scoped to Pi extension source under `pi/agent/extensions/` and repository guidance in `CLAUDE.md`.
- Use the existing shared config module at `pi/agent/extensions/_shared/config.ts`; do not hand-roll per-extension command formatting.
- Commands should display effective parsed runtime config only, not source/provenance metadata.
- Sensitive values must be masked before display or test assertions expose them.
- Maintain existing config precedence: defaults < global settings < project settings < environment overrides.
- Preserve current extension behavior and command names; only add new `*-config` commands.
- Before reporting a Pi extension change complete, run both `make typecheck` and `make test`.

## Acceptance Criteria

- AC-1: `pi/agent/extensions/_shared/config.ts` exposes a reusable helper for registering config-display commands and masking sensitive config fields.
- AC-2: The configured extensions `goal`, `mcp-broker`, `web-access`, and `workflow-modes` each register a slash command named `/goal-config`, `/mcp-broker-config`, `/web-access-config`, and `/workflow-modes-config` respectively.
- AC-3: Each command displays the effective parsed config returned by that extension's existing loader, with no source/provenance metadata.
- AC-4: Sensitive fields are obscured in command output, including `mcp-broker.authToken`, `web-access.tavilyApiKey`, and `web-access.jinaApiKey`; unset sensitive values remain visibly unset rather than misleadingly masked.
- AC-5: Unit tests cover the shared formatter/masking helper and at least one command registration/invocation path per configured extension.
- AC-6: `CLAUDE.md` documents the convention that every Pi extension with user-facing config should expose `/EXTENSION-NAME-config` using the shared helper and declare sensitive fields.

## Chosen Approach

Add a small shared command helper in `_shared/config.ts` that accepts an extension name, a config loader, and optional sensitive field names, then registers `/EXTENSION-NAME-config` with `pi.registerCommand`. The helper will format a stable JSON block (or compact key/value text if simpler in existing UI tests) and call `ctx.ui.notify(...)` with masked values. This centralizes the convention while letting each extension keep its existing parsing and validation logic.

Key trade-off: this avoids source/provenance reporting, so it is less diagnostic than a full config inspector, but it is much smaller and directly matches the selected requirement: effective values only.

## Documentation Impact

- Update `CLAUDE.md` under Pi Extension Conventions with the config-command convention.
- Update `pi/agent/extensions/_shared/README.md` to mention the new config command helper.
- Update README command/config sections for `goal`, `mcp-broker`, `web-access`, and `workflow-modes` only if the command is user-facing enough that users should discover it there; otherwise note in final report why central convention docs are sufficient.

## Assumptions / Open Questions

- Q1: Output should show effective values only. Status: resolved by user selection.
- Q2: Masking should be field-name based by each caller's explicit `sensitiveFields` list, not broad heuristics. Status: assumed to avoid accidentally masking non-sensitive display fields or missing renamed secrets silently.
- Q3: `ctx.ui.notify` is acceptable for command output. Status: assumed because existing commands use notifications for short status output; if implementation finds long workflow config output is too noisy, use a newline-formatted notification rather than custom UI.

## Ordered Tasks

### T1: Add shared config command helper

Covers: AC-1, AC-3, AC-4

- Extend `pi/agent/extensions/_shared/config.ts` with a helper such as `registerConfigCommand(pi, { extensionName, loadConfig, sensitiveFields })`.
- Add pure helper(s) for masking and formatting config values so behavior is unit-testable without Pi UI.
- Represent `undefined`/unset values clearly, and recursively or top-level mask fields according to the simplest shape needed by current configs.

### T2: Test shared formatting and masking

Covers: AC-1, AC-4, AC-5

- Add tests in `pi/agent/extensions/_shared/config.test.ts` for ordinary values, unset values, and sensitive string masking.
- Ensure masked output does not include original secret substrings.

### T3: Register commands in configured extensions

Covers: AC-2, AC-3, AC-4

- Add `/goal-config` in `pi/agent/extensions/goal/index.ts` using `loadGoalConfig(ctx.cwd)` and no sensitive fields.
- Add `/mcp-broker-config` in `pi/agent/extensions/mcp-broker/index.ts` using `loadMcpBrokerConfig(ctx.cwd)` and `authToken` as sensitive.
- Add `/web-access-config` in `pi/agent/extensions/web-access/index.ts` using `loadWebAccessConfig(ctx.cwd)` and `tavilyApiKey`, `jinaApiKey` as sensitive.
- Add `/workflow-modes-config` in `pi/agent/extensions/workflow-modes/index.ts` using existing `loadConfig(ctx.cwd)` and no sensitive fields.

### T4: Add command path tests

Covers: AC-2, AC-3, AC-4, AC-5

- Extend each extension's existing `index.test.ts` where present to assert the new command is registered and invokes the expected loader.
- For `mcp-broker` and `web-access`, assert command output masks configured secrets.
- If an extension currently lacks a command-test harness, add the smallest local fake `ExtensionAPI`/`ctx.ui.notify` harness consistent with existing tests.

### T5: Document the convention

Covers: AC-6

- Update `CLAUDE.md` Pi Extension Conventions with a concise bullet requiring `/EXTENSION-NAME-config` for extensions with user-facing config, implemented via `_shared/config.ts`, with explicit sensitive-field masking.
- Update `_shared/README.md` module description for `config.ts` to include config command registration/formatting.
- Consider adding one sentence to each affected extension README's Configuration section listing the new command.

### T6: Verify

Covers: all ACs

- Run `make typecheck`.
- Run `make test`.
- If docs were updated, quickly inspect relevant markdown for public-repo safety and no secrets.

## Verification Checklist

- [ ] V1: Unit tests pass for shared masking/formatting helper.
- [ ] V2: Tests confirm `/goal-config`, `/mcp-broker-config`, `/web-access-config`, and `/workflow-modes-config` are registered.
- [ ] V3: Tests confirm sensitive configured values do not appear in command output.
- [ ] V4: `make typecheck` passes.
- [ ] V5: `make test` passes.
- [ ] V6: Confirm Documentation Impact was followed: `CLAUDE.md` and `_shared/README.md` updated, and affected extension READMEs updated or explicitly deemed unnecessary.

## Known Issues / Follow-ups

- None known.
