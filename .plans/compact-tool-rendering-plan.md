# Compact Tool Rendering in Workflow Modes

## Goal

Ensure `ls`, `find`, and `grep` render compactly when they become active through `/plan`, without duplicating compact rendering logic inside `workflow-modes`, and update `compact-tools` documentation to match current behavior.

## Constraints

- Keep `workflow-modes` focused on workflow state, tool selection, thinking defaults, and mode contracts.
- Keep tool UI presentation in `compact-tools` and shared render helpers.
- Preserve built-in tool execution behavior by continuing to delegate to Pi's `create*Tool(ctx.cwd)` implementations.
- Avoid forcing inactive tools into the active tool set during startup.
- Follow repo convention for Pi extension changes: run both `make typecheck` and `make test` before reporting completion.

## Relevant Findings

- `workflow-modes` enables `ls`, `find`, and `grep` in Plan mode via `pi/agent/extensions/workflow-modes/modes.ts`.
- `compact-tools` currently registers overrides only for tools that are active during `session_start` (`pi/agent/extensions/compact-tools/index.ts`).
- This explains the Plan-mode gap: if `ls`, `find`, or `grep` are not active in normal mode at session start, their compact renderers are never registered. Later `/plan` activation selects the built-in tools, so default rendering is used.
- Pi docs state built-in tool overrides can independently override rendering while preserving execution when the same result shape is used. They also note post-startup `registerTool()` refreshes tools immediately; the existing `compact-tools` comment already relies on post-bind registration to avoid startup force-enabling.

## Chosen Approach

Update `compact-tools` so it registers all compact overrides once after `session_start`, instead of filtering by the current active tool set. This keeps rendering concerns in the rendering extension and makes future mode/tool toggles work automatically.

Why this is better than porting renderers into `workflow-modes`:

- Avoids duplicated renderer code and divergent behavior.
- Keeps workflow modes decoupled from cosmetic TUI policy.
- Fixes any future extension/command that activates these tools later, not just `/plan`.
- Keeps `workflow-modes` tests focused on mode behavior rather than renderer registration.

## Acceptance Criteria

1. `compact-tools` registers compact overrides for `read`, `bash`, `ls`, `find`, and `grep` after `session_start` even if some are inactive at that moment.
2. `compact-tools` does not mutate the active tool list directly.
3. Entering `/plan` continues to activate `ls`, `find`, and `grep` via `workflow-modes`.
4. The compact renderers for `ls`, `find`, and `grep` are available after Plan-mode activation.
5. `pi/agent/extensions/compact-tools/README.md` accurately documents the registered tools, current result previews, and existing test coverage.
6. `make typecheck` passes.
7. `make test` passes.

## Ordered Tasks

1. Add or adjust `compact-tools` tests with a fake Pi API to prove all compact overrides register after `session_start` without calling `setActiveTools`.
2. Update `pi/agent/extensions/compact-tools/index.ts` to remove the active-tool filter and register every override once after `session_start`.
3. Update `pi/agent/extensions/compact-tools/README.md` so it matches the current code and tests.
4. If needed, add a lightweight integration-style test around `workflow-modes` + compact registration to cover the Plan-mode activation sequence.
5. Run `make typecheck`.
6. Run `make test`.

## Verification Checklist

- Inspect registered tool names in the new/updated test: `read`, `bash`, `ls`, `find`, `grep`.
- Verify no `setActiveTools` call is made by `compact-tools`.
- Verify existing `workflow-modes` Plan-mode tests still expect `ls`, `find`, and `grep` in the active tool set.
- Run `make typecheck` and `make test` from the repo root.

## Assumptions / Open Questions

- Assumption: Pi's post-`session_start` same-name `registerTool()` override does not force-enable inactive tools. This is already assumed by the current `compact-tools` implementation comment; the implementation should continue relying on post-bind registration, not factory-time registration.
- Documentation update is in scope: `compact-tools/README.md` currently says there are no unit tests and describes count-only results for some tools, while the code has `render.test.ts` and previews first few results for `ls`/`find`.

## Known Issues / Follow-ups

- If Pi later adds an explicit tool-activation event, `compact-tools` could register lazily on activation instead of registering all overrides post-startup. That is not necessary for the current bug.
