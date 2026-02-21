# Worktree Path Naming Design

## Context

The orchestrator creates worktrees at `~/.local/share/cco/worktrees/{repo}/{branch}/`. The leaf directory is just the sanitized branch name (e.g. `feat-thing`), which lacks repo context. This makes it hard to identify which repo a worktree belongs to when looking at tmux window CWDs, file manager paths, or shell prompts.

## Changes

Change the worktree leaf directory from `{branch}` to `{repo}-{branch}` while keeping the repo parent directory for organizational structure.

**Before:** `~/.local/share/cco/worktrees/myapp/feat-thing/`
**After:** `~/.local/share/cco/worktrees/myapp/myapp-feat-thing/`

## Scope

- **Changed:** `WorktreeDir()` in `paths.go` — append repo prefix to leaf directory name
- **Changed:** Unit tests in `paths_test.go` — update expected paths
- **Changed:** Integration test helper `worktreeDir()` — update path construction
- **Unchanged:** `TmuxSessionName()`, `TmuxWindowName()`, `SanitizeBranch()`
- **Unchanged:** `workspace.Notify()` — still parses parent dir for repo name, unaffected

## Code Change

```go
// paths.go
func WorktreeDir(repo, branch string) string {
    name := repo + "-" + SanitizeBranch(branch)
    return filepath.Join(DataDir(), "worktrees", repo, name)
}
```

## Migration

No migration needed. Existing worktrees continue to work until removed. New worktrees use the new naming.
