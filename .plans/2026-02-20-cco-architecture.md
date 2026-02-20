# CCO (Claude Code Orchestrator) Architecture

## Context

This repository currently includes CWM, a Python CLI that manages parallel Claude Code development sessions using git worktrees and tmux. CWM works well but is limited to worktree management. As more orchestration capabilities are needed (session management, multi-agent coordination, etc.), a single extensible CLI in Go is a better foundation.

CWM will coexist with the new tool during a transition period. CWM manages its existing sibling-directory worktrees; CCO manages sessions in a centralized XDG-based location.

## Goals & Non-Goals

**Goals:**
- Replicate CWM's worktree/tmux/Claude orchestration functionality
- Use "session" vocabulary instead of "worktree" in the user-facing interface
- Centralize session storage under XDG data directory
- Build an extensible foundation for future orchestration features
- Single Go binary with no runtime dependencies

**Non-Goals:**
- Cross-platform notifications (macOS only for MVP)
- Deduplication of repo names across different paths
- Automatic migration of existing CWM worktrees
- New orchestration features beyond CWM parity

## System Overview

`cco` is a Go CLI that orchestrates Claude Code development sessions. Each **session** consists of a git worktree, a tmux window, and a Claude Code instance. Sessions are grouped per repository under a single tmux session.

The tool is stateless — all state is derived from the filesystem (worktree directories exist or don't), git (branch info), and tmux (sessions/windows). Session storage is centralized under `$XDG_DATA_HOME/cco/sessions/{repo}/{branch}/` with `~/.local/share/cco/sessions/` as the default.

Commands are flat subcommands: `cco init`, `cco add`, `cco rm`, `cco attach`, `cco notify`.

## Components

### CLI Layer (`cmd/`)

**Responsibility:** Parse commands, validate arguments, dispatch to core logic.

**Interface:** Flat subcommands via cobra — `cco init`, `cco add <branch>`, `cco rm <branch>`, `cco attach`, `cco notify`.

**Dependencies:** cobra for CLI framework, calls into `internal/session`.

Each command handler is thin — it parses flags/args and delegates to the session package.

### Session Package (`internal/session/`)

**Responsibility:** Orchestrates the session lifecycle by coordinating git, tmux, and paths.

**Interface:**
- `Init(repoRoot) → error` — ensure tmux session exists for the repo
- `Add(repoRoot, branch) → error` — create worktree, tmux window, run setup, copy settings, launch Claude
- `Remove(repoRoot, branch) → error` — remove worktree and tmux window
- `Attach(path) → error` — attach to the repo's tmux session from any path
- `Notify(path) → error` — add bell to current session's tmux window

**Dependencies:** Calls into `git`, `tmux`, and `paths` packages.

### Git Package (`internal/git/`)

**Responsibility:** All git and worktree operations.

**Interface:**
- `RepoInfo(path) → (repoName, repoRoot, isWorktree, error)` — detect repo context
- `BranchExists(repoRoot, branch) → bool` — check if local branch exists
- `AddWorktree(repoRoot, path, branch) → error` — create worktree (creating branch if needed)
- `RemoveWorktree(repoRoot, path) → error` — remove worktree

**Dependencies:** Shells out to `git`.

### Tmux Package (`internal/tmux/`)

**Responsibility:** All tmux session and window management.

**Interface:**
- `SessionExists(name) → bool`
- `CreateSession(name, windowName) → error`
- `WindowExists(session, window) → bool`
- `CreateWindow(session, window, cwd) → error`
- `KillWindow(session, window) → error`
- `SendKeys(session, window, command) → error`
- `RenameWindow(session, window, newName) → error`
- `ListWindows(session) → []string`
- `Attach(session) → error` — attach or switch-client depending on tmux context

**Dependencies:** Shells out to `tmux`.

### Paths Package (`internal/paths/`)

**Responsibility:** Path computation and name sanitization. Pure functions.

**Interface:**
- `DataDir() → string` — returns `$XDG_DATA_HOME/cco` or `~/.local/share/cco`
- `SessionDir(repo, branch) → string` — full path to session's worktree directory
- `SanitizeBranch(branch) → string` — `feat/thing` → `feat-thing`
- `TmuxSessionName(repo) → string` — e.g., `myapp-worktree`
- `TmuxWindowName(branch) → string` — sanitized branch name for tmux

**Dependencies:** None (pure logic).

## Directory Structure

```
orchestrator/
├── cmd/              # Cobra command definitions
│   ├── root.go
│   ├── init.go
│   ├── add.go
│   ├── rm.go
│   ├── attach.go
│   └── notify.go
├── internal/         # Core logic packages
│   ├── git/          # Git/worktree operations
│   ├── tmux/         # Tmux session/window management
│   ├── session/      # Session lifecycle (coordinates git + tmux)
│   └── paths/        # XDG paths, name sanitization
├── main.go           # Entrypoint
├── go.mod
└── go.sum
```

## Decisions

**Go with cobra for CLI framework.** De facto standard for Go CLIs (kubectl, docker, gh). Provides subcommand routing, help generation, flag parsing, and shell completions.

**Shell out to git and tmux.** Both have stable CLI interfaces. Go git libraries are heavy and lack worktree support. Shelling out keeps dependencies minimal and behavior identical to manual usage.

**Centralized session storage under XDG.** Moves worktrees out of the repo's parent directory into `~/.local/share/cco/sessions/{repo}/{branch}/`. Eliminates the naming/parsing ambiguity from CWM's sibling directory approach.

**Flat subcommands.** `cco add` instead of `cco session add`. Keeps the CLI ergonomic while the command set is small. Cobra makes it straightforward to introduce command groups later via aliases.

**Coexist with CWM.** Both tools work independently — CWM manages sibling-directory worktrees, CCO manages XDG-based sessions. Hooks continue referencing `cwm notify` until explicitly migrated.

**"Session" vocabulary.** User-facing commands use "session" to describe the unit of work (worktree + tmux window + Claude instance). This is more generic than "worktree" and leaves room for sessions that aren't backed by worktrees in the future.

## Constraints & Limitations

- **macOS only for MVP.** Notifications use `terminal-notifier` and `afplay`. Core functionality (git/tmux/cobra) is cross-platform.
- **No repo name deduplication.** Two repos named `myapp` in different directories would collide. Accepted for MVP.
- **tmux required.** The session model is built on tmux windows. No fallback.
- **Stateless means no cross-check.** If a worktree directory is deleted outside `cco`, the tool won't know. Accepted tradeoff for simplicity.
