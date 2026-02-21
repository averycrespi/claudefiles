# Claude Code Orchestrator (cco)

A CLI for managing parallel [Claude Code](https://www.anthropic.com/claude-code) workspaces using Git worktrees and tmux.

## Commands

| Command               | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `cco add <branch>`    | Create a workspace (worktree + tmux window) and launch Claude Code |
| `cco rm <branch>`     | Remove a workspace (worktree + tmux window)                        |
| `cco attach [branch]` | Attach to the tmux session, optionally at a specific branch window |
| `cco notify`          | Add notification bell to tmux window for the current workspace     |
| `cco box <cmd>`       | Manage the Lima sandbox VM (create, start, stop, destroy, status, provision) |

### Usage Examples

**Start a new workspace:**

```sh
cco add feature-branch        # creates worktree + window, launches Claude Code
cco add feature-branch -a     # same, but also attaches to the window
```

**Attach to an existing session:**

```sh
cco attach                    # attach to the repo's tmux session
cco attach feature-branch     # attach directly to the feature branch window
```

**Clean up:**

```sh
cco rm feature-branch         # removes worktree + closes window (keeps the branch)
```

**Notifications (used by hooks):**

```sh
cco notify                    # adds 🔔 prefix to the tmux window name
```

## Architecture

cco is built in Go with [Cobra](https://github.com/spf13/cobra) for CLI scaffolding.

```
cmd/                    # CLI command definitions (one file per command)
├── root.go            # Root command, verbose flag
├── add.go             # cco add
├── rm.go              # cco rm
├── attach.go          # cco attach
├── notify.go          # cco notify
└── box*.go            # cco box (sandbox management)
internal/
├── lima/              # limactl wrapper: VM lifecycle operations
├── sandbox/           # Sandbox coordinator (composes lima + embedded files)
│   └── files/         # Embedded VM template and Claude configs
├── git/               # Git operations: repo detection, worktree add/remove
├── tmux/              # tmux operations: sessions, windows, send-keys
├── workspace/         # High-level workspace lifecycle (composes git + tmux)
├── paths/             # Storage paths and naming conventions
└── logging/           # Verbose/debug logging
```

Each `cmd/` file delegates to `internal/workspace`, which composes `internal/git` and `internal/tmux` to perform operations.

## How It Works

Each workspace is a combination of:
1. **Git worktree** — an independent checkout of the repository at a specific branch
2. **tmux window** — a terminal window inside a tmux session where Claude Code runs

cco uses a **dedicated tmux socket** (`cco`) so it doesn't interfere with personal tmux sessions. Use `tmux -L cco ls` to list cco sessions.

**Storage layout:**

```
~/.local/share/cco/worktrees/{repo}/{repo}-{branch}/
```

The storage path respects `$XDG_DATA_HOME` if set.

**Workspace setup:**

When `cco add` creates a new worktree, it:
1. Runs any executable setup script found at `scripts/{init,init.sh,setup,setup.sh}` in the worktree
2. Copies `.claude/settings.local.json` from the main repo to the worktree

**Idempotency:**

All commands are idempotent. Running `cco add` multiple times for the same branch is safe — it skips steps that are already done.

## Development

**Build:**

```sh
go build -o cco ./cmd/cco
```

**Run unit tests:**

```sh
go test ./... -count=1
```

**Run integration tests** (requires tmux):

```sh
go test -v -count=1 -timeout 60s
```
