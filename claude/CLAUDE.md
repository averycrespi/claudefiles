# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) across all projects.

## Safe Git Commands

ALWAYS use these safe Git commands insated of the base Git commands:

- Use `safe-git-commit "message"` instead of `git commit`
- Use `safe-git-push` instead of `git push`
- Use `safe-gh-pr-create "title" "body"` instead of `gh pr create`

NEVER using the following commands directly:

- `git commit`: Use `safe-git-commit "message"` instead
- `git push`: Use `safe-git-push` instead
- `gh pr create` Use `safe-gh-pr-create "title" "body"` instead

These safe Git commands do NOT accept any other flags, options, or parameters. For example:

- You CANNOT use `safe-git-commit --no-verify` to skip failing Git hooks.
- You CANNOT use `safe-git-push --force` to force push.
- You CANNOT use `safe-gh-pr-create --fill` to autofill the title and body.
