# README Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Rewrite the orchestrator README as a concise landing page, splitting detailed sandbox and configuration docs into `orchestrator/docs/`.

**Architecture:** Extract sandbox and configuration content from README into dedicated doc files. Rewrite README with new structure: value prop, ASCII diagram, quick start, command table, teasers with links, inline development section.

**Tech Stack:** Markdown

---

### Task 1: Create docs/sandbox.md

**Files:**
- Create: `orchestrator/docs/sandbox.md`

**Step 1: Create the sandbox documentation**

Create `orchestrator/docs/sandbox.md` with the full sandbox content extracted from the current README:

```markdown
# Sandbox

`cco box` manages an isolated [Lima](https://github.com/lima-vm/lima) VM for running Claude Code safely. This is useful for executing plans autonomously without risking your host environment.

The sandbox is persistent — data and installed packages survive restarts. The first boot takes several minutes to install Docker, language runtimes, and dev tools. Subsequent starts are fast.

**Requirements:** Lima (`brew install lima`)

## Setup

**Create the sandbox (first time only):**

```sh
cco box create
```

**Authenticate Claude Code (first time only):**

```sh
cco box shell
claude --dangerously-skip-permissions
```

## Lifecycle

```sh
cco box start       # start the VM
cco box stop        # stop the VM
cco box destroy     # remove the VM entirely
cco box status      # check VM status
cco box provision   # re-provision after updating configs
```

## Push / Pull

Push a plan into the sandbox for autonomous execution, then pull the results back:

```sh
cco box push .plans/2026-02-21-my-feature-plan.md
# Job a3f7b2 started. Pull with: cco box pull a3f7b2

cco box pull a3f7b2
```

Push requires a workspace (`cco add <branch>`) for the current branch. It creates a git bundle, clones it inside the VM, and launches Claude in a split tmux pane to execute the plan. Push returns immediately — Claude runs in the background pane. When Claude finishes, it writes an output bundle. Pull polls for that bundle, fast-forward merges the commits back onto your branch, and closes the sandbox pane.

Each push gets a unique job ID so multiple jobs can run in parallel.
```

**Step 2: Commit**

```bash
git add orchestrator/docs/sandbox.md
git commit -m "docs: extract sandbox documentation to docs/sandbox.md"
```

---

### Task 2: Create docs/configuration.md

**Files:**
- Create: `orchestrator/docs/configuration.md`

**Step 1: Create the configuration documentation**

Create `orchestrator/docs/configuration.md` with the full configuration content extracted from the current README:

```markdown
# Configuration

cco uses a JSON config file for optional settings. The file location respects `$XDG_CONFIG_HOME`:

```
~/.config/cco/config.json
```

## Managing the Config

```sh
cco config path     # print config file location
cco config show     # print config contents
cco config init     # create config with defaults (if not exists)
cco config edit     # open in $EDITOR (runs init first)
```

## Go Module Proxy

When pushing Go projects to the sandbox, private module dependencies can't be resolved because the sandbox has no access to private repositories. The `go_proxy` setting caches matching dependencies on the host before push, making them available inside the sandbox via a file-system based Go module proxy.

```json
{
  "go_proxy": {
    "patterns": [
      "github.com/myorg/*"
    ]
  }
}
```

**How it works:**

1. At push time, cco scans all `go.mod` files in the worktree
2. Dependencies matching any pattern are downloaded to the job's exchange directory
3. Inside the sandbox, `GOPROXY` is set to check the local cache first, then fall back to `proxy.golang.org`

Patterns use the same glob format as Go's `GOPRIVATE` environment variable. If `go_proxy` is absent or `patterns` is empty, push behaves as before.
```

**Step 2: Commit**

```bash
git add orchestrator/docs/configuration.md
git commit -m "docs: extract configuration documentation to docs/configuration.md"
```

---

### Task 3: Rewrite README.md

**Files:**
- Modify: `orchestrator/README.md`

**Step 1: Replace the entire README**

Replace the contents of `orchestrator/README.md` with the new landing page structure:

```markdown
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
```

**Step 2: Commit**

```bash
git add orchestrator/README.md
git commit -m "docs: rewrite README as concise landing page"
```

---

### Task 4: Update project CLAUDE.md

The project `CLAUDE.md` references the repository structure but doesn't mention the new `docs/` directory under `orchestrator/`.

**Files:**
- Modify: `CLAUDE.md:98-111` (Repository Structure section)

**Step 1: Update the repository structure tree**

In `CLAUDE.md`, find the Repository Structure section and update it to include the `docs/` directory:

```
## Repository Structure

```
claude/                  # Symlinked to ~/.claude/ via stow
├── CLAUDE.md           # Global instructions for all projects
├── settings.json       # Permissions and hooks
├── agents/             # Custom agent definitions
├── commands/           # Slash command definitions
├── hooks/              # PreToolUse hooks (e.g., gitleaks)
├── scripts/            # Status line and other scripts
└── skills/             # Custom skill definitions
orchestrator/            # cco - Claude Code orchestrator (Go)
├── docs/               # Detailed documentation
scripts/                 # Worktree and utility scripts
```
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add orchestrator docs/ to repository structure"
```
