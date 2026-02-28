# Claude Code Orchestrator

Run multiple [Claude Code](https://www.anthropic.com/claude-code) sessions in parallel. Each session gets its own Git worktree and tmux window, so they don't interfere with each other or your main working tree.

```
┌─────────────────────────────────────────────────┐
│ tmux session (cco)                              │
│                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ feature-a   │ │ feature-b   │ │ bugfix-c  │ │
│  │             │ │             │ │           │ │
│  │ claude code │ │ claude code │ │ claude .. │ │
│  │ running ... │ │ running ... │ │ running . │ │
│  │             │ │             │ │           │ │
│  └──────┬──────┘ └──────┬──────┘ └─────┬─────┘ │
│         │               │              │        │
└─────────┼───────────────┼──────────────┼────────┘
          │               │              │
          ▼               ▼              ▼
     worktree/       worktree/      worktree/
     feature-a       feature-b      bugfix-c
```

## Why cco?

- **Parallel sessions** — run multiple Claude Code instances without conflicts
- **Isolated worktrees** — each session gets its own checkout, so no merge conflicts or dirty state
- **Dedicated tmux socket** — cco uses its own socket (`cco`) and never touches your personal tmux sessions
- **Sandbox mode** — optionally run plans in an isolated VM for autonomous execution

## Quick Start

**Install:**

```sh
cd orchestrator && go install ./cmd/cco
```

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

**Create a workspace and start working:**

```sh
cco add feature-branch        # create worktree + tmux window, launch Claude Code
cco attach feature-branch     # switch to the window
cco rm feature-branch         # clean up when done (keeps the branch)
```

Each workspace is a worktree at `~/.local/share/cco/worktrees/` and a tmux window in the `cco` session. Use `tmux -L cco ls` to inspect directly.

## Commands

| Command               | Purpose                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `cco add <branch>`    | Add a workspace (worktree + tmux window)                                   |
| `cco rm <branch>`     | Remove a workspace (`-d` deletes branch, `-D` force-deletes)              |
| `cco attach [branch]` | Attach to a window or session                                             |
| `cco notify`          | Add notification to current workspace (for hooks)                          |
| `cco config <cmd>`    | Manage configuration (`path`, `show`, `init`, `edit`)                     |
| `cco box <cmd>`       | Manage the [sandbox](docs/sandbox.md) VM                                  |

## Sandbox

cco can run plans in an isolated [Lima](https://github.com/lima-vm/lima) VM for autonomous execution without risking your host environment. Push a plan in, let Claude work, pull the results back.

```sh
cco box create                                    # one-time setup
cco box push .plans/2026-02-21-my-feature-plan.md  # run a plan
cco box pull a3f7b2                                # pull results back
```

See [docs/sandbox.md](docs/sandbox.md) for setup, lifecycle management, and push/pull details.

## Configuration

cco uses a JSON config file at `~/.config/cco/config.json` (respects `$XDG_CONFIG_HOME`).

```sh
cco config show     # print current config
cco config edit     # open in $EDITOR (creates defaults if needed)
```

See [docs/configuration.md](docs/configuration.md) for available settings.

## Development

**Build:**

```sh
go build -o cco ./cmd/cco
```

**Unit tests:**

```sh
go test ./... -count=1
```

**Integration tests** (requires tmux):

```sh
go test -v -count=1 -timeout 60s
```
