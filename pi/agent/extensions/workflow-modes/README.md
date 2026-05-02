# workflow-modes

Pi extension that adds lightweight workflow modes on top of the repo's existing tools.

## What it does

- registers `/normal`, `/plan`, `/execute`, and `/verify` commands
- switches tool access only on explicit mode transitions
- applies per-mode thinking defaults only on explicit mode transitions
- publishes workflow-mode state over `pi.events` for other extensions
- injects a stable mode-specific contract into `before_agent_start`
- sends a kickoff user message on `/plan`, `/execute`, and `/verify` so the agent starts in the new mode after any configured pre-switch compaction
- compacts large idle sessions before `/plan`, `/execute`, and `/verify` mode switches to reduce expensive cache misses after the tool set changes
- provides Plan-mode-only `write_plan` and `edit_plan` tools scoped to `.plans/` at the repo root
- builds a custom compaction summary so long-running workflow sessions keep their mode and TODO context
- currently leaves `mcp_call` available in Plan and Verify mode; read-only broker filtering is deferred to a later revision

## Modes

### Normal

Restores the session's baseline tool set and baseline thinking level. No workflow prompt contract is active, and `/normal` does not send a kickoff message.

### Plan

- intended for clarification, repo reading, approach comparison, and plan authoring
- uses read-oriented tools plus `write_plan` and `edit_plan`
- defaults thinking to `medium`
- expects plan files to live under `.plans/` at the repo root
- encourages one focused question at a time, multiple-choice questions when useful, 2-3 approaches with a recommendation, testable acceptance criteria, explicit documentation-impact decisions, and YAGNI planning

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
- `## Documentation Impact`
- `## Assumptions / Open Questions`
- `## Ordered Tasks`
- `## Verification Checklist`
- `## Known Issues / Follow-ups`

`Documentation Impact` should list required docs updates or state that none are needed. The `Verification Checklist` should include checking that this documentation decision was followed.

`write_plan` creates or replaces `.plans` files. `edit_plan` applies exact text replacements to existing `.plans` files.

## Command behavior

- `/plan [context]` enters Plan mode and starts the planning process with the provided context
- `/execute [context]` enters Execute mode and starts implementation with the provided context
- `/verify [context]` enters Verify mode and starts verification with the provided context
- `/normal` exits workflow mode and restores ordinary Pi behavior

The extension does not pre-create or preselect a workflow brief. Slash-command arguments are passed through to the agent, which decides whether to read, create, or refine plan files.

## Integration API

For programmatic integration from other extensions, see [API.md](./API.md).

The extension publishes workflow-mode state changes over `pi.events` so other extensions can react without duplicating workflow state.

## Configuration

Workflow modes reads extension-scoped settings from `~/.pi/agent/settings.json` and `<project>/.pi/settings.json`:

```json
{
  "extension:workflow-modes": {
    "autoCompactOnModeSwitch": true,
    "autoCompactMinTokens": 50000
  }
}
```

`autoCompactOnModeSwitch` enables pre-switch compaction for `/plan`, `/execute`, and `/verify`. `autoCompactMinTokens` controls the context-token threshold. Project settings override global settings.

## Persistence and compaction

Workflow mode itself is in-memory session state. New or restored sessions start in Normal mode.

By default, when an idle session has at least 50,000 context tokens, `/plan`, `/execute`, and `/verify` compact before changing tools/thinking and before sending the kickoff message. Pre-switch compaction is skipped when disabled, when usage is below the threshold or unknown, or when the command is invoked while the agent is not idle. If compaction fails, the extension reports the error and continues with the requested mode switch.

During compaction, the extension summarizes the active workflow shell state instead of relying on raw conversation history. The summary preserves:

- current mode
- tactical TODO state
- next intended action

## File layout

- `index.ts` — commands, event hooks, tool gating, and plan-scoped tools
- `artifact.ts` — `.plans/` path validation and exact-text edit helpers
- `modes.ts` — tool sets, mode contracts, and thinking defaults
- `compaction.ts` — workflow-aware compaction summary helpers
- `api.ts` — curated public event contract for other extensions
- `API.md` — programmatic integration docs for the `api.ts` surface
- `types.ts` — shared local types
