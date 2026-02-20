# Design: Remove `cco init` Command

## Context

The `cco init` command creates a tmux session for the current repository. However, `cco add` already calls `session.Init()` internally before creating a worktree and window. This makes the standalone `init` command redundant — users never need to run it separately.

## Changes

### Remove

- **`orchestrator/cmd/init.go`** — the CLI command registration file
- **Integration tests for `init`** — `TestInit`, `TestInitIdempotent` in `integration_test.go`

### Keep

- **`session.Init()` function** in `session.go` — still called internally by `Add()`

### Update

- **`CLAUDE.md`** — remove `cco init` from the session management table
- **`README.md`** — remove `cco init` from usage documentation
