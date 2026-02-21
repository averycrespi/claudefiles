# Orchestrator README & Documentation Consolidation

## Goal

Create a standalone README for the orchestrator (`orchestrator/README.md`), trim the main README's cco section to a short reference with a link, and minimize cco-related content in CLAUDE.md.

## Orchestrator README (`orchestrator/README.md`)

Full standalone documentation with these sections:

### 1. Overview
- What cco is: a CLI for managing parallel Claude Code workspaces
- Uses Git worktrees and tmux under the hood
- No mention of cwm — treat cco as standalone

### 2. Commands
- Command reference table (moved from main README)
- Detailed usage examples for each command (`add`, `rm`, `attach`, `notify`)

### 3. Architecture
- Overview of Go package structure:
  - `cmd/` — CLI commands (cobra)
  - `internal/git` — Git/worktree operations
  - `internal/tmux` — tmux session/window management
  - `internal/workspace` — High-level workspace lifecycle
  - `internal/paths` — Storage path conventions
  - `internal/logging` — Structured logging
- How packages compose to form commands

### 4. How It Works
- Worktree + tmux model explained
- Dedicated tmux socket (`cco`) to avoid conflicts
- Storage layout: `~/.local/share/cco/worktrees/{repo}/{branch}/`

### 5. Development
- Building: `go build ./cmd/cco`
- Unit tests: `go test ./... -count=1`
- Integration tests: `go test -v -count=1 -timeout 60s`
- Sandbox note: integration tests need `dangerouslyDisableSandbox` for tmux socket access
- macOS symlink note: use `filepath.EvalSymlinks` on temp dirs

### 6. Configuration
- tmux socket name
- Storage paths

## Main README Changes

Replace the "Claude Code Orchestrator" section (lines 126-139) with:

```markdown
## Claude Code Orchestrator

`cco` manages parallel Claude Code workspaces using Git worktrees and tmux. See the [orchestrator README](./orchestrator/README.md) for full documentation.
```

The cwm section stays exactly as-is. No other main README changes.

## CLAUDE.md Changes

### Remove
- "Workspace Management (cco)" table under Scripts
- cco tmux socket note
- cco-specific test sections (unit + integration commands)
- cco references in Repository Overview bullet list

### Keep
- cwm command table (unchanged)
- cwm test command
- Minimal cco testing entry: just `cd orchestrator && go test ./... -count=1`
- Sandbox/symlink note (critical for Claude running tests)
- Reference to orchestrator README for full details

### Result
CLAUDE.md tells Claude just enough to run cco tests and know about sandbox constraints. Everything else lives in `orchestrator/README.md`.
