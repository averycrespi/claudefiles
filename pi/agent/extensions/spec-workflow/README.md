# Spec Workflow

Spec Workflow is a Pi extension for durable, artifact-backed implementation flows. It keeps human-readable spec files under `.specs/<slug>/` and compiles them into `runtime.json` for phase execution.

This first implementation slice provides the extension scaffold, configuration loading, safe artifact path helpers, and the markdown-to-runtime compiler.

## Commands

- `/spec-plan <slug>` starts or resumes a spec draft.
- `/spec-approve` approves compiled artifacts for execution.
- `/spec-execute` executes the active approved spec.
- `/spec-verify` verifies the active spec.
- `/spec-report` writes the final report.
- `/spec-status` shows active status.
- `/spec-abort` cancels without deleting artifacts.

## Configuration

Settings live under `extension:spec-workflow`. Environment variables override settings.

| Field                      | Default  | Environment override                         | Description                                                                                  |
| -------------------------- | -------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `enabled`                  | `true`   | `SPEC_WORKFLOW_ENABLED`                      | Enable command prompt injection.                                                             |
| `showWidget`               | `true`   | `SPEC_WORKFLOW_SHOW_WIDGET`                  | Show the status widget when implemented.                                                     |
| `autoChallenge`            | `true`   | `SPEC_WORKFLOW_AUTO_CHALLENGE`               | Run challenge review before approval.                                                        |
| `maxFixRounds`             | `2`      | `SPEC_WORKFLOW_MAX_FIX_ROUNDS`               | Maximum verify-to-fix rounds.                                                                |
| `autoCommitTasks`          | `true`   | `SPEC_WORKFLOW_AUTO_COMMIT_TASKS`            | Commit each validated task/fix batch when true; otherwise record skipped-commit checkpoints. |
| `autoCompactOnPhaseChange` | `true`   | `SPEC_WORKFLOW_AUTO_COMPACT_ON_PHASE_CHANGE` | Compact before large phase transitions.                                                      |
| `autoCompactMinTokens`     | `50000`  | `SPEC_WORKFLOW_AUTO_COMPACT_MIN_TOKENS`      | Token threshold for phase-change compaction.                                                 |
| `planThinkingLevel`        | `medium` | `SPEC_WORKFLOW_PLAN_THINKING_LEVEL`          | Thinking level for planning phases.                                                          |
| `executeThinkingLevel`     | `low`    | `SPEC_WORKFLOW_EXECUTE_THINKING_LEVEL`       | Thinking level for execution phases.                                                         |
| `verifyThinkingLevel`      | `high`   | `SPEC_WORKFLOW_VERIFY_THINKING_LEVEL`        | Thinking level for verification phases.                                                      |

```json
{
  "extension:spec-workflow": {
    "autoCommitTasks": false,
    "maxFixRounds": 2
  }
}
```

Boolean environment overrides accept `1`/`true` and `0`/`false`.

## Artifacts and local state

Specs are local-only by default under `.specs/<slug>/`. The extension updates `.git/info/exclude` rather than tracked `.gitignore` so `.specs/` is not intended for commit.

## Logging

This slice does not write retained diagnostic logs. Runtime artifacts may contain command names, validation summaries, and report evidence once later phases are implemented.
