# Design: Rename "session" to "workspace"

## Context

The cco orchestrator currently calls its core unit a "session" — a bundle of a git branch, a git worktree, and a tmux window. This conflicts with tmux's own use of "session" to mean a top-level container of windows. The rename clarifies terminology by using "workspace" for the conceptual unit.

## Changes

### Terminology mapping

| Concept | Before | After |
|---------|--------|-------|
| Conceptual unit (branch + worktree + window) | "session" | **"workspace"** |
| XDG data directory | `~/.local/share/cco/sessions/{repo}/{branch}/` | `~/.local/share/cco/worktrees/{repo}/{branch}/` |
| Tmux session name | `{repo}-worktree` | `cco-{repo}` |

### Code changes

- Rename `internal/session/` package to `internal/workspace/`
- Rename exported functions: `session.Add()` → `workspace.Add()`, `session.Remove()` → `workspace.Remove()`, etc.
- Rename `paths.SessionDir()` to `paths.WorktreeDir()`
- Update `paths.TmuxSessionName()` to return `cco-{repo}` instead of `{repo}-worktree`
- Update all CLI command descriptions (e.g. "Create a workspace and launch Claude Code")
- Update root command description: "manage parallel Claude Code workspaces"
- Update integration tests to match new paths, names, and package imports
- Update README.md and CLAUDE.md

### What doesn't change

- CLI command names (`cco add`, `cco rm`, `cco attach`, `cco notify`)
- The `cwm` legacy script (separate concern)
- Overall behavior and logic

### Migration

No migration of existing data. Users recreate workspaces with `cco add`. The old `~/.local/share/cco/sessions/` directory can be manually deleted.
