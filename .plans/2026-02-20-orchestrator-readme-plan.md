# Orchestrator README & Documentation Consolidation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Create a standalone orchestrator README, trim the main README's cco section to a link, and minimize cco content in CLAUDE.md.

**Architecture:** Pure documentation changes across three files: new `orchestrator/README.md`, edits to `README.md`, and edits to `CLAUDE.md`.

**Tech Stack:** Markdown

---

### Task 1: Create orchestrator README

**Files:**
- Create: `orchestrator/README.md`

**Step 1: Write the orchestrator README**

Create `orchestrator/README.md` with the following content:

```markdown
# Claude Code Orchestrator (cco)

A CLI for managing parallel [Claude Code](https://www.anthropic.com/claude-code) workspaces using Git worktrees and tmux.

## Commands

| Command              | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `cco add <branch>`   | Create a workspace (worktree + tmux window) and launch Claude Code   |
| `cco rm <branch>`    | Remove a workspace (worktree + tmux window)                          |
| `cco attach [branch]` | Attach to the tmux session, optionally at a specific branch window  |
| `cco notify`         | Add notification bell to tmux window for the current workspace       |

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
└── notify.go          # cco notify
internal/
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
~/.local/share/cco/worktrees/{repo}/{branch}/
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

**Notes:**
- Integration tests access the tmux Unix socket at `/private/tmp/tmux-*/`, which requires disabling the Claude Code sandbox (`dangerouslyDisableSandbox`)
- On macOS, use `filepath.EvalSymlinks` on temp dirs in Go tests to handle the `/var` → `/private/var` symlink
```

**Step 2: Commit**

```bash
git add orchestrator/README.md
git commit -m "docs(cco): add standalone orchestrator README"
```

---

### Task 2: Trim cco section in main README

**Files:**
- Modify: `README.md:126-139`

**Step 1: Replace the cco section**

Replace the "Claude Code Orchestrator" section (lines 126-139) with:

```markdown
## Claude Code Orchestrator

`cco` manages parallel Claude Code workspaces using Git worktrees and tmux. See the [orchestrator README](./orchestrator/README.md) for full documentation.
```

Keep the `---` separator after it. The cwm section above and the Integrations section below remain unchanged.

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: trim cco section in main README to link"
```

---

### Task 3: Minimize cco content in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update Repository Overview**

Replace the bullet list (lines 7-11) with:

```markdown
This repository contains opinionated resources for working with Claude Code:
- **Workflow skills** for structured development (adapted from [superpowers](https://github.com/obra/superpowers))
- **cco** for parallel Claude Code workspaces (see [orchestrator README](./orchestrator/README.md))
- **cwm** for parallel development with tmux
- **Atlassian MCP** for Jira, Confluence, and Compass
- **Permission and notification settings** for a better experience
```

**Step 2: Remove the "Workspace Management (cco)" subsection**

Delete the entire "Workspace Management (cco)" subsection under Scripts (lines 110-119), including the table and the tmux socket note.

**Step 3: Consolidate the Testing section**

Replace the Testing section (lines 121-143) with:

```markdown
## Testing

Run cwm integration tests (requires tmux):

```bash
./tests/test_cwm.py -v
```

No external Python packages needed - uses only the standard library.

Run cco tests:

```bash
cd orchestrator && go test ./... -count=1
```

**Note:** tmux integration tests require sandbox to be disabled (`dangerouslyDisableSandbox`) due to Unix socket access at `/private/tmp/tmux-*/`. On macOS, use `filepath.EvalSymlinks` on temp dirs in Go tests to handle the `/var` → `/private/var` symlink.
```

This removes the separate unit/integration test commands and the `go test -v -count=1 -timeout 60s` variant, keeping just the one command Claude needs.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: minimize cco content in CLAUDE.md"
```

<!-- No test changes needed - this is a pure documentation task -->
