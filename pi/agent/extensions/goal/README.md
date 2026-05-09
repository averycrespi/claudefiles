# Goal Extension

The goal extension keeps one branch-scoped durable objective for the current Pi session. It is a steering and persistence aid: it does not run autonomously, schedule background work, or enforce token/time budgets.

## Commands

- `/goal-show` — show the current goal, usage counters when enabled, or report that none is set.
- `/goal-set <objective>` — create or replace the current goal as active.
- `/goal-pause` — pause the current goal.
- `/goal-resume` — resume a paused or completed goal as active.
- `/goal-clear` — clear the current goal.

Objectives are trimmed, must be non-empty, and are bounded by `objectiveMaxChars`.

## Agent tools

The extension registers two tools:

- `goal_get` reads the current goal state without mutation.
- `goal_update` can only mark the current goal `complete` and requires non-empty completion evidence bounded by `evidenceMaxChars`.

Completion is intentionally conservative. Agents should call `goal_update` only after mapping every explicit requirement in the objective to concrete evidence from files, command output, tests, UI state, or other real artifacts. TODO completion, tests passing, implementation effort, a plausible final answer, or context pressure are not sufficient by themselves.

## State and persistence

Goal state is branch-scoped. The extension restores the latest valid snapshot from the active branch on session start, resume, and tree navigation.

When `showUsage` is enabled, snapshots also include observational usage counters: active elapsed time, assistant turns, and best-effort total tokens reported by Pi message usage events. Active elapsed time counts only while the goal is active; pausing stops the timer, resuming starts it again, and completion freezes it.

Snapshots are persisted through:

- custom `goal-state` entries for command-driven mutations
- tool result details for `goal_update`

There is at most one goal per active branch.

## Prompt steering

When the current goal is active and `injectActiveGoal` is enabled, each agent turn receives concise steering with:

- the user-provided objective
- a reminder to continue unless paused, blocked, or complete
- checkpoint commit guidance when `checkpointCommits` is enabled
- a completion audit checklist
- a warning that proxy signals are insufficient completion evidence

No goal context is injected when the goal is paused, complete, absent, or injection is disabled. When checkpoint guidance is enabled, the agent is told to create git commits at logical verified checkpoints, stage files by name, and never push unless explicitly asked.

## Widget

When `showWidget` is enabled and a goal exists, a compact widget appears above the editor. It shows the goal status and truncated objective. When `showUsage` is enabled, it also shows one usage line. Completed goals also show one truncated evidence line.

## Compaction

When `compactSummaryEnabled` is enabled and a goal exists, the extension provides a goal-aware custom compaction summary that preserves the objective, status, completion evidence when present, and the anti-early-completion rule.

This custom compaction behavior is intentionally not composable with other extensions that also return `session_before_compact` compaction content, including `workflow-modes`. Pi keeps one custom compaction result, so extension load order can determine which result wins when multiple compaction-providing extensions are active.

Because extension-provided compaction replaces Pi's default compaction result, default file/change tracking may not be preserved. This is an accepted v1 trade-off.

## Configuration

Settings live under `extension:goal`. Environment variables override settings.

| Field                   | Default | Environment override           | Description                                                                                                                  |
| ----------------------- | ------: | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `injectActiveGoal`      |  `true` | `GOAL_INJECT_ACTIVE_GOAL`      | Inject active goal steering into each agent turn.                                                                            |
| `showWidget`            |  `true` | `GOAL_SHOW_WIDGET`             | Show the sticky goal widget.                                                                                                 |
| `objectiveMaxChars`     |  `4000` | `GOAL_OBJECTIVE_MAX_CHARS`     | Maximum accepted goal objective length.                                                                                      |
| `evidenceMaxChars`      |  `4000` | `GOAL_EVIDENCE_MAX_CHARS`      | Maximum accepted completion evidence length.                                                                                 |
| `compactSummaryEnabled` |  `true` | `GOAL_COMPACT_SUMMARY_ENABLED` | Preserve goal state by providing a custom compaction summary. This may replace other extension/default compaction summaries. |
| `checkpointCommits`     |  `true` | `GOAL_CHECKPOINT_COMMITS`      | Tell the agent to create git commits at logical verified checkpoints while working on an active goal.                        |
| `showUsage`             |  `true` | `GOAL_SHOW_USAGE`              | Show observational active time, token, and turn counters in goal output and the widget.                                      |

Boolean environment overrides accept `1`/`true` and `0`/`false`.

Example:

```json
{
  "extension:goal": {
    "injectActiveGoal": true,
    "showWidget": true,
    "objectiveMaxChars": 4000,
    "evidenceMaxChars": 4000,
    "compactSummaryEnabled": true,
    "checkpointCommits": true,
    "showUsage": true
  }
}
```

## Logging

The extension writes no retained logs or diagnostic files. Goal objectives, usage counters, and completion evidence are persisted in Pi session history as described above.

## Prior art and v1 omissions

This extension adapts the durable objective, lifecycle controls, model-visible goal context, and conservative completion audit from Codex-style goal workflows. It includes observational time/token counters, but intentionally omits autonomous continuation, background scheduling, project-global goals, budget enforcement, budget-limited wrap-up behavior, and automatic TODO creation from goals.
