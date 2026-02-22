# Rename sandbox "session" to "job" Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Rename the sandbox "session" concept to "job" across the cco orchestrator to avoid confusion with tmux sessions.

**Architecture:** Pure rename/refactor — no behavior changes. Rename types, functions, variables, file names, tmux pane options, and CLI usage strings.

**Tech Stack:** Go

---

### Task 1: Rename `session.go` → `job.go` and `session_test.go` → `job_test.go`

**Files:**
- Rename: `orchestrator/internal/sandbox/session.go` → `orchestrator/internal/sandbox/job.go`
- Rename: `orchestrator/internal/sandbox/session_test.go` → `orchestrator/internal/sandbox/job_test.go`

**Step 1: Move and rename the files**

```bash
cd orchestrator
mv internal/sandbox/session.go internal/sandbox/job.go
mv internal/sandbox/session_test.go internal/sandbox/job_test.go
```

**Step 2: Update `job.go` — rename function and update comments/errors**

In `orchestrator/internal/sandbox/job.go`:
- Rename `NewSessionID` → `NewJobID`
- Comment: `"session namespacing"` → `"job namespacing"`
- Error string: `"failed to generate session ID"` → `"failed to generate job ID"`

**Step 3: Update `job_test.go` — rename test functions and calls**

In `orchestrator/internal/sandbox/job_test.go`:
- `TestNewSessionID_Length` → `TestNewJobID_Length`, call `NewJobID()`
- `TestNewSessionID_Unique` → `TestNewJobID_Unique`, call `NewJobID()`
- `TestNewSessionID_HexChars` → `TestNewJobID_HexChars`, call `NewJobID()`

**Step 4: Run tests**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -run TestNewJobID`
Expected: All 3 tests pass

**Step 5: Commit**

```bash
git add orchestrator/internal/sandbox/
git commit -m "refactor(box): rename session.go to job.go, NewSessionID to NewJobID"
```

---

### Task 2: Rename `SessionExchangeDir` in paths package

**Files:**
- Modify: `orchestrator/internal/paths/paths.go:47-50`
- Modify: `orchestrator/internal/paths/paths_test.go:77-78`

**Step 1: Update `paths.go`**

Rename `SessionExchangeDir` → `JobExchangeDir` and update the parameter name and comment:

```go
// JobExchangeDir returns the exchange directory for a specific job.
func JobExchangeDir(jobID string) string {
	return filepath.Join(ExchangeDir(), jobID)
}
```

**Step 2: Update `paths_test.go`**

Rename `TestSessionExchangeDir` → `TestJobExchangeDir` and update the call to `JobExchangeDir("abc123")`.

**Step 3: Run tests**

Run: `cd orchestrator && go test ./internal/paths/ -count=1`
Expected: All tests pass

**Step 4: Commit**

```bash
git add orchestrator/internal/paths/
git commit -m "refactor(box): rename SessionExchangeDir to JobExchangeDir"
```

---

### Task 3: Rename `PreparedSession` and session variables in `sandbox.go`

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox.go:202-301`

**Step 1: Rename the struct and field**

- `PreparedSession` → `PreparedJob` (line 203)
- `SessionID` field → `JobID` (line 204)
- Comment on line 202: `"sandbox session"` → `"sandbox job"`

**Step 2: Rename variables and calls in `Prepare` method**

- Comment line 210: `"PreparedSession"` → `"PreparedJob"`
- Line 230 comment: `"Generate session ID"` → `"Generate job ID"`
- Line 231: `sessionID := NewSessionID()` → `jobID := NewJobID()`
- Line 232: `paths.SessionExchangeDir(sessionID)` → `paths.JobExchangeDir(jobID)`
- Line 245: `"/workspace/" + sessionID` → `"/workspace/" + jobID`
- Line 247: `"/exchange/"+sessionID+"/input.bundle"` → `"/exchange/"+jobID+"/input.bundle"`
- Line 256-259: `&PreparedSession{SessionID: sessionID, ...}` → `&PreparedJob{JobID: jobID, ...}`

**Step 3: Rename parameter and variables in `Pull` method**

- Line 264: `Pull(repoRoot, sessionID string, ...)` → `Pull(repoRoot, jobID string, ...)`
- Line 265: `paths.SessionExchangeDir(sessionID)` → `paths.JobExchangeDir(jobID)`
- Line 268: `"session %s"` → `"job %s"`, `sessionID` → `jobID`
- Line 301: `"pull complete for session %s", sessionID` → `"pull complete for job %s", jobID`

**Step 4: Run tests**

Run: `cd orchestrator && go build ./...`
Expected: Build succeeds (tests will be updated in next task)

**Step 5: Commit**

```bash
git add orchestrator/internal/sandbox/sandbox.go
git commit -m "refactor(box): rename PreparedSession to PreparedJob in sandbox package"
```

---

### Task 4: Update sandbox tests

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox_test.go:374-429`

**Step 1: Update `TestService_Prepare_Running`**

- Line 374 comment: `"session ID is random"` → `"job ID is random"`
- Line 382: `result.SessionID` → `result.JobID`
- Line 385: `result.SessionID` → `result.JobID`

**Step 2: Update `TestService_Pull_BundleNotFound_TimesOut`**

- Line 397 comment: `"nonexistent session ID"` → `"nonexistent job ID"`

**Step 3: Update `TestService_Pull_BundleFound`**

- Line 410: `sessionID := "testpull1"` → `jobID := "testpull1"`
- Line 411: `paths.SessionExchangeDir(sessionID)` → `paths.JobExchangeDir(jobID)`
- Line 413: `paths.SessionExchangeDir(sessionID)` → `paths.JobExchangeDir(jobID)`
- Line 425: `svc.Pull("/repo", sessionID, ...)` → `svc.Pull("/repo", jobID, ...)`

**Step 4: Run tests**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1`
Expected: All tests pass

**Step 5: Commit**

```bash
git add orchestrator/internal/sandbox/sandbox_test.go
git commit -m "test(box): update sandbox tests for session-to-job rename"
```

---

### Task 5: Update CLI commands (`box_push.go` and `box_pull.go`)

**Files:**
- Modify: `orchestrator/cmd/box_push.go:69,94,103`
- Modify: `orchestrator/cmd/box_pull.go:15,19,27,58`

**Step 1: Update `box_push.go`**

- Line 69 comment: `"Prepare sandbox session"` → `"Prepare sandbox job"`
- Line 94: `"cco-session"` → `"cco-job"`, `prepared.SessionID` → `prepared.JobID`
- Line 103: `"session %s started — pull with: cco box pull %s", prepared.SessionID, prepared.SessionID` → `"job %s started — pull with: cco box pull %s", prepared.JobID, prepared.JobID`

**Step 2: Update `box_pull.go`**

- Line 15: `"pull <session-id>"` → `"pull <job-id>"`
- Line 19: `sessionID := args[0]` → `jobID := args[0]`
- Line 27: `svc.Pull(cwd, sessionID, ...)` → `svc.Pull(cwd, jobID, ...)`
- Line 58: `"cco-session"` → `"cco-job"`, `sessionID` → `jobID`

**Step 3: Verify build**

Run: `cd orchestrator && go build ./...`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add orchestrator/cmd/box_push.go orchestrator/cmd/box_pull.go
git commit -m "refactor(box): rename session to job in push/pull commands"
```

---

### Task 6: Update tmux test expectations

**Files:**
- Modify: `orchestrator/internal/tmux/tmux_test.go:237,240,257,260,268,271`

**Step 1: Replace all `"cco-session"` strings with `"cco-job"`**

Update all 6 occurrences of `"cco-session"` → `"cco-job"` in the test expectations for `SetPaneOption` and `FindPaneByOption`.

**Step 2: Run tests**

Run: `cd orchestrator && go test ./internal/tmux/ -count=1`
Expected: All tests pass

**Step 3: Commit**

```bash
git add orchestrator/internal/tmux/tmux_test.go
git commit -m "test(box): update tmux tests for cco-session to cco-job rename"
```

---

### Task 7: Final verification

**Files:**
- No new files

**Step 1: Run all tests**

Run: `cd orchestrator && go test ./... -count=1`
Expected: All tests pass (integration tests may fail due to sandbox restrictions — that's pre-existing)

**Step 2: Grep for any remaining sandbox "session" references**

Run: `grep -rn "sessionID\|SessionID\|cco-session\|PreparedSession\|NewSessionID\|SessionExchangeDir" --include="*.go" orchestrator/`
Expected: No matches (tmux `SessionExists`/`CreateSession` etc. should NOT match these patterns)

**Step 3: Install**

Run: `cd orchestrator && go install ./cmd/cco`
