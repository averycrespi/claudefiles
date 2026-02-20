# Remove `cco init` Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Remove the redundant `cco init` CLI command since `cco add` already handles initialization internally.

**Architecture:** Delete the command registration file, remove/update affected tests, keep `session.Init()` as an internal function, and update documentation.

**Tech Stack:** Go, Cobra CLI, tmux integration tests

---

### Task 1: Delete `init` command and remove standalone init tests

**Files:**
- Delete: `orchestrator/cmd/init.go`
- Modify: `orchestrator/cmd/cco/integration_test.go`

**Step 1: Delete the init command file**

Delete `orchestrator/cmd/init.go` entirely.

**Step 2: Remove `TestInitOutsideGitRepo` test**

Remove lines 151-160 from `integration_test.go`:

```go
func TestInitOutsideGitRepo(t *testing.T) {
	dir := resolvedTempDir(t)
	_, stderr, code := runCCO(t, dir, resolvedTempDir(t), "init")
	if code == 0 {
		t.Error("init should fail outside git repo")
	}
	if !strings.Contains(stderr, "not a git repository") {
		t.Errorf("expected 'not a git repository' in stderr, got: %s", stderr)
	}
}
```

This is already covered by `TestAddOutsideGitRepo`.

**Step 3: Remove `TestInit` test**

Remove lines 184-207 from `integration_test.go`:

```go
func TestInit(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	t.Cleanup(func() { killTmuxSession(session) })

	if tmuxSessionExists(session) {
		t.Fatal("session should not exist before init")
	}

	stdout, _, code := runCCO(t, dir, resolvedTempDir(t), "init")
	if code != 0 {
		t.Fatalf("init exited %d", code)
	}
	if !strings.Contains(stdout, "Creating tmux session") {
		t.Errorf("expected 'Creating tmux session' in output, got: %s", stdout)
	}
	if !tmuxSessionExists(session) {
		t.Error("session should exist after init")
	}
	windows := tmuxListWindows(t, session)
	if !contains(windows, "main") {
		t.Errorf("expected 'main' window, got: %v", windows)
	}
}
```

Session creation is implicitly tested by every `TestAdd*` test.

**Step 4: Remove `TestInitIdempotent` test**

Remove lines 209-223 from `integration_test.go`:

```go
func TestInitIdempotent(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	runCCO(t, dir, xdg, "init")
	stdout, _, code := runCCO(t, dir, xdg, "-v", "init")
	if code != 0 {
		t.Fatalf("second init exited %d", code)
	}
	if !strings.Contains(stdout, "already exists") {
		t.Errorf("expected 'already exists' on second init, got: %s", stdout)
	}
}
```

Init idempotency is implicitly tested by `TestAddIdempotent`.

**Step 5: Rewrite `TestVerboseFlag` to use `add` instead of `init`**

The current test uses `init` to verify verbose logging. Replace with:

```go
func TestVerboseFlag(t *testing.T) {
	dir := setupRepo(t)
	session := tmuxSessionName(dir)
	xdg := resolvedTempDir(t)
	t.Cleanup(func() { killTmuxSession(session) })

	// First add creates the session and worktree
	runCCO(t, dir, xdg, "add", "verbose-branch")

	// Second add without -v should not show "already exists"
	stdout, _, code := runCCO(t, dir, xdg, "add", "verbose-branch")
	if code != 0 {
		t.Fatalf("add exited %d", code)
	}
	if strings.Contains(stdout, "already exists") {
		t.Error("without -v, debug messages should be hidden")
	}

	// Second add with -v should show "already exists"
	stdout, _, code = runCCO(t, dir, xdg, "-v", "add", "verbose-branch")
	if code != 0 {
		t.Fatalf("add -v exited %d", code)
	}
	if !strings.Contains(stdout, "already exists") {
		t.Errorf("with -v, expected 'already exists' in output, got: %s", stdout)
	}
}
```

**Step 6: Run tests to verify everything passes**

Run: `cd orchestrator && go test -v -count=1 -timeout 60s`
Expected: All tests pass, no references to `init` command remain.

**Step 7: Commit**

```bash
git add -A orchestrator/cmd/init.go orchestrator/cmd/cco/integration_test.go
git commit -m "refactor(cco): remove init command"
```

---

### Task 2: Update documentation

**Files:**
- Modify: `CLAUDE.md` — remove `cco init` row from Session Management table
- Modify: `README.md` — remove `cco init` row from Claude Code Orchestrator table

**Step 1: Update `CLAUDE.md`**

In the "Session Management (cco)" table, remove the `cco init` row:

```markdown
| Command              | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `cco add <branch>`   | Create a session (worktree + window) and launch Claude Code                 |
| `cco rm <branch>`    | Remove a session (worktree + window)                                        |
| `cco attach`         | Attach to the tmux session for the current repository                       |
| `cco notify`         | Add notification bell to tmux window for the current session                |
```

**Step 2: Update `README.md`**

In the "Claude Code Orchestrator" table, remove the `cco init` row:

```markdown
| Command              | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `cco add <branch>`   | Create session + launch Claude           |
| `cco rm <branch>`    | Remove session + close window            |
| `cco attach`         | Attach to tmux session for repo          |
| `cco notify`         | Add bell to window (for hooks)           |
```

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: remove cco init from documentation"
```
