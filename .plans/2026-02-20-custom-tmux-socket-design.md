# Custom Tmux Socket for cco

## Context

The `cco` orchestrator currently uses tmux's default socket for all operations. This means cco-managed sessions (worktrees, Claude Code windows) share a tmux server with the user's personal tmux sessions. This can cause interference — accidental kills, confusing `tmux ls` output, and name collisions.

## Design

### Socket Configuration

Use a dedicated named socket `cco` for all tmux operations. Every tmux command will include `-L cco` as the first arguments, directing tmux to use a separate server at `/tmp/tmux-<uid>/cco`.

A helper function replaces all direct `exec.Command("tmux", ...)` calls:

```go
const socketName = "cco"

func tmuxCmd(args ...string) *exec.Cmd {
    fullArgs := append([]string{"-L", socketName}, args...)
    return exec.Command("tmux", fullArgs...)
}
```

### Attach Behavior

The attach logic changes from checking `$TMUX` (any tmux) to checking whether the user is inside the cco socket specifically:

- **Inside the cco socket** (detected by checking if `$TMUX` contains the cco socket path): Use `switch-client -L cco -t <target>`
- **Anywhere else** (no tmux, or inside personal tmux): Use `attach-session -L cco -t <target>`

Users inside their personal tmux will need to detach first before attaching to the cco server. This is standard tmux cross-server behavior.

### Scope

**Changes:**
- `orchestrator/internal/tmux/tmux.go` — Add socket constant, `tmuxCmd` helper, update all command invocations, update attach detection logic
- `orchestrator/internal/tmux/tmux_test.go` — Update tests for `-L cco` flag

**No changes to:** `cmd/`, `session/`, `git/`, `paths/`, `logging/`, or the `cwm` Python script.

### User-Facing Impact

- `tmux ls` (default socket) no longer shows cco sessions
- `tmux -L cco ls` shows only cco sessions
- Running `cco attach` from inside personal tmux requires detaching first
- No migration needed — cco will create new sessions on the cco socket; old sessions on the default socket can be manually killed
