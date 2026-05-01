# workflow-modes

Pi extension that adds lightweight workflow modes on top of the repo's existing tools.

## What it does

- registers `/normal`, `/plan`, `/execute`, and `/verify` commands
- switches tool access only on explicit mode transitions
- applies per-mode thinking defaults only on explicit mode transitions
- shows a small sticky widget above the editor while Plan, Execute, or Verify mode is active
- injects a stable mode-specific contract into `before_agent_start`
- immediately sends a kickoff user message on `/plan`, `/execute`, and `/verify` so the agent starts in the new mode
- provides Plan-mode-only `write_plan` and `edit_plan` tools scoped to `.plans/` at the repo root
- builds a custom compaction summary so long-running workflow sessions keep their mode and TODO context
- currently leaves `mcp_call` available in Plan and Verify mode; read-only broker filtering is deferred to a later revision

## Modes

### Normal

Restores the session's baseline tool set and baseline thinking level. No workflow widget or workflow prompt contract is active, and `/normal` does not send a kickoff message.

### Plan

- intended for clarification, repo reading, approach comparison, and plan authoring
- uses read-oriented tools plus `write_plan` and `edit_plan`
- defaults thinking to `high`
- expects plan files to live under `.plans/` at the repo root

### Execute

- intended for code changes and deterministic local execution
- uses `read`, `edit`, `write`, `bash`, and `todo`
- defaults thinking to `low`
- encourages regular commits at logical checkpoints instead of one large end-of-run commit

### Verify

- intended for deterministic checks, review, and findings capture
- stays read-mostly
- defaults thinking to `high`

## Plan files

Plan files are ordinary markdown files stored under `.plans/` in the repo root.

The Plan-mode contract tells the agent to usually include sections like:

- `## Goal`
- `## Constraints`
- `## Acceptance Criteria`
- `## Chosen Approach`
- `## Assumptions / Open Questions`
- `## Ordered Tasks`
- `## Verification Checklist`
- `## Known Issues / Follow-ups`

`write_plan` creates or replaces `.plans` files. `edit_plan` applies exact text replacements to existing `.plans` files.

## Command behavior

- `/plan [context]` enters Plan mode and immediately starts the planning process with the provided context
- `/execute [context]` enters Execute mode and immediately starts implementation with the provided context
- `/verify [context]` enters Verify mode and immediately starts verification with the provided context
- `/normal` exits workflow mode and restores ordinary Pi behavior

The extension does not pre-create or preselect a workflow brief. Slash-command arguments are passed through to the agent, which decides whether to read, create, or refine plan files.

## Persistence and compaction

Workflow mode itself is in-memory session state. New or restored sessions start in Normal mode.

During compaction, the extension summarizes the active workflow shell state instead of relying on raw conversation history. The summary preserves:

- current mode
- tactical TODO state
- next intended action

## File layout

- `index.ts` — commands, event hooks, tool gating, and plan-scoped tools
- `artifact.ts` — `.plans/` path validation and exact-text edit helpers
- `modes.ts` — tool sets, mode contracts, and thinking defaults
- `compaction.ts` — workflow-aware compaction summary helpers
- `render.ts` — sticky widget rendering
- `types.ts` — shared local types
