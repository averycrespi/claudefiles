# Claude Code Orchestrator

Run multiple [Claude Code](https://www.anthropic.com/claude-code) sessions in parallel. Each session gets its own Git worktree and tmux window, so they don't interfere with each other or your main working tree. Optionally, run plans in an isolated sandbox VM.

## How It Works

Each workspace is a combination of:

1. **Worktree** — an independent checkout of the repository at a specific branch
2. **Window** — a tmux window where Claude Code runs

cco uses a **dedicated tmux socket** (`cco`) so it doesn't interfere with personal tmux sessions. Use `tmux -L cco ls` to inspect sessions directly.

**Storage layout:**

```
~/.local/share/cco/worktrees/{repo}/{repo}-{branch}/
```

The storage path respects `$XDG_DATA_HOME` if set.

## Getting Started

**Enable tab completion (optional):**

```sh
# Bash
source <(cco completion bash)

# Zsh
source <(cco completion zsh)

# Fish
cco completion fish | source
```

Add the appropriate line to your shell's rc file to enable it permanently.

**Create a workspace and launch Claude Code:**

```sh
cco add feature-branch        # creates worktree + tmux window, launches Claude Code
cco add feature-branch -a     # same, but also attaches to the window
```

**Switch to an existing workspace:**

```sh
cco attach                    # attach to the cco session
cco attach feature-branch     # attach to a specific window
```

**Clean up when done:**

```sh
cco rm feature-branch         # removes worktree and window (keeps the branch)
cco rm -d feature-branch      # also deletes the branch
cco rm -D feature-branch      # also force-deletes the branch
```

## Commands

| Command               | Purpose                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| `cco add <branch>`    | Add a workspace                                                                         |
| `cco rm <branch>`     | Remove a workspace (keeps branch; `-d` deletes branch, `-D` force-deletes)              |
| `cco attach [branch]` | Attach to a window or session                                                           |
| `cco notify`          | Add notification to current workspace (for hooks)                                       |
| `cco box <cmd>`       | Manage the sandbox (create, start, stop, destroy, status, provision, shell, push, pull) |

## Sandbox

`cco box` manages an isolated [Lima](https://github.com/lima-vm/lima) VM for running Claude Code safely. This is useful for executing plans autonomously without risking your host environment.

The sandbox is persistent — data and installed packages survive restarts. The first boot takes several minutes to install Docker, language runtimes, and dev tools. Subsequent starts are fast.

**Requirements:** Lima (`brew install lima`)

### Lifecycle

**Create the sandbox (first time only):**

```sh
cco box create
```

**Authenticate Claude Code (first time only):**

```sh
cco box shell
claude --dangerously-skip-permissions
```

**Start / stop / destroy:**

```sh
cco box start
cco box stop
cco box destroy
```

**Re-provision after updating configs:**

```sh
cco box provision
```

**Check status:**

```sh
cco box status
```

### Push / Pull

Push a plan into the sandbox for autonomous execution, then pull the results back:

```sh
cco box push .plans/2026-02-21-my-feature-plan.md
# Job a3f7b2 started. Pull with: cco box pull a3f7b2

cco box pull a3f7b2
```

Push requires a workspace (`cco add <branch>`) for the current branch. It creates a git bundle, clones it inside the VM, and launches Claude in a split tmux pane to execute the plan. Push returns immediately — Claude runs in the background pane. When Claude finishes, it writes an output bundle. Pull polls for that bundle, fast-forward merges the commits back onto your branch, and closes the sandbox pane.

Each push gets a unique job ID so multiple jobs can run in parallel.

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
