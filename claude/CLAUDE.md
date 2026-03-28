# CLAUDE.md

## Conventional Commits

Use conventional commits: `<type>(<optional scope>): <description>`. Types: feat, fix, chore, docs, refactor, test. Imperative mood, under 50 chars, no trailing period. Breaking changes: `feat!: ...`

## Asking Questions

- **Decisions (2-4 options):** Use `AskUserQuestion` with recommendation labeled "(Recommended)"
- **Open-ended/yes-no:** Ask in plain text
- One question per message. Don't ask what you can figure out from files or git history.

## Pull Request Descriptions

Title under 70 chars: `TICKET-123: description` or conventional commit format. Body sections: Context (why), Changes (by concept, not file), Review Notes (if non-obvious), Test Plan (checklist). Explain *why* not *how*. Be specific, not vague.

## Git Worktree Rules

In a worktree, **all git operations target the worktree, never the main repo**. Use `git -C <worktree-path>` if needed — never point it at the main repo. Do not `cd` to the main repo to run git. Verify with `git rev-parse --show-toplevel`.

## MCP Usage

**Delegate to a subagent** any MCP call that returns verbose output: searches, log/span queries, multi-step lookups (2+ calls). The subagent should return a concise summary, not raw output.

**OK to call directly:** single-resource lookups (`getJiraIssue`, `get_datadog_metric`, `get_datadog_incident`) when you need one field.
