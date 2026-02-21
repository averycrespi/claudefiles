# Rename "session" to "workspace" Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Rename the "session" concept to "workspace" across the cco orchestrator, rename the data directory from `sessions/` to `worktrees/`, and change the tmux session naming from `{repo}-worktree` to `cco-{repo}`.

**Architecture:** Pure rename/refactor — no behavior changes. Rename the Go package from `internal/session` to `internal/workspace`, update all references in CLI commands, update path helpers, and update documentation.

**Tech Stack:** Go, tmux, git

---

### Task 1: Rename paths helpers and update unit tests

**Files:**
- Modify: `orchestrator/internal/paths/paths.go:22-35`
- Modify: `orchestrator/internal/paths/paths_test.go:26-58`

**Step 1: Update `paths.go` — rename `SessionDir` to `WorktreeDir` and update `TmuxSessionName`**

Replace `SessionDir` and `TmuxSessionName` in `orchestrator/internal/paths/paths.go`:

```go
// WorktreeDir returns the full path to a workspace's worktree directory.
func WorktreeDir(repo, branch string) string {
	return filepath.Join(DataDir(), "worktrees", repo, SanitizeBranch(branch))
}
```

```go
// TmuxSessionName returns the tmux session name for a repository.
func TmuxSessionName(repo string) string {
	return "cco-" + repo
}
```

**Step 2: Update `paths_test.go` — fix test expectations**

Replace `TestSessionDir` with `TestWorktreeDir`:

```go
func TestWorktreeDir(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/data")
	dir := WorktreeDir("myapp", "feat/thing")
	expected := "/data/cco/worktrees/myapp/feat-thing"
	if dir != expected {
		t.Errorf("WorktreeDir() = %q, want %q", dir, expected)
	}
}
```

Update `TestTmuxSessionName`:

```go
func TestTmuxSessionName(t *testing.T) {
	name := TmuxSessionName("myapp")
	if name != "cco-myapp" {
		t.Errorf("TmuxSessionName() = %q, want %q", name, "cco-myapp")
	}
}
```

**Step 3: Run unit tests to verify**

Run: `cd orchestrator && go test ./internal/paths/ -v -count=1`
Expected: All tests pass

**Step 4: Commit**

```bash
git add orchestrator/internal/paths/
git commit -m "refactor(cco): rename SessionDir to WorktreeDir, update TmuxSessionName format"
```

---

### Task 2: Rename `internal/session` package to `internal/workspace`

**Files:**
- Rename: `orchestrator/internal/session/session.go` → `orchestrator/internal/workspace/workspace.go`

**Step 1: Create `internal/workspace/` directory and move the file**

```bash
cd orchestrator && mkdir -p internal/workspace
mv internal/session/session.go internal/workspace/workspace.go
rmdir internal/session
```

**Step 2: Update the package declaration and all "session" references in `workspace.go`**

Change the package declaration from `package session` to `package workspace`.

Update all comments that say "session" to say "workspace" where referring to the conceptual unit. Key changes:

- Line 17 comment: `// Init ensures a tmux session exists for the repository.` — keep as-is (this refers to the tmux session, which is correct)
- Line 27: `sessionName` variable — rename to `tmuxSession`
- Line 37 comment: `// Add creates a new session:` → `// Add creates a new workspace:`
- Line 52-54: `sessionName` → `tmuxSession`, `sessionDir` → `worktreeDir`, update `paths.SessionDir` → `paths.WorktreeDir`
- Line 88 comment: `// Remove removes a session:` → `// Remove removes a workspace:`
- Line 98-100: Same variable renames as Add
- Line 176 comment: `// Notify adds a bell emoji to the tmux window for the current session.` → `// Notify adds a bell emoji to the tmux window for the current workspace.`
- Line 192 comment: `sessions/{repo}/{branch}/` → `worktrees/{repo}/{branch}/`
- Line 193: `sessionsDir` → `worktreesDir`, path component `"sessions"` → `"worktrees"`
- Line 196: error message `"cco sessions directory"` → `"cco worktrees directory"`
- Line 243 comment: `session directory` → `workspace directory`
- Line 270 comment: `session dir` → `worktree dir`
- Line 271: parameter name `sessionDir` → `worktreeDir` (and all usages in function body)

Rename local variables throughout the file:
- `sessionName` → `tmuxSession` (refers to the tmux session name)
- `sessionDir` → `worktreeDir` (refers to the filesystem path)
- `sessionsDir` → `worktreesDir` (in Notify function)
- Function parameter `sessionDir` in `runSetupScripts` and `copyLocalSettings` → `worktreeDir`

**Step 3: Verify the package compiles**

Run: `cd orchestrator && go build ./internal/workspace/`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add orchestrator/internal/session/ orchestrator/internal/workspace/
git commit -m "refactor(cco): rename session package to workspace"
```

---

### Task 3: Update CLI commands to use workspace package

**Files:**
- Modify: `orchestrator/cmd/add.go`
- Modify: `orchestrator/cmd/rm.go`
- Modify: `orchestrator/cmd/attach.go`
- Modify: `orchestrator/cmd/notify.go`
- Modify: `orchestrator/cmd/root.go`

**Step 1: Update imports and call sites in all four command files**

In `add.go`, `rm.go`, `attach.go`, `notify.go`:
- Change import from `"github.com/averycrespi/claudefiles/orchestrator/internal/session"` to `"github.com/averycrespi/claudefiles/orchestrator/internal/workspace"`
- Change all `session.X()` calls to `workspace.X()` calls

**Step 2: Update CLI help text**

In `add.go`:
- Short: `"Create a workspace and launch Claude Code"`
- Long: Replace "Create a session for the given branch" with "Create a workspace for the given branch"

In `rm.go`:
- Short: `"Remove a workspace and close its tmux window"`

In `attach.go`:
- Short: `"Attach to the tmux session, optionally at a specific branch window"` — keep as-is (this refers to the tmux session correctly)
- Long: Replace `"Attach to (or switch to) the worktree session."` with `"Attach to (or switch to) the workspace's tmux session."`

In `notify.go`:
- Short: `"Add notification bell to current workspace's tmux window"`
- Long: update `"session directory"` references if any

In `root.go`:
- Short: `"Claude Code Orchestrator - manage parallel Claude Code workspaces"`

**Step 3: Verify the binary builds**

Run: `cd orchestrator && go build ./...`
Expected: Compiles without errors

**Step 4: Commit**

```bash
git add orchestrator/cmd/
git commit -m "refactor(cco): update CLI commands to use workspace package"
```

---

### Task 4: Update integration tests

**Files:**
- Modify: `orchestrator/cmd/cco/integration_test.go`

**Step 1: Update test helper functions**

Rename `tmuxSessionName` helper (line 90-92):
```go
func tmuxSessionName(repoDir string) string {
	return "cco-" + filepath.Base(repoDir)
}
```

Rename `sessionDir` helper to `worktreeDir` (line 111-114):
```go
func worktreeDir(xdgDataHome, repoDir, branch string) string {
	sanitized := sanitizeBranch(branch)
	return filepath.Join(xdgDataHome, "cco", "worktrees", filepath.Base(repoDir), sanitized)
}
```

**Step 2: Update all test functions that reference `sessionDir` → `worktreeDir`**

Replace all calls to `sessionDir(...)` with `worktreeDir(...)` throughout the test file. Update variable names from `sd` comments like `"session dir should exist"` to `"worktree dir should exist"`.

Tests to update (variable name `sd` can stay as-is since it's just a short local var, but the helper call changes):
- `TestAddNewBranch`: `sessionDir(xdg, dir, ...)` → `worktreeDir(xdg, dir, ...)`
- `TestAddExistingBranch`: same
- `TestRm`: same, update assertion messages
- `TestBranchNameSanitization`: same
- `TestAddCopiesLocalSettings`: same
- `TestNotifyFromWorktree`: same
- `TestNotifyIdempotent`: same

Update assertion messages:
- `"session dir should exist"` → `"worktree dir should exist"`
- `"session dir should exist before rm"` → `"worktree dir should exist before rm"`
- `"session dir should not exist after rm"` → `"worktree dir should not exist after rm"`

**Step 3: Run integration tests to verify**

Run: `cd orchestrator && go test -v -count=1 -timeout 60s ./cmd/cco/`
Expected: All tests pass

**Step 4: Commit**

```bash
git add orchestrator/cmd/cco/integration_test.go
git commit -m "test(cco): update integration tests for workspace rename"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `README.md:126-139`
- Modify: `CLAUDE.md:108-125`

**Step 1: Update README.md — Claude Code Orchestrator section**

Replace lines 126-139 with:

```markdown
## Claude Code Orchestrator

`cco` (Claude Code Orchestrator) manages parallel Claude Code workspaces using Git worktrees and tmux. It replaces `cwm` with centralized worktree storage.

| Command              | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `cco add <branch>`   | Create workspace + launch Claude         |
| `cco rm <branch>`    | Remove workspace + close window          |
| `cco attach [branch]` | Attach to tmux session, optionally at a branch window |
| `cco notify`         | Add bell to window (for hooks)           |

Worktrees are stored at `~/.local/share/cco/worktrees/{repo}/{branch}/`.

**Note:** cco uses a dedicated tmux socket (`cco`) to avoid interfering with personal tmux sessions. Use `tmux -L cco ls` to list cco sessions.
```

**Step 2: Update CLAUDE.md — Session Management section**

Replace the "Session Management (cco)" section header and table (lines 108-119) with:

```markdown
### Workspace Management (cco)

| Command              | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `cco add <branch>`   | Create a workspace (worktree + window) and launch Claude Code               |
| `cco rm <branch>`    | Remove a workspace (worktree + window)                                      |
| `cco attach [branch]` | Attach to the tmux session, optionally at a specific branch window          |
| `cco notify`         | Add notification bell to tmux window for the current workspace              |
```

Also update the note below the table:
- `"cco uses a dedicated tmux socket (`cco`) to avoid interfering with personal tmux sessions. Use `tmux -L cco ls` to list cco sessions."` — keep as-is (refers to tmux sessions correctly)

**Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update cco documentation for workspace rename"
```
