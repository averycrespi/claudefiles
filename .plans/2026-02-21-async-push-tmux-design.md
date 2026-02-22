# Async Push with Tmux Pane Splitting

## Context

`box push` currently runs Claude Code synchronously in the caller's terminal, blocking until Claude finishes. This makes it hard to wire up with other tools. `box pull` polls for the output bundle and merges it.

## Changes

### `box push` becomes non-blocking

Instead of running Claude interactively in the current terminal, push splits the workspace's tmux window and launches Claude in the new pane.

**Revised flow:**

1. Verify sandbox VM is running
2. Look up the workspace: derive tmux session from repo name, tmux window from current branch
3. **Fail fast** if the tmux session or window doesn't exist (user must `cco add` first)
4. Generate session ID, create exchange dir, create git bundle, clone inside VM (same as today)
5. Split the workspace window pane horizontally (left/right)
6. Set the new pane's title to the session ID
7. Send the `limactl shell ... claude ...` command to the new pane via `tmux send-keys`
8. Print the session ID and return immediately

### `box pull` cleans up the pane

**Revised flow:**

1. Poll for `output.bundle` (same as today)
2. Verify, fetch, fast-forward merge (same as today)
3. Find the tmux pane with title matching the session ID
4. Kill that pane (handle "not found" gracefully -- pane may have been closed manually)
5. Clean up exchange dir (same as today)

## Refactoring `sandbox.Push`

The current `Push` method does everything in one blocking call. Split it:

**`Prepare(repoRoot, planPath string) (PreparedSession, error)`:**
- Guard check (VM running)
- Get current branch
- Generate session ID
- Create exchange dir, bundle, clone inside VM
- Return `PreparedSession{SessionID, Command}` where `Command` is the full `limactl shell ...` string

The command layer (`box_push.go`) then handles tmux orchestration:
1. Call `sandbox.Prepare(cwd, planPath)` to get `PreparedSession`
2. Look up workspace tmux session + window
3. Split pane, set title, send keys
4. Print session ID

## Workspace Lookup

`box push` derives the tmux target from the current directory:

1. `git.RepoInfo(cwd)` -> repo name
2. `git rev-parse --abbrev-ref HEAD` -> branch
3. `paths.TmuxSessionName(repoName)` -> tmux session
4. `paths.TmuxWindowName(branch)` -> tmux window
5. Verify session exists, verify window exists -- error if either is missing

This means `box push` requires the user to have already run `cco add <branch>`.

## New Tmux Client Methods

The tmux client needs pane-level operations:

| Method | tmux command | Purpose |
|--------|-------------|---------|
| `SplitWindow(session, window)` | `split-window -h -t <target> -d -P -F "#{pane_id}"` | Split horizontally, return new pane ID |
| `SelectLayout(session, window, layout)` | `select-layout -t <target> even-horizontal` | Ensure clean 50/50 split |
| `SetPaneTitle(paneID, title)` | `select-pane -t <paneID> -T <title>` | Set pane title to session ID |
| `SendKeysToPane(paneID, command)` | `send-keys -t <paneID> <command> C-m` | Send command to specific pane |
| `FindPaneByTitle(session, title)` | `list-panes -s -t <session> -F "#{pane_id} #{pane_title}"` | Find pane by title |
| `KillPane(paneID)` | `kill-pane -t <paneID>` | Kill a specific pane |

## Wiring Changes

`box_push.go` and `box_pull.go` need access to both the sandbox service and the tmux client. Update `wire.go` to provide the tmux client to the box commands. The sandbox service itself stays unchanged (no tmux dependency).

## Error Cases (Fail Fast)

- Sandbox VM not running -> error
- No tmux session for repo -> `"No workspace found. Run 'cco add <branch>' first."`
- No tmux window for branch -> `"No workspace window for branch '<branch>'. Run 'cco add <branch>' first."`
- Pane not found during pull -> warn but continue (pane may have been closed manually)
