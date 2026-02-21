# CCO Logging Design

## Context

The orchestrator currently uses `fmt.Printf` and `fmt.Fprintln` for all output, with no distinction between important user-facing messages and verbose progress details. There are ~35 print calls in `session.go` alone, all shown regardless of context.

## Goals & Non-Goals

**Goals:**
- Distinguish key actions from progress detail
- Add `-v` / `--verbose` flag to show detail when needed
- Clean CLI output — no timestamps, no log levels, just messages

**Non-Goals:**
- Structured logging or JSON output
- Multiple verbosity levels
- Changing how `notify` reports skip reasons (stays as direct stderr writes)

## Design

### `internal/logging/` package

A package-level logger with two output levels gated by a verbose bool:

```go
package logging

import "fmt"

var verbose bool

func SetVerbose(v bool) { verbose = v }

func Info(format string, args ...any) {
    fmt.Printf(format+"\n", args...)
}

func Debug(format string, args ...any) {
    if verbose {
        fmt.Printf(format+"\n", args...)
    }
}
```

- Package named `logging` to avoid shadowing stdlib `log`
- `Info` — always printed: key actions (creating, removing, attaching, launching)
- `Debug` — only with `-v`: progress details ("already exists", "searching for scripts", "no settings found")
- Errors continue to return as `error` values, handled by cobra
- `Notify` skip messages remain as direct `fmt.Fprintf(os.Stderr, ...)` — unchanged

### Root command flag

`-v` / `--verbose` as a persistent flag on `rootCmd`, wired in a `PersistentPreRun` that calls `logging.SetVerbose(true)`.

### Message classification

**Info (always shown):**
- "Creating tmux session: %s with main window"
- "Creating worktree at: %s"
- "Creating tmux window: %s"
- "Launching Claude Code"
- "Removing worktree at: %s"
- "Closing tmux window: %s"
- "Attaching to tmux session: %s"
- "Adding notification to tmux window: %s"
- "Running setup script: %s"
- "Copying local Claude settings to: %s"

**Debug (verbose only):**
- "tmux session already exists: %s"
- "Worktree already exists at: %s"
- "tmux window already exists: %s"
- "Searching for setup scripts ..."
- "No setup scripts found"
- "No local Claude settings found in repo"
- "Local Claude settings already exist in worktree"
- "Worktree does not exist at: %s"
- "tmux session does not exist: %s"
- "tmux window does not exist: %s"
- "tmux window '%s' already has a notification"

**Unchanged (direct stderr in Notify):**
- All "Skipped: ..." messages
- All "Warning: ..." messages

## Decisions

**Package-level global over struct-based DI.** Simpler for now. Can refactor to a Manager struct with methods later if testability becomes a concern.

**Named `logging` not `log`.** Avoids shadowing Go's stdlib `log` package in any file that imports both.

**No slog.** slog's default handler adds timestamps and levels. A custom handler to strip those is more code for the same result as two plain functions.
