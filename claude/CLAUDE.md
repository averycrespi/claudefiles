# CLAUDE.md

## Conventional Commits

Use conventional commits: `<type>(<optional scope>): <description>`. Types: feat, fix, chore, docs, refactor, test. Imperative mood, under 50 chars, no trailing period. Breaking changes: `feat!: ...`

## Asking Questions

- **Decisions (2-4 options):** Use `AskUserQuestion` with recommendation labeled "(Recommended)"
- **Open-ended/yes-no:** Ask in plain text
- One question per message. Don't ask what you can figure out from files or git history.

## Pull Request Descriptions

Title under 70 chars: `TICKET-123: description` or conventional commit format. Body sections: Context (why), Changes (by concept, not file), Review Notes (if non-obvious), Test Plan (checklist). Explain _why_ not _how_. Be specific, not vague.

## Git Worktree Rules

In a worktree, **all git operations target the worktree, never the main repo**. Use `git -C <worktree-path>` if needed — never point it at the main repo. Do not `cd` to the main repo to run git. Verify with `git rev-parse --show-toplevel`.

## Sorting

When sorting items alphabetically or numerically, always use `sort` (or equivalent shell command) — never sort by hand or from memory.

## MCP Usage

**Delegate to a subagent** any MCP call that returns verbose output: searches, multi-step lookups (2+ calls). The subagent should return a concise summary, not raw output.
