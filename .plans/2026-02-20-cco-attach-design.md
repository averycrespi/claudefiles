# Design: Enhanced `cco attach` Command

## Context

The `cco attach` command currently only attaches to the tmux session as a whole. There's no way to jump directly to a specific branch's window. Additionally, the CLI documentation doesn't match the style of other commands like `add`.

## Changes

### Command Signature

```
cco attach [branch]
```

- **No args**: Attach to the tmux session (current behavior, with auto-init)
- **With branch**: Attach to the session at the specific window for that branch

### Behavior

1. Get repo info (detect main repo vs worktree)
2. Derive session name
3. **Auto-init** (main repo only): If session doesn't exist, run `Init(path)` to create it. From a worktree, error as before.
4. If branch is provided:
   - Sanitize branch name to get window name (using `paths.TmuxWindowName`)
   - Check if window exists (with bell prefix support via `tmux.WindowExists`)
   - If not found, error: `"tmux window does not exist for branch: %s"`
   - Get actual window name (handles bell prefix) via `tmux.ActualWindowName`
   - Attach to `session:actualWindowName`
5. If no branch, attach to session as today

### Tmux Changes

Add `AttachToWindow(session, window string) error` in `tmux/tmux.go`. Same `switch-client` vs `attach-session` logic as `Attach`, but targets `session:window`.

### CLI Documentation

```go
Use:   "attach [branch]",
Short: "Attach to the tmux session, optionally at a specific branch window",
Long:  `Attach to (or switch to) the worktree session.

If a branch is provided, attach directly to that branch's window.
If no branch is provided, attach to the session as-is.

This command will create the tmux session if it doesn't exist yet.
Works from both the main repository and worktrees.`,
Args:  cobra.MaximumNArgs(1),
```

### Files to Change

- `orchestrator/cmd/attach.go` — Update command definition, pass optional branch arg
- `orchestrator/internal/session/session.go` — Update `Attach` to accept optional branch, add window targeting logic
- `orchestrator/internal/tmux/tmux.go` — Add `AttachToWindow` function
- `orchestrator/cmd/cco/integration_test.go` — Add test for attach with branch
