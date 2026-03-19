# Claude Code Orchestrator

Run multiple [Claude Code](https://www.anthropic.com/claude-code) sessions in parallel. Each session gets its own Git worktree and tmux window, so they don't interfere with each other or your main working tree.

```
┌───────────────────────────────────────────────────────┐
│ tmux session (cco-$repo)                              │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ feature-a   │  │ feature-b   │  │ bugfix-c    │    │
│  │             │  │             │  │             │    │
│  │ claude code │  │ claude code │  │ claude code │    │
│  │ running ... │  │ running ... │  │ running ... │    │
│  │             │  │             │  │             │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │           │
└─────────┼────────────────┼────────────────┼───────────┘
          │                │                │
          ▼                ▼                ▼
     worktree/        worktree/        worktree/
     feature-a        feature-b        bugfix-c
```

## Why cco?

- **Parallel sessions** — run multiple Claude Code instances without conflicts
- **Isolated worktrees** — each session gets its own checkout, so no merge conflicts or dirty state
- **Dedicated tmux socket** — cco uses its own socket (`cco`) and never touches your personal tmux sessions
- **Sandbox mode** — optionally run plans in an isolated VM for autonomous execution

## Quick Start

**Install:**

```sh
cd cco && go install .
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

| Command               | Purpose                                           |
| --------------------- | ------------------------------------------------- |
| `cco add <branch>`    | Add a workspace                                   |
| `cco rm <branch>`     | Remove a workspace                                |
| `cco attach [branch]` | Attach to a window or session                     |
| `cco notify`          | Add notification to current workspace (for hooks) |
| `cco config <cmd>`    | Manage cco [configuration](docs/configuration.md) |
| `cco box <cmd>`       | Manage the [sandbox](docs/sandbox.md)             |

## Sandbox

cco can run Claude Code in an isolated Lima VM for autonomous execution without risking your host environment.

```sh
cco box create    # one-time setup
cco box shell     # open an interactive session
```

See [docs/sandbox.md](docs/sandbox.md) for setup and lifecycle management.

## Configuration

cco uses a JSON config file at `~/.config/cco/config.json` (respects `$XDG_CONFIG_HOME`).

```sh
cco config edit     # open in $EDITOR (creates default config if missing)
```

See [docs/configuration.md](docs/configuration.md) for available settings.

## Development

**Build:**

```sh
go build -o cco .
```

**Unit tests:**

```sh
go test ./... -count=1
```

**Integration tests** (requires tmux):

```sh
go test -v -count=1 -timeout 60s
```
