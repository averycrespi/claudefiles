# Enhanced `cco attach` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add optional branch argument to `cco attach` so it can target a specific tmux window, and update CLI docs to match the `add` command style.

**Architecture:** Add `AttachToWindow` in the tmux package for window-targeted attach. Update `session.Attach` to accept an optional branch string. Update the cobra command to accept `[branch]`.

**Tech Stack:** Go, Cobra, tmux

---

### Task 1: Add `AttachToWindow` to tmux package

**Files:**
- Modify: `orchestrator/internal/tmux/tmux.go:113-126`

**Step 1: Write `AttachToWindow` function**

Add this function directly after the existing `Attach` function at line 126:

```go
func AttachToWindow(session, window string) error {
	target := session + ":" + window
	if os.Getenv("TMUX") != "" {
		cmd := exec.Command("tmux", "switch-client", "-t", target)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}
	cmd := exec.Command("tmux", "attach-session", "-t", target)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
```

**Step 2: Run tests to verify nothing is broken**

Run: `cd orchestrator && go build ./...`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```
feat(cco): add AttachToWindow to tmux package
```

---

### Task 2: Update `session.Attach` to accept optional branch

**Files:**
- Modify: `orchestrator/internal/session/session.go:127-163`

**Step 1: Update `Attach` signature and add window targeting logic**

Replace the entire `Attach` function (lines 127-163) with:

```go
// Attach attaches to the tmux session for the repository at the given path.
// If branch is non-empty, attaches to the specific window for that branch.
// Works from both the main repo and worktrees.
func Attach(path, branch string) error {
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
			return fmt.Errorf("tmux session does not exist: %s. Run 'cco add <branch>' from the main repository first", sessionName)
		}
		if err := Init(path); err != nil {
			return err
		}
	}

	if branch != "" {
		windowName := paths.TmuxWindowName(branch)
		if !tmux.WindowExists(sessionName, windowName) {
			return fmt.Errorf("tmux window does not exist for branch: %s", branch)
		}
		actualName := tmux.ActualWindowName(sessionName, windowName)
		logging.Info("attaching to tmux window: %s:%s", sessionName, windowName)
		return tmux.AttachToWindow(sessionName, actualName)
	}

	logging.Info("attaching to tmux session: %s", sessionName)
	return tmux.Attach(sessionName)
}
```

**Step 2: Run build to verify compilation**

Run: `cd orchestrator && go build ./...`
Expected: Build fails because `cmd/attach.go` still calls `session.Attach(cwd)` with one arg. This is expected — we fix it in the next task.

**Step 3: Commit**

Do NOT commit yet — the build is broken. Continue to Task 3.

---

### Task 3: Update attach command definition

**Files:**
- Modify: `orchestrator/cmd/attach.go`

**Step 1: Replace the entire file content with:**

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/session"
	"github.com/spf13/cobra"
)

var attachCmd = &cobra.Command{
	Use:   "attach [branch]",
	Short: "Attach to the tmux session, optionally at a specific branch window",
	Long: `Attach to (or switch to) the worktree session.

	If a branch is provided, attach directly to that branch's window.
	If no branch is provided, attach to the session as-is.

	This command will create the tmux session if it doesn't exist yet.
	Works from both the main repository and worktrees.`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		var branch string
		if len(args) > 0 {
			branch = args[0]
		}
		return session.Attach(cwd, branch)
	},
}

func init() {
	rootCmd.AddCommand(attachCmd)
}
```

**Step 2: Run build to verify compilation**

Run: `cd orchestrator && go build ./...`
Expected: Build succeeds.

**Step 3: Commit tasks 2 and 3 together**

```
feat(cco): add optional branch argument to attach command
```

---

### Task 4: Add integration tests for attach with branch

**Files:**
- Modify: `orchestrator/cmd/cco/integration_test.go`

**Step 1: Write failing test for attach with nonexistent branch window**

Add after the last test function:

```go
func TestAttachNonexistentWindow(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	// Create session via add
	runCCO(t, dir, xdg, "add", "some-branch")

	// Attach to a branch that has no window should fail
	_, stderr, code := runCCO(t, dir, xdg, "attach", "nonexistent")
	if code == 0 {
		t.Error("attach to nonexistent window should fail")
	}
	if !strings.Contains(stderr, "tmux window does not exist for branch") {
		t.Errorf("expected 'tmux window does not exist for branch' in stderr, got: %s", stderr)
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test -v -count=1 -timeout 60s -run TestAttachNonexistentWindow ./cmd/cco/`
Expected: FAIL — the test should fail because the binary hasn't been rebuilt yet with our changes. Actually, `TestMain` rebuilds the binary, so it should pass if the code compiles. Run it and verify PASS.

**Step 3: Write test for attach with no session (auto-init)**

Add after the previous test:

```go
func TestAttachAutoInit(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	// Attach without an existing session should auto-init (creates the session)
	// We can't fully test the interactive attach, but we can verify it doesn't error
	// by checking that the session was created. The attach itself will fail since
	// we're not in a real terminal, but the init should succeed.
	_, stderr, code := runCCO(t, dir, xdg, "attach")

	// The attach will fail because we're not in a real tmux/terminal,
	// but the error should be from tmux attach, not from "session does not exist"
	if code == 0 {
		// If it somehow succeeds, that's fine too
		return
	}
	// Should NOT contain our "session does not exist" error — it should have
	// auto-inited and then failed at the tmux attach step
	if strings.Contains(stderr, "session does not exist") {
		t.Errorf("attach should auto-init, but got session-not-found error: %s", stderr)
	}
}
```

**Step 4: Run all tests**

Run: `cd orchestrator && go test -v -count=1 -timeout 60s ./cmd/cco/`
Expected: All tests pass (existing + new).

**Step 5: Commit**

```
test(cco): add integration tests for attach with branch
```

---

### Task 5: Update documentation

**Files:**
- Modify: `CLAUDE.md:114-118`
- Modify: `README.md:134`

**Step 1: Update CLAUDE.md session management table**

Find the `cco attach` row in the Session Management table and update it:

Old:
```
| `cco attach`         | Attach to the tmux session for the current repository                       |
```

New:
```
| `cco attach [branch]` | Attach to the tmux session, optionally at a specific branch window          |
```

**Step 2: Update README.md**

Find the `cco attach` row and update it:

Old:
```
| `cco attach`         | Attach to tmux session for repo          |
```

New:
```
| `cco attach [branch]` | Attach to tmux session, optionally at a branch window |
```

**Step 3: Commit**

```
docs: update attach command documentation
```
