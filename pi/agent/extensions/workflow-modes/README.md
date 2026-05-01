# workflow-modes

Pi extension that adds lightweight workflow modes on top of the repo's existing tools.

## What it does

- registers `/normal`, `/plan`, `/execute`, and `/verify` commands
- tracks one active workflow brief at a time in `.plans/YYYY-MM-DD-<slug>.md`
- persists the active plan path in session state so later sessions can reopen the same workflow
- switches tool access only on explicit mode transitions
- applies per-mode thinking defaults only on explicit mode transitions
- shows a small sticky widget above the editor while Plan, Execute, or Verify mode is active
- injects a stable mode-specific contract into `before_agent_start`
- provides a Plan-mode-only `workflow_brief` tool for replacing the active workflow brief
- builds a custom compaction summary so long-running workflow sessions keep their mode, plan, TODO context, and next action
- currently leaves `mcp_call` available in Plan and Verify mode; read-only broker filtering is deferred to a later revision

## Modes

### Normal

Restores the session's baseline tool set and baseline thinking level. No workflow widget or workflow prompt contract is active.

### Plan

- intended for clarification, repo reading, approach comparison, and workflow-brief authoring
- uses read-oriented tools plus `workflow_brief`
- defaults thinking to `high`

### Execute

- intended for code changes and deterministic local execution
- uses `read`, `edit`, `write`, `bash`, and `todo`
- defaults thinking to `low`
- encourages regular commits at logical checkpoints instead of one large end-of-run commit

### Verify

- intended for deterministic checks, review, and findings capture
- stays read-mostly
- defaults thinking to `high`

## Workflow brief

The durable artifact lives in `.plans/` and uses one combined brief rather than separate design and execution documents.

Expected sections:

- `## Goal`
- `## Constraints`
- `## Acceptance Criteria`
- `## Chosen Approach`
- `## Assumptions / Open Questions`
- `## Ordered Tasks`
- `## Verification Checklist`
- `## Known Issues / Follow-ups`

`workflow_brief` validates these sections before replacing the active file.

## Command behavior

- `/plan [context]` creates, resumes, or reopens a workflow brief
- `/execute [context]` resumes or creates a workflow and enters implementation mode
- `/verify [context]` resumes or creates a workflow and enters verification mode
- `/normal` exits workflow mode but keeps the persisted active plan path so the workflow can be resumed later

If no active workflow exists and a mode command is run without arguments, the extension prompts for workflow context or a `.plans/...md` path.

## Persistence and compaction

The extension persists only the active plan path via a custom session entry. New or restored sessions start in Normal mode.

During compaction, the extension summarizes the active workflow from durable state instead of relying on raw conversation history. The summary preserves:

- current mode
- active plan path
- plan goal when available
- tactical TODO state
- recent tool outcome when useful
- next intended action

## File layout

- `index.ts` — commands, event hooks, tool gating, and state persistence
- `artifact.ts` — workflow-brief creation, loading, parsing, and validation
- `modes.ts` — tool sets, mode contracts, and thinking defaults
- `compaction.ts` — workflow-aware compaction summary helpers
- `render.ts` — sticky widget rendering
- `types.ts` — shared local types
