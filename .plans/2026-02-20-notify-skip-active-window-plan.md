# Skip Bell on Active Tmux Window Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Skip adding the bell emoji to a tmux window that is already the active window in its session.

**Architecture:** Add an `IsActiveWindow` function to the `tmux` package that queries tmux for `#{window_active}`. Call it from `workspace.Notify()` before renaming. If the query fails, treat as "not active" (better to over-notify).

**Tech Stack:** Go, tmux `display-message` command

---

### Task 1: Add `IsActiveWindow` to tmux package

**Files:**
- Modify: `orchestrator/internal/tmux/tmux.go`
- Test: `orchestrator/internal/tmux/tmux_test.go`

**Step 1: Write the failing test**

Add to `tmux_test.go`:

```go
func TestIsActiveWindow(t *testing.T) {
	session := testSession(t)
	CreateSession(session, "main")
	dir := t.TempDir()
	CreateWindow(session, "other", dir)

	// The first window created with the session is active by default
	if !IsActiveWindow(session, "main") {
		t.Error("main window should be active (it was created with the session)")
	}
	if IsActiveWindow(session, "other") {
		t.Error("other window should not be active")
	}
}

func TestIsActiveWindowNonexistent(t *testing.T) {
	session := testSession(t)
	CreateSession(session, "main")

	// Nonexistent window should return false (not error)
	if IsActiveWindow(session, "no-such-window") {
		t.Error("nonexistent window should return false")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/tmux/ -run TestIsActiveWindow -v -count=1`
Expected: FAIL — `IsActiveWindow` not defined

**Step 3: Write minimal implementation**

Add to `tmux.go`:

```go
func IsActiveWindow(session, window string) bool {
	cmd := tmuxCmd("display-message", "-t", session+":"+window, "-p", "#{window_active}")
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "1"
}
```

**Step 4: Run test to verify it passes**

Run: `cd orchestrator && go test ./internal/tmux/ -run TestIsActiveWindow -v -count=1`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/tmux/tmux.go orchestrator/internal/tmux/tmux_test.go
git commit -m "feat(cco): add IsActiveWindow to tmux package"
```

---

### Task 2: Skip bell when window is active in `Notify()`

**Files:**
- Modify: `orchestrator/internal/workspace/workspace.go:229-237`
- Test: `orchestrator/cmd/cco/integration_test.go`

**Step 1: Write the failing integration test**

Add to `integration_test.go`:

```go
func TestNotifySkipsActiveWindow(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	runCCO(t, dir, xdg, "add", "active-branch")
	sd := worktreeDir(xdg, dir, "active-branch")

	// Select the active-branch window so it becomes active
	exec.Command("tmux", "-L", tmux.SocketName, "select-window", "-t", session+":active-branch").Run()

	// Notify should skip because the window is active
	_, stderr, code := runCCO(t, sd, xdg, "notify")
	if code != 0 {
		t.Fatalf("notify exited %d", code)
	}
	if !strings.Contains(stderr, "skipped: window 'active-branch' is currently active") {
		t.Errorf("expected skip message for active window, got stderr: %s", stderr)
	}

	// Window should NOT have bell prefix
	windows := tmuxListWindows(t, session)
	if contains(windows, "🔔 active-branch") {
		t.Error("active window should not get bell prefix")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test -v -count=1 -timeout 60s ./cmd/cco/ -run TestNotifySkipsActiveWindow`
Expected: FAIL — bell gets added despite window being active

**Step 3: Add the active-window check to `Notify()`**

In `workspace.go`, in the `Notify` function, add the active-window check in the loop that finds the matching window (the second `for` loop, around line 229). Replace:

```go
	for _, w := range windows {
		if w == windowName {
			logging.Info("adding notification to tmux window: %s", windowName)
			if err := tmux.RenameWindow(tmuxSession, windowName, bellName); err != nil {
				fmt.Fprintf(os.Stderr, "skipped: could not rename tmux window '%s'\n", windowName)
			}
			return nil
		}
	}
```

With:

```go
	for _, w := range windows {
		if w == windowName {
			if tmux.IsActiveWindow(tmuxSession, windowName) {
				fmt.Fprintf(os.Stderr, "skipped: window '%s' is currently active\n", windowName)
				return nil
			}
			logging.Info("adding notification to tmux window: %s", windowName)
			if err := tmux.RenameWindow(tmuxSession, windowName, bellName); err != nil {
				fmt.Fprintf(os.Stderr, "skipped: could not rename tmux window '%s'\n", windowName)
			}
			return nil
		}
	}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test -v -count=1 -timeout 60s ./cmd/cco/ -run TestNotify`
Expected: All notify tests PASS (including existing ones)

Also run: `cd orchestrator && go test -v -count=1 -timeout 60s ./cmd/cco/ -run TestNotifyFromWorktree`
Note: `TestNotifyFromWorktree` creates the window with `-d` (detached), so it should NOT be the active window — it should still get the bell. Verify this passes.

**Step 5: Run full test suite**

Run: `cd orchestrator && go test -v -count=1 -timeout 60s ./...`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add orchestrator/internal/workspace/workspace.go orchestrator/cmd/cco/integration_test.go
git commit -m "feat(cco): skip bell notification on active tmux window"
```

---

<!-- No documentation updates needed — the notify command behavior is not documented beyond the CLI help text, which remains accurate (it still adds a bell, just conditionally). -->
