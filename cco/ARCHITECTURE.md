# CCO Architecture

CCO is a Go CLI with two major subsystems: workspace management and sandbox execution.

```
┌───────────────────────────────────────────────────────┐
│  CLI layer (Cobra)                                    │
│  Argument parsing · Flag handling · Dependency wiring │
├──────────────────────────┬────────────────────────────┤
│  Workspace subsystem     │  Sandbox subsystem         │
│  Git worktrees           │  Lima VM lifecycle         │
│  Tmux windows            │  Git bundle push/pull      │
│  Setup scripts           │  Go module caching         │
├──────────────────────────┴────────────────────────────┤
│  Shared infrastructure                                │
│  exec.Runner · logging.Logger · paths · config        │
└───────────────────────────────────────────────────────┘
```

## Components

**CLI layer** — Thin Cobra commands that parse arguments and delegate to the two subsystems. Dependency wiring lives in a single file (`cmd/wire.go`) that constructs all services from interfaces.

**Workspace subsystem** — Orchestrates the lifecycle of a "workspace" (git worktree + tmux window + Claude Code instance). `cco add` creates the worktree, opens a tmux window, runs any setup scripts, and launches Claude Code. `cco rm` tears it all down. The git and tmux packages are independent clients that the workspace service composes.

**Sandbox subsystem** — Manages a Lima VM for autonomous plan execution. `cco box push` bundles the current branch, copies it into the VM, and launches Claude Code with a plan file. `cco box pull` polls for results, fetches the output bundle, and fast-forward merges back into the local branch. The lima package is a thin wrapper around `limactl`.

**Shared infrastructure** — `exec.Runner` abstracts command execution so every external tool call (git, tmux, limactl) is mockable. `logging.Logger` provides Info/Warn/Debug levels. `paths` handles XDG directory resolution and branch name sanitization. `config` loads user settings from `~/.config/cco/config.json`.

## Key Design Decisions

- **Shell out, don't embed** — Git, tmux, and Lima are all called via their CLIs through `exec.Runner`, not through Go libraries. Stable interfaces, fewer dependencies, identical behavior to manual usage.
- **Interface-based DI, not a framework** — Services accept interfaces in constructors. One wiring file builds the graph. No reflection, no containers.
- **Dedicated tmux socket** — cco uses its own socket (`-L cco`) so it never interferes with the user's personal tmux sessions.
- **Git bundles for sandbox exchange** — Bundles are a self-contained transport format that works across the host/VM boundary without needing shared filesystems or network git access.
- **XDG-compliant storage** — Worktrees under `$XDG_DATA_HOME/cco/`, config under `$XDG_CONFIG_HOME/cco/`. No dotfiles in the home directory.
- **Stateless** — No database or state file. All state is derived from what exists on disk (worktree present?), in git (branch exists?), and in tmux (window exists?).

## Constraints

- **macOS only** — Lima and the tmux socket paths assume macOS. No Windows or Linux host support.
- **One session per repo** — Each repository gets one tmux session with windows per branch. No support for multiple sessions per repo.
- **Fast-forward only** — `cco box pull` requires a clean fast-forward merge. Divergent branches need manual resolution.
- **Go module caching** — The goproxy feature only helps Go projects. Other ecosystems need network access or manual dependency setup in the VM.
