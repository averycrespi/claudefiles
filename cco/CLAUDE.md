# CLAUDE.md

CLI tool for managing Claude Code workspaces via git worktrees and tmux.

## Development

Build: `go build -o cco ./cmd/cco`
Test: `go test ./... -count=1`
Integration tests require sandbox disabled (`dangerouslyDisableSandbox`) due to tmux Unix socket access.

On macOS, use `filepath.EvalSymlinks` on temp dirs in tests to handle `/var` → `/private/var`.

## Architecture

Dependency injection via interfaces. Services receive abstractions (exec.Runner, logging.Logger, git.Client, tmux.Client) for testability. Wiring lives in `cmd/wire.go`.

### Packages

| Package | Purpose |
|---------|---------|
| `cmd` | Cobra CLI commands and dependency wiring |
| `internal/workspace` | Workspace lifecycle (add, remove, attach) |
| `internal/git` | Git operations (worktrees, branches, repo info) |
| `internal/tmux` | Tmux session/window management |
| `internal/sandbox` | Lima VM lifecycle and push/pull |
| `internal/lima` | limactl wrapper |
| `internal/config` | JSON config loading from `~/.config/cco/config.json` |
| `internal/logging` | Logger interface with stdout + noop implementations |
| `internal/paths` | XDG path utilities |
| `internal/exec` | Command runner interface |
| `internal/goproxy` | Go module caching for sandbox |

## Conventions

- **Errors:** Wrap with `fmt.Errorf("context: %w", err)`. No custom error types.
- **Logging:** Three levels: Info (always), Warn (always), Debug (verbose flag). Printf-style formatting.
- **Testing:** Testify for assertions and mocks. Mock interfaces with `stretchr/testify/mock`. Test naming: `TestType_Method_Scenario`.
- **Commands:** Cobra with `RunE` for error propagation. `SilenceUsage: true` on root.
- **Naming:** Interfaces use descriptive suffixes (Client, Service, Runner). Mocks use `mock` prefix.
- **Files:** One main type per file. Tests in same package.
