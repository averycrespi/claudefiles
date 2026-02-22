# Claude Code Orchestrator (cco)

A CLI for managing parallel [Claude Code](https://www.anthropic.com/claude-code) workspaces.

## Commands

| Command               | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `cco add <branch>`    | Add a workspace                                            |
| `cco rm <branch>`     | Remove a workspace                                         |
| `cco attach [branch]` | Attach to a window or session                              |
| `cco notify`          | Add notification to current workspace (for hooks)          |
| `cco box <cmd>`       | Manage the sandbox (create, start, stop, destroy, status, provision, shell, push, pull) |

### Usage Examples

**Start a new workspace:**

```sh
cco add feature-branch        # adds workspace, launches Claude Code
cco add feature-branch -a     # same, but also attaches to the window
```

**Attach to an existing session:**

```sh
cco attach                    # attach to the session
cco attach feature-branch     # attach to the feature branch window
```

**Clean up:**

```sh
cco rm feature-branch         # removes workspace (keeps the branch)
```

**Notifications (used by hooks):**

```sh
cco notify                    # adds notification to the current window
```

## How It Works

Each workspace is a combination of:
1. **Worktree** — an independent checkout of the repository at a specific branch
2. **Window** — a terminal window inside a session where Claude Code runs

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

## Sandbox

`cco box` manages an isolated sandbox ([Lima](https://github.com/lima-vm/lima)) for running Claude Code safely.

**Requirements:** Lima (`brew install lima`)

**Create the sandbox (first time only):**

```sh
cco box create
```

**Check status:**

```sh
cco box status
```

**Enter the sandbox:**

```sh
cco box shell
```

**Authenticate Claude Code (first time only):**

```sh
claude --dangerously-skip-permissions
```

**Stop / start the sandbox:**

```sh
cco box stop
cco box start
```

**Re-provision after updating configs:**

```sh
cco box provision
```

**Destroy the sandbox:**

```sh
cco box destroy
```

**Push a plan into the sandbox:**

```sh
cco box push .plans/2026-02-21-my-feature-plan.md
# Session a3f7b2 complete. Pull with: cco box pull a3f7b2
```

**Pull results back from the sandbox:**

```sh
cco box pull a3f7b2
```

Push creates a git bundle of your current branch, clones it inside the VM, and launches Claude interactively to execute the plan. When Claude finishes, it writes an output bundle. Pull polls for that bundle and fast-forward merges the commits back onto your branch.

Each push gets a unique session ID so multiple sessions can run in parallel.

**Note:** Push/pull requires the exchange mount. If you created your sandbox before this feature existed, recreate it: `cco box destroy && cco box create`.

The sandbox is persistent — data and installed packages survive restarts. The first boot takes several minutes to install Docker, language runtimes, and dev tools. Subsequent starts are fast.

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
