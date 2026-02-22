# README Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Restructure both READMEs so visitors quickly understand what cco does without clicking through multiple files.

**Architecture:** Pure documentation changes — rewrite the cco section of the main README with a pitch + usage example, and restructure the orchestrator README from command-first to concept-first.

**Tech Stack:** Markdown

---

### Task 1: Expand cco section in main README

**Files:**
- Modify: `README.md:113-117`

**Step 1: Replace the cco section**

Replace lines 113-117 (from `## Claude Code Orchestrator` through `See the [orchestrator README]...`) with:

```markdown
## Claude Code Orchestrator

`cco` lets you run multiple Claude Code sessions in parallel, each on its own branch. It uses Git worktrees and tmux to keep sessions isolated from each other and from your main working tree.

```sh
cco add feature-branch     # create workspace, launch Claude Code
cco attach feature-branch   # switch to it later
cco rm feature-branch       # clean up when done (keeps the branch)
```

You can also run plans in an isolated sandbox VM with `cco box`. See the [orchestrator README](./orchestrator/README.md) for full documentation.
```

Also fix the typo on line 15: `1.23for` → `1.23 for`.

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: expand cco section in main README"
```

---

### Task 2: Restructure orchestrator README

**Files:**
- Modify: `orchestrator/README.md` (full rewrite)

**Step 1: Rewrite the orchestrator README**

Replace the entire file with the following content:

````markdown
# Claude Code Orchestrator (cco)

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
```

## Commands

| Command               | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `cco add <branch>`    | Add a workspace                                            |
| `cco rm <branch>`     | Remove a workspace                                         |
| `cco attach [branch]` | Attach to a window or session                              |
| `cco notify`          | Add notification to current workspace (for hooks)          |
| `cco box <cmd>`       | Manage the sandbox (create, start, stop, destroy, status, provision, shell, push, pull) |

## Workspace Setup

When `cco add` creates a new worktree, it:

1. Runs any executable setup script found at `scripts/{init,init.sh,setup,setup.sh}` in the worktree
2. Copies `.claude/settings.local.json` from the main repo to the worktree

All commands are idempotent. Running `cco add` multiple times for the same branch is safe — it skips steps that are already done.

## Sandbox

`cco box` manages an isolated [Lima](https://github.com/lima-vm/lima) VM for running Claude Code safely. This is useful for executing plans autonomously without risking your host environment.

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
````

**Step 2: Commit**

```bash
git add orchestrator/README.md
git commit -m "docs: restructure orchestrator README concept-first"
```

<!-- No documentation updates needed — this plan IS the documentation update -->
