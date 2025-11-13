# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) across all projects.

## Safe commands

### Safe Git Commands

- ALWAYS use `safe-git-commit "message"` instead of `git commit`
- ALWAYS use `safe-git-push` instead of `git push`
- ALWAYS use `safe-gh-pr-create "title" "body"` instead of `git pr create`
- These safe Git and GitHub commands do not accept any other flags or arguments
