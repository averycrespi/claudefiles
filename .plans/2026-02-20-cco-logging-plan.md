# CCO Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add a `--verbose` flag to the CCO CLI that controls whether progress detail messages are shown, while always showing key actions.

**Architecture:** A `logging` package (`internal/logging/`) with package-level `Info` and `Debug` functions gated by a verbose bool. The root cobra command gets a `-v`/`--verbose` persistent flag wired via `PersistentPreRun`. All `fmt.Printf`/`fmt.Println` calls in `session.go` are migrated to `logging.Info` or `logging.Debug` based on the design doc's classification. Notify's stderr messages are unchanged.

**Tech Stack:** Go stdlib only (no external logging libraries)

---

### Task 1: Create the logging package

**Files:**
- Create: `orchestrator/internal/logging/logging.go`
- Create: `orchestrator/internal/logging/logging_test.go`

**Step 1: Write the failing tests**

```go
// orchestrator/internal/logging/logging_test.go
package logging

import (
	"bytes"
	"os"
	"testing"
)

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	old := os.Stdout
	os.Stdout = w

	fn()

	w.Close()
	os.Stdout = old

	var buf bytes.Buffer
	buf.ReadFrom(r)
	return buf.String()
}

func TestInfoAlwaysPrints(t *testing.T) {
	SetVerbose(false)
	out := captureStdout(t, func() {
		Info("hello %s", "world")
	})
	if out != "hello world\n" {
		t.Errorf("Info output = %q, want %q", out, "hello world\n")
	}
}

func TestDebugSilentByDefault(t *testing.T) {
	SetVerbose(false)
	out := captureStdout(t, func() {
		Debug("should not appear")
	})
	if out != "" {
		t.Errorf("Debug output = %q, want empty", out)
	}
}

func TestDebugPrintsWhenVerbose(t *testing.T) {
	SetVerbose(true)
	defer SetVerbose(false)
	out := captureStdout(t, func() {
		Debug("verbose %s", "msg")
	})
	if out != "verbose msg\n" {
		t.Errorf("Debug output = %q, want %q", out, "verbose msg\n")
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/logging/ -v -count=1`
Expected: FAIL (package does not exist)

**Step 3: Write minimal implementation**

```go
// orchestrator/internal/logging/logging.go
package logging

import "fmt"

var verbose bool

// SetVerbose controls whether Debug messages are printed.
func SetVerbose(v bool) { verbose = v }

// Info prints a message that is always shown to the user.
func Info(format string, args ...any) {
	fmt.Printf(format+"\n", args...)
}

// Debug prints a message only when verbose mode is enabled.
func Debug(format string, args ...any) {
	if verbose {
		fmt.Printf(format+"\n", args...)
	}
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/logging/ -v -count=1`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add orchestrator/internal/logging/logging.go orchestrator/internal/logging/logging_test.go
git commit -m "feat(cco): add logging package with Info and Debug levels"
```

---

### Task 2: Add --verbose flag to root command

**Files:**
- Modify: `orchestrator/cmd/root.go`

**Step 1: Write the failing test**

No unit test for this — the flag wiring is trivial cobra boilerplate. It will be verified by integration tests in Task 4.

**Step 2: Modify root.go to add the persistent flag**

Replace the entire contents of `orchestrator/cmd/root.go` with:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/spf13/cobra"
)

var verbose bool

var rootCmd = &cobra.Command{
	Use:   "cco",
	Short: "Claude Code Orchestrator - manage parallel Claude Code sessions",
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		logging.SetVerbose(verbose)
	},
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "show detailed progress output")
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

**Step 3: Verify it builds**

Run: `cd orchestrator && go build ./cmd/cco`
Expected: builds without error

**Step 4: Verify --help shows the flag**

Run: `cd orchestrator && go run ./cmd/cco --help`
Expected: output includes `-v, --verbose`

**Step 5: Commit**

```bash
git add orchestrator/cmd/root.go
git commit -m "feat(cco): add -v/--verbose persistent flag to root command"
```

---

### Task 3: Migrate session.go to use logging package

**Files:**
- Modify: `orchestrator/internal/session/session.go`

This is the bulk of the work. Every `fmt.Printf`/`fmt.Println` in session.go gets replaced with either `logging.Info` or `logging.Debug` based on the classification in the design doc. The `Notify` function's `fmt.Fprintf(os.Stderr, ...)` calls and `fmt.Fprintf(os.Stderr, "Warning: ...")` calls are **unchanged**.

**Step 1: Replace the import and all print calls**

Replace the entire contents of `orchestrator/internal/session/session.go` with:

```go
package session

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/git"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
	"github.com/averycrespi/claudefiles/orchestrator/internal/tmux"
)

// Init ensures a tmux session exists for the repository.
func Init(repoRoot string) error {
	info, err := git.RepoInfo(repoRoot)
	if err != nil {
		return err
	}
	if info.IsWorktree {
		return fmt.Errorf("this command must be run from the main git repository, not a worktree")
	}

	sessionName := paths.TmuxSessionName(info.Name)
	if tmux.SessionExists(sessionName) {
		logging.Debug("tmux session already exists: %s", sessionName)
		return nil
	}

	logging.Info("Creating tmux session: %s with main window", sessionName)
	return tmux.CreateSession(sessionName, "main")
}

// Add creates a new session: worktree, tmux window, setup, and Claude launch.
func Add(repoRoot, branch string) error {
	info, err := git.RepoInfo(repoRoot)
	if err != nil {
		return err
	}
	if info.IsWorktree {
		return fmt.Errorf("this command must be run from the main git repository, not a worktree")
	}

	// Ensure tmux session exists
	if err := Init(repoRoot); err != nil {
		return err
	}

	sessionName := paths.TmuxSessionName(info.Name)
	windowName := paths.TmuxWindowName(branch)
	sessionDir := paths.SessionDir(info.Name, branch)

	// Create worktree if it doesn't exist
	if _, err := os.Stat(sessionDir); os.IsNotExist(err) {
		logging.Info("Creating worktree at: %s", sessionDir)
		if err := os.MkdirAll(filepath.Dir(sessionDir), 0o755); err != nil {
			return fmt.Errorf("could not create session directory: %w", err)
		}
		if err := git.AddWorktree(info.Root, sessionDir, branch); err != nil {
			return err
		}
	} else {
		logging.Debug("Worktree already exists at: %s", sessionDir)
	}

	// Run setup scripts if found
	logging.Debug("Searching for setup scripts ...")
	runSetupScripts(sessionDir)

	// Copy local Claude settings if they exist
	copyLocalSettings(info.Root, sessionDir)

	// Create tmux window if it doesn't exist
	if tmux.WindowExists(sessionName, windowName) {
		logging.Debug("tmux window already exists: %s", windowName)
	} else {
		logging.Info("Creating tmux window: %s", windowName)
		if err := tmux.CreateWindow(sessionName, windowName, sessionDir); err != nil {
			return err
		}
		logging.Info("Launching Claude Code")
		if err := tmux.SendKeys(sessionName, windowName, "claude --permission-mode acceptEdits"); err != nil {
			return err
		}
	}

	return nil
}

// Remove removes a session: worktree and tmux window.
func Remove(repoRoot, branch string) error {
	info, err := git.RepoInfo(repoRoot)
	if err != nil {
		return err
	}
	if info.IsWorktree {
		return fmt.Errorf("this command must be run from the main git repository, not a worktree")
	}

	sessionName := paths.TmuxSessionName(info.Name)
	windowName := paths.TmuxWindowName(branch)
	sessionDir := paths.SessionDir(info.Name, branch)

	// Remove worktree if it exists
	if _, err := os.Stat(sessionDir); os.IsNotExist(err) {
		logging.Debug("Worktree does not exist at: %s", sessionDir)
	} else {
		logging.Info("Removing worktree at: %s", sessionDir)
		if err := git.RemoveWorktree(info.Root, sessionDir); err != nil {
			return err
		}
	}

	// Close tmux window if it exists
	if !tmux.SessionExists(sessionName) {
		logging.Debug("tmux session does not exist: %s", sessionName)
		return nil
	}

	actualName := tmux.ActualWindowName(sessionName, windowName)
	if actualName != "" {
		logging.Info("Closing tmux window: %s", windowName)
		return tmux.KillWindow(sessionName, actualName)
	}
	logging.Debug("tmux window does not exist: %s", windowName)
	return nil
}

// Attach attaches to the tmux session for the repository at the given path.
// Works from both the main repo and worktrees.
func Attach(path string) error {
	info, err := git.RepoInfo(path)
	if err != nil {
		return err
	}

	var repoName string
	if info.IsWorktree {
		cmd := exec.Command("git", "rev-parse", "--git-common-dir")
		cmd.Dir = path
		out, err := cmd.Output()
		if err != nil {
			return fmt.Errorf("could not determine main repo: %w", err)
		}
		commonDir := filepath.Clean(filepath.Join(path, strings.TrimSpace(string(out))))
		mainRoot := filepath.Dir(commonDir)
		repoName = filepath.Base(mainRoot)
	} else {
		repoName = info.Name
	}

	sessionName := paths.TmuxSessionName(repoName)

	if !tmux.SessionExists(sessionName) {
		if info.IsWorktree {
			return fmt.Errorf("tmux session does not exist: %s. Run 'cco init' from the main repository first", sessionName)
		}
		if err := Init(path); err != nil {
			return err
		}
	}

	logging.Info("Attaching to tmux session: %s", sessionName)
	return tmux.Attach(sessionName)
}

// Notify adds a bell emoji to the tmux window for the current session.
// Designed to be called from hooks — prints skip reason to stderr and always returns nil.
func Notify(path string) error {
	info, err := git.RepoInfo(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Skipped: %v\n", err)
		return nil
	}

	if !info.IsWorktree {
		fmt.Fprintln(os.Stderr, "Skipped: This command must be run from a worktree, not the main repository")
		return nil
	}

	// Derive session info from the worktree path.
	// For cco-managed worktrees, the path is:
	//   ~/.local/share/cco/sessions/{repo}/{branch}/
	sessionsDir := filepath.Join(paths.DataDir(), "sessions")
	relPath, err := filepath.Rel(sessionsDir, info.Root)
	if err != nil || relPath == "." || strings.HasPrefix(relPath, "..") {
		fmt.Fprintf(os.Stderr, "Skipped: Worktree path '%s' is not under cco sessions directory\n", info.Root)
		return nil
	}

	dir, branch := filepath.Split(relPath)
	repoName := filepath.Clean(dir)
	if repoName == "" || repoName == "." || branch == "" {
		fmt.Fprintf(os.Stderr, "Skipped: Could not parse repo/branch from path '%s'\n", info.Root)
		return nil
	}

	sessionName := paths.TmuxSessionName(repoName)

	if !tmux.SessionExists(sessionName) {
		fmt.Fprintf(os.Stderr, "Skipped: tmux session '%s' does not exist\n", sessionName)
		return nil
	}

	windowName := branch
	windows, err := tmux.ListWindows(sessionName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Skipped: Could not list windows for session '%s'\n", sessionName)
		return nil
	}

	bellName := "🔔 " + windowName
	for _, w := range windows {
		if w == bellName {
			logging.Debug("tmux window '%s' already has a notification", windowName)
			return nil
		}
	}

	for _, w := range windows {
		if w == windowName {
			logging.Info("Adding notification to tmux window: %s", windowName)
			if err := tmux.RenameWindow(sessionName, windowName, bellName); err != nil {
				fmt.Fprintf(os.Stderr, "Skipped: Could not rename tmux window '%s'\n", windowName)
			}
			return nil
		}
	}

	fmt.Fprintf(os.Stderr, "Skipped: tmux window '%s' does not exist\n", windowName)
	return nil
}

// runSetupScripts looks for and runs setup scripts in the session directory.
func runSetupScripts(sessionDir string) {
	scriptsDir := filepath.Join(sessionDir, "scripts")
	candidates := []string{"init", "init.sh", "setup", "setup.sh"}

	for _, name := range candidates {
		scriptPath := filepath.Join(scriptsDir, name)
		fi, err := os.Stat(scriptPath)
		if err != nil || fi.IsDir() {
			continue
		}
		if fi.Mode()&0o111 == 0 {
			continue
		}
		logging.Info("Running setup script: %s", scriptPath)
		cmd := exec.Command(scriptPath)
		cmd.Dir = sessionDir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: setup script %s failed: %v\n", name, err)
		}
		return
	}
	logging.Debug("No setup scripts found")
}

// copyLocalSettings copies .claude/settings.local.json from the main repo to the session dir.
func copyLocalSettings(repoRoot, sessionDir string) {
	src := filepath.Join(repoRoot, ".claude", "settings.local.json")
	dst := filepath.Join(sessionDir, ".claude", "settings.local.json")

	srcFile, err := os.Open(src)
	if err != nil {
		logging.Debug("No local Claude settings found in repo")
		return
	}
	defer srcFile.Close()

	if _, err := os.Stat(dst); err == nil {
		logging.Debug("Local Claude settings already exist in worktree")
		return
	}

	logging.Info("Copying local Claude settings to: %s", dst)
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: could not create .claude dir: %v\n", err)
		return
	}
	dstFile, err := os.Create(dst)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: could not create settings file: %v\n", err)
		return
	}
	defer dstFile.Close()
	io.Copy(dstFile, srcFile)
}
```

**Key changes from the original:**
- Import `logging` instead of using `fmt` for output (keep `fmt` for `Errorf` and stderr writes)
- `logging.Info(format, args...)` replaces `fmt.Printf(format+"\n", args...)` for key actions
- `logging.Debug(format, args...)` replaces `fmt.Printf(format+"\n", args...)` for progress detail
- All `fmt.Fprintf(os.Stderr, ...)` calls in Notify and warning messages are **unchanged**
- Note: `logging.Info`/`logging.Debug` append `\n` automatically, so format strings drop the trailing `\n`

**Step 2: Verify it builds**

Run: `cd orchestrator && go build ./cmd/cco`
Expected: builds without error

**Step 3: Commit**

```bash
git add orchestrator/internal/session/session.go
git commit -m "refactor(cco): migrate session output to logging package"
```

---

### Task 4: Update integration tests for verbose output

**Files:**
- Modify: `orchestrator/cmd/cco/integration_test.go`

Several integration tests check stdout for messages that are now Debug-level (only shown with `-v`). These tests need to pass `-v` to see verbose output. The affected tests:

- `TestInitIdempotent` — checks for `"already exists"` (now Debug)
- `TestAddIdempotent` — checks for `"already exists"` (now Debug)
- `TestRmIdempotent` — checks for `"does not exist"` (now Debug)
- `TestNotifyIdempotent` — checks for `"already has a notification"` (now Debug)

Tests that check for Info-level messages (`TestInit` checking `"Creating tmux session"`, `TestNotifyFromWorktree` checking `"Adding notification"`) remain unchanged.

**Step 1: Update the affected tests to pass `-v`**

In `orchestrator/cmd/cco/integration_test.go`, make these changes:

Change `TestInitIdempotent` (line 216):
```go
// Before:
stdout, _, code := runCCO(t, dir, xdg, "init")
// After:
stdout, _, code := runCCO(t, dir, xdg, "-v", "init")
```

Change `TestAddIdempotent` (line 276):
```go
// Before:
stdout, _, code := runCCO(t, dir, xdg, "add", "idem-branch")
// After:
stdout, _, code := runCCO(t, dir, xdg, "-v", "add", "idem-branch")
```

Change `TestRmIdempotent` (line 320):
```go
// Before:
stdout, _, code := runCCO(t, dir, xdg, "rm", "rm-idem")
// After:
stdout, _, code := runCCO(t, dir, xdg, "-v", "rm", "rm-idem")
```

Change `TestNotifyIdempotent` (line 373):
```go
// Before:
stdout, _, code := runCCO(t, sd, xdg, "notify")
// After:
stdout, _, code := runCCO(t, sd, xdg, "-v", "notify")
```

**Step 2: Add a test that verifies Debug is silent without -v**

Add the following test at the end of the file, before the closing brace:

```go
func TestVerboseFlag(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	// First init creates the session (Info level)
	runCCO(t, dir, xdg, "init")

	// Second init without -v should not show "already exists"
	stdout, _, code := runCCO(t, dir, xdg, "init")
	if code != 0 {
		t.Fatalf("init exited %d", code)
	}
	if strings.Contains(stdout, "already exists") {
		t.Error("without -v, debug messages should be hidden")
	}

	// Second init with -v should show "already exists"
	stdout, _, code = runCCO(t, dir, xdg, "-v", "init")
	if code != 0 {
		t.Fatalf("init -v exited %d", code)
	}
	if !strings.Contains(stdout, "already exists") {
		t.Errorf("with -v, expected 'already exists' in output, got: %s", stdout)
	}
}
```

**Step 3: Run all tests to verify they pass**

Run: `cd orchestrator && go test ./... -v -count=1 -timeout 60s`
Expected: PASS (all tests including the new TestVerboseFlag)

**Step 4: Commit**

```bash
git add orchestrator/cmd/cco/integration_test.go
git commit -m "test(cco): update integration tests for verbose logging"
```

---

<!-- No documentation updates needed — this is an internal refactor of output handling. The CLI interface (command names, arguments) is unchanged. The --verbose flag is self-documenting via cobra's help output. -->
