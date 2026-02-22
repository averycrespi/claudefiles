# Sandbox Push/Pull Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add `cco box push` and `cco box pull` commands that transfer work to/from the sandbox VM using git bundles.

**Architecture:** A shared writable mount (`~/.local/share/cco/exchange/` ↔ `/exchange/`) enables bundle exchange. Push creates a git bundle of the current branch, clones it inside the VM, and launches Claude interactively with an autonomous execution skill. Pull polls for the output bundle and fast-forward merges the sandbox commits back onto the host branch. Each session gets a unique ID for parallel execution support.

**Tech Stack:** Go (cobra CLI, testify), git bundles, Lima VM mounts, Claude Code skills (markdown)

---

### Task 1: Add Exchange Path Helpers

**Files:**
- Modify: `orchestrator/internal/paths/paths.go:1-40`
- Modify: `orchestrator/internal/paths/paths_test.go`

**Step 1: Write the failing tests**

Add to `orchestrator/internal/paths/paths_test.go`:

```go
func TestExchangeDir(t *testing.T) {
	dir := ExchangeDir()
	assert.Contains(t, dir, "cco")
	assert.True(t, strings.HasSuffix(dir, filepath.Join("cco", "exchange")))
}

func TestSessionExchangeDir(t *testing.T) {
	dir := SessionExchangeDir("abc123")
	assert.Contains(t, dir, "abc123")
	assert.True(t, strings.HasSuffix(dir, filepath.Join("exchange", "abc123")))
}
```

Add `"strings"` to the test imports if not already present.

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/paths/ -run "TestExchangeDir|TestSessionExchangeDir" -v -count=1`
Expected: FAIL — `ExchangeDir` and `SessionExchangeDir` undefined

**Step 3: Write minimal implementation**

Add to `orchestrator/internal/paths/paths.go`:

```go
// ExchangeDir returns the directory for sandbox bundle exchange.
func ExchangeDir() string {
	return filepath.Join(DataDir(), "exchange")
}

// SessionExchangeDir returns the exchange directory for a specific session.
func SessionExchangeDir(sessionID string) string {
	return filepath.Join(ExchangeDir(), sessionID)
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/paths/ -v -count=1`
Expected: All PASS

**Step 5: Commit**

```bash
cd orchestrator && git add internal/paths/paths.go internal/paths/paths_test.go
git commit -m "feat(paths): add exchange directory helpers"
```

---

### Task 2: Add Session ID Generation to Sandbox Package

**Files:**
- Create: `orchestrator/internal/sandbox/session.go`
- Create: `orchestrator/internal/sandbox/session_test.go`

**Step 1: Write the failing test**

Create `orchestrator/internal/sandbox/session_test.go`:

```go
package sandbox

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewSessionID_Length(t *testing.T) {
	id := NewSessionID()
	assert.Len(t, id, 8)
}

func TestNewSessionID_Unique(t *testing.T) {
	id1 := NewSessionID()
	id2 := NewSessionID()
	assert.NotEqual(t, id1, id2)
}

func TestNewSessionID_HexChars(t *testing.T) {
	id := NewSessionID()
	for _, c := range id {
		assert.True(t, (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'),
			"expected hex char, got %c", c)
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/sandbox/ -run "TestNewSessionID" -v -count=1`
Expected: FAIL — `NewSessionID` undefined

**Step 3: Write minimal implementation**

Create `orchestrator/internal/sandbox/session.go`:

```go
package sandbox

import (
	"crypto/rand"
	"fmt"
)

// NewSessionID generates a short random hex string for session namespacing.
func NewSessionID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		panic("failed to generate session ID: " + err.Error())
	}
	return fmt.Sprintf("%x", b)
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -v -count=1`
Expected: All PASS

**Step 5: Commit**

```bash
cd orchestrator && git add internal/sandbox/session.go internal/sandbox/session_test.go
git commit -m "feat(sandbox): add session ID generation"
```

---

### Task 3: Add Lima Writable Mount for Exchange Directory

**Files:**
- Modify: `orchestrator/internal/sandbox/files/lima.yaml`
- Modify: `orchestrator/internal/sandbox/sandbox_test.go`

**Step 1: Write the failing test**

Add to `orchestrator/internal/sandbox/sandbox_test.go`:

```go
func TestEmbeddedLimaTemplate_ContainsExchangeMount(t *testing.T) {
	content := string(limaTemplate)
	assert.Contains(t, content, "/exchange")
	assert.Contains(t, content, "mounts:")
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/sandbox/ -run "TestEmbeddedLimaTemplate_ContainsExchangeMount" -v -count=1`
Expected: FAIL — lima.yaml doesn't contain mount config yet

**Step 3: Add the writable mount to lima.yaml**

Add the following section to the **end** of `orchestrator/internal/sandbox/files/lima.yaml`, before the `message:` block:

```yaml
mounts:
- location: "~/.local/share/cco/exchange"
  mountPoint: "/exchange"
  writable: true
```

The full file should end with:

```yaml
mounts:
- location: "~/.local/share/cco/exchange"
  mountPoint: "/exchange"
  writable: true

message: |
  Claude Code sandbox VM is ready.
  Run `limactl shell cco-sandbox` to enter the VM.
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -v -count=1`
Expected: All PASS

**Step 5: Commit**

```bash
cd orchestrator && git add internal/sandbox/files/lima.yaml internal/sandbox/sandbox_test.go
git commit -m "feat(sandbox): add writable exchange mount to lima template"
```

---

### Task 4: Add Push Method to Sandbox Service

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox.go`
- Modify: `orchestrator/internal/sandbox/sandbox_test.go`

The sandbox service needs a new dependency: an `exec.Runner` for running git commands on the host. Currently it only has a `limaClient`. We also need `gitClient` to get the current branch name.

**Step 1: Write the failing tests**

Add to `orchestrator/internal/sandbox/sandbox_test.go`:

```go
// mockRunner implements exec.Runner for tests.
type mockRunner struct {
	mock.Mock
}

func (m *mockRunner) Run(name string, args ...string) ([]byte, error) {
	callArgs := []interface{}{name}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	ret := m.Called(callArgs...)
	return ret.Get(0).([]byte), ret.Error(1)
}

func (m *mockRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
	callArgs := []interface{}{dir, name}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	ret := m.Called(callArgs...)
	return ret.Get(0).([]byte), ret.Error(1)
}

func (m *mockRunner) RunInteractive(name string, args ...string) error {
	callArgs := []interface{}{name}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	return m.Called(callArgs...).Error(0)
}

func TestService_Push_NotRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	runner := new(mockRunner)
	svc := NewService(lima, logging.NoopLogger{}, runner)

	_, err := svc.Push("/repo", ".plans/test-plan.md")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Push_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)

	runner := new(mockRunner)
	// git rev-parse --abbrev-ref HEAD
	runner.On("RunDir", "/repo", "git", "rev-parse", "--abbrev-ref", "HEAD").Return([]byte("main\n"), nil)
	// git bundle create (match any args since session ID is random)
	runner.On("Run", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return([]byte(""), nil)
	// mkdir exchange dir
	runner.On("Run", "mkdir", "-p", mock.Anything).Return([]byte(""), nil)

	svc := NewService(lima, logging.NoopLogger{}, runner)

	sessionID, err := svc.Push("/repo", ".plans/test-plan.md")

	require.NoError(t, err)
	assert.Len(t, sessionID, 8)
	lima.AssertCalled(t, "Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/sandbox/ -run "TestService_Push" -v -count=1`
Expected: FAIL — `Push` undefined, `NewService` wrong number of args

**Step 3: Write minimal implementation**

Update `orchestrator/internal/sandbox/sandbox.go`. The `Service` struct needs an `exec.Runner` added. Update `NewService` and add `Push`:

```go
package sandbox

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
)

// limaClient defines the lima operations needed by the sandbox service.
type limaClient interface {
	Status() (string, error)
	Create(templatePath string) error
	Start() error
	Stop() error
	Delete() error
	Copy(src, dst string) error
	Shell(args ...string) error
}

// Service manages the sandbox VM lifecycle.
type Service struct {
	lima   limaClient
	logger logging.Logger
	runner exec.Runner
}

// NewService returns a sandbox Service.
func NewService(lima limaClient, logger logging.Logger, runner exec.Runner) *Service {
	return &Service{lima: lima, logger: logger, runner: runner}
}
```

Then add the `Push` method:

```go
// Push bundles the current branch, clones it in the VM, and launches Claude.
func (s *Service) Push(repoRoot, planPath string) (string, error) {
	status, err := s.lima.Status()
	if err != nil {
		return "", err
	}
	switch status {
	case "":
		return "", fmt.Errorf("sandbox not created, run `cco box create`")
	case "Stopped":
		return "", fmt.Errorf("sandbox not running, run `cco box start`")
	}

	// Get current branch
	out, err := s.runner.RunDir(repoRoot, "git", "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", fmt.Errorf("failed to get current branch: %w", err)
	}
	branch := strings.TrimSpace(string(out))

	// Generate session ID and create exchange directory
	sessionID := NewSessionID()
	exchangeDir := paths.SessionExchangeDir(sessionID)
	if err := os.MkdirAll(exchangeDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create exchange directory: %w", err)
	}

	// Create git bundle
	bundlePath := filepath.Join(exchangeDir, "input.bundle")
	s.logger.Info("creating bundle for branch %s...", branch)
	if out, err := s.runner.RunDir(repoRoot, "git", "bundle", "create", bundlePath, branch); err != nil {
		return "", fmt.Errorf("git bundle create failed: %s", strings.TrimSpace(string(out)))
	}

	// Clone from bundle inside VM
	guestWorkspace := "/workspace/" + sessionID
	s.logger.Info("cloning into sandbox workspace %s...", guestWorkspace)
	if err := s.lima.Shell("--", "git", "clone", "/exchange/"+sessionID+"/input.bundle", guestWorkspace); err != nil {
		return "", fmt.Errorf("git clone in sandbox failed: %w", err)
	}

	// Launch Claude interactively
	s.logger.Info("launching claude in sandbox (session %s)...", sessionID)
	prompt := fmt.Sprintf("/executing-plans-in-sandbox %s", planPath)
	if err := s.lima.Shell("--", "bash", "-c",
		fmt.Sprintf("cd %s && claude --dangerously-skip-permissions %q", guestWorkspace, prompt)); err != nil {
		return sessionID, fmt.Errorf("claude exited with error: %w", err)
	}

	return sessionID, nil
}
```

**Step 4: Update all existing test call sites**

Every existing test that calls `NewService` needs the runner parameter. For tests that don't use it, pass `nil`:

Update all existing `NewService(lima, logging.NoopLogger{})` calls to `NewService(lima, logging.NoopLogger{}, nil)` in `sandbox_test.go`.

**Step 5: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -v -count=1`
Expected: All PASS

**Step 6: Update wire.go**

Update `orchestrator/cmd/wire.go` — `newSandboxService()` must pass the runner:

```go
func newSandboxService() *sandbox.Service {
	runner := ccoexec.NewOSRunner()
	logger := logging.NewStdLogger(verbose)
	return sandbox.NewService(
		lima.NewClient(runner),
		logger,
		runner,
	)
}
```

**Step 7: Verify build**

Run: `cd orchestrator && go build ./...`
Expected: Build succeeds

**Step 8: Commit**

```bash
cd orchestrator && git add internal/sandbox/sandbox.go internal/sandbox/sandbox_test.go cmd/wire.go
git commit -m "feat(sandbox): add Push method for bundle transfer to VM"
```

---

### Task 5: Add Pull Method to Sandbox Service

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox.go`
- Modify: `orchestrator/internal/sandbox/sandbox_test.go`

**Step 1: Write the failing tests**

Add to `orchestrator/internal/sandbox/sandbox_test.go`:

```go
func TestService_Pull_BundleNotFound_TimesOut(t *testing.T) {
	lima := new(mockLimaClient)
	runner := new(mockRunner)
	svc := NewService(lima, logging.NoopLogger{}, runner)

	// Use a nonexistent session ID — bundle will never appear
	err := svc.Pull("/repo", "nonexistent", 100*time.Millisecond, 50*time.Millisecond)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "timed out")
}

func TestService_Pull_BundleFound(t *testing.T) {
	lima := new(mockLimaClient)
	runner := new(mockRunner)
	svc := NewService(lima, logging.NoopLogger{}, runner)

	// Create a temporary exchange dir with a fake bundle
	sessionID := "testpull1"
	exchangeDir := paths.SessionExchangeDir(sessionID)
	require.NoError(t, os.MkdirAll(exchangeDir, 0o755))
	defer os.RemoveAll(paths.SessionExchangeDir(sessionID))

	bundlePath := filepath.Join(exchangeDir, "output.bundle")
	require.NoError(t, os.WriteFile(bundlePath, []byte("fake"), 0o644))

	// git bundle verify
	runner.On("RunDir", "/repo", "git", "bundle", "verify", bundlePath).Return([]byte("ok\n"), nil)
	// git fetch
	runner.On("RunDir", "/repo", "git", "fetch", bundlePath).Return([]byte(""), nil)
	// git merge --ff-only FETCH_HEAD
	runner.On("RunDir", "/repo", "git", "merge", "--ff-only", "FETCH_HEAD").Return([]byte(""), nil)

	err := svc.Pull("/repo", sessionID, 5*time.Second, 50*time.Millisecond)

	require.NoError(t, err)
	runner.AssertCalled(t, "RunDir", "/repo", "git", "bundle", "verify", bundlePath)
	runner.AssertCalled(t, "RunDir", "/repo", "git", "merge", "--ff-only", "FETCH_HEAD")

	// Exchange dir should be cleaned up
	_, statErr := os.Stat(exchangeDir)
	assert.True(t, os.IsNotExist(statErr))
}
```

Add `"time"` and `"os"` to the test file imports. Also add the paths import: `"github.com/averycrespi/claudefiles/orchestrator/internal/paths"`.

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/sandbox/ -run "TestService_Pull" -v -count=1`
Expected: FAIL — `Pull` undefined

**Step 3: Write minimal implementation**

Add to `orchestrator/internal/sandbox/sandbox.go`:

```go
// Pull polls for an output bundle and fast-forward merges it into the current branch.
func (s *Service) Pull(repoRoot, sessionID string, timeout, interval time.Duration) error {
	exchangeDir := paths.SessionExchangeDir(sessionID)
	bundlePath := filepath.Join(exchangeDir, "output.bundle")

	s.logger.Info("waiting for output bundle (session %s)...", sessionID)

	deadline := time.Now().Add(timeout)
	for {
		if _, err := os.Stat(bundlePath); err == nil {
			break
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out waiting for output bundle at %s", bundlePath)
		}
		time.Sleep(interval)
	}

	s.logger.Info("bundle found, verifying...")
	if out, err := s.runner.RunDir(repoRoot, "git", "bundle", "verify", bundlePath); err != nil {
		return fmt.Errorf("bundle verification failed: %s", strings.TrimSpace(string(out)))
	}

	s.logger.Info("fetching from bundle...")
	if out, err := s.runner.RunDir(repoRoot, "git", "fetch", bundlePath); err != nil {
		return fmt.Errorf("git fetch from bundle failed: %s", strings.TrimSpace(string(out)))
	}

	s.logger.Info("fast-forward merging...")
	if out, err := s.runner.RunDir(repoRoot, "git", "merge", "--ff-only", "FETCH_HEAD"); err != nil {
		return fmt.Errorf("fast-forward merge failed (branches may have diverged): %s", strings.TrimSpace(string(out)))
	}

	// Clean up exchange directory
	if err := os.RemoveAll(exchangeDir); err != nil {
		s.logger.Info("warning: failed to clean up exchange directory: %s", err)
	}

	s.logger.Info("pull complete for session %s", sessionID)
	return nil
}
```

Add `"time"` to the imports in `sandbox.go`.

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -v -count=1`
Expected: All PASS

**Step 5: Commit**

```bash
cd orchestrator && git add internal/sandbox/sandbox.go internal/sandbox/sandbox_test.go
git commit -m "feat(sandbox): add Pull method for bundle retrieval from VM"
```

---

### Task 6: Add `cco box push` CLI Command

**Files:**
- Create: `orchestrator/cmd/box_push.go`

**Step 1: Write the CLI command**

Create `orchestrator/cmd/box_push.go`:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var boxPushCmd = &cobra.Command{
	Use:   "push <plan-path>",
	Short: "Push a plan into the sandbox for execution",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		planPath := args[0]

		// Verify plan file exists
		if _, err := os.Stat(planPath); os.IsNotExist(err) {
			return fmt.Errorf("plan file not found: %s", planPath)
		}

		// Get repo root
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		svc := newSandboxService()
		sessionID, err := svc.Push(cwd, planPath)
		if err != nil {
			return err
		}

		fmt.Printf("Session %s complete. Pull with: cco box pull %s\n", sessionID, sessionID)
		return nil
	},
}

func init() { boxCmd.AddCommand(boxPushCmd) }
```

**Step 2: Verify build**

Run: `cd orchestrator && go build ./...`
Expected: Build succeeds

**Step 3: Verify CLI help**

Run: `cd orchestrator && go run ./cmd/cco box push --help`
Expected: Shows usage for push command

**Step 4: Commit**

```bash
cd orchestrator && git add cmd/box_push.go
git commit -m "feat(cli): add cco box push command"
```

---

### Task 7: Add `cco box pull` CLI Command

**Files:**
- Create: `orchestrator/cmd/box_pull.go`

**Step 1: Write the CLI command**

Create `orchestrator/cmd/box_pull.go`:

```go
package cmd

import (
	"os"
	"time"

	"fmt"

	"github.com/spf13/cobra"
)

var boxPullCmd = &cobra.Command{
	Use:   "pull <session-id>",
	Short: "Pull sandbox results back to the host",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		sessionID := args[0]

		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		svc := newSandboxService()
		return svc.Pull(cwd, sessionID, 30*time.Minute, 3*time.Second)
	},
}

func init() { boxCmd.AddCommand(boxPullCmd) }
```

**Step 2: Verify build**

Run: `cd orchestrator && go build ./...`
Expected: Build succeeds

**Step 3: Verify CLI help**

Run: `cd orchestrator && go run ./cmd/cco box pull --help`
Expected: Shows usage for pull command

**Step 4: Commit**

```bash
cd orchestrator && git add cmd/box_pull.go
git commit -m "feat(cli): add cco box pull command"
```

---

### Task 8: Create `executing-plans-in-sandbox` Skill

**Files:**
- Create: `orchestrator/internal/sandbox/files/executing-plans-in-sandbox.md`
- Modify: `orchestrator/internal/sandbox/embed.go`
- Modify: `orchestrator/internal/sandbox/sandbox_test.go`

This skill is adapted from `claude/skills/executing-plans/SKILL.md` with three changes: (1) autonomous — no `AskUserQuestion` or user prompts, (2) no `/complete-work` at the end, (3) final step writes a git bundle to `/exchange/<session-id>/output.bundle`.

**Step 1: Write the failing test**

Add to `orchestrator/internal/sandbox/sandbox_test.go`:

```go
func TestEmbeddedFiles_ExecutingPlansInSandbox(t *testing.T) {
	assert.NotEmpty(t, executingPlansInSandboxSkill)
	content := string(executingPlansInSandboxSkill)
	assert.Contains(t, content, "executing-plans-in-sandbox")
	assert.Contains(t, content, "git bundle create")
	assert.Contains(t, content, "/exchange/")
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/sandbox/ -run "TestEmbeddedFiles_ExecutingPlansInSandbox" -v -count=1`
Expected: FAIL — `executingPlansInSandboxSkill` undefined

**Step 3: Create the skill file**

Create `orchestrator/internal/sandbox/files/executing-plans-in-sandbox.md`:

```markdown
---
name: executing-plans-in-sandbox
description: Autonomous plan execution inside the sandbox VM - executes all tasks and writes output bundle
---

# Executing Plans in Sandbox

## Overview

Execute implementation plans autonomously inside the sandbox VM. This is a variant of the standard executing-plans skill adapted for unattended execution: no user prompts, no confirmation steps, and writes a git bundle as the final output.

**Announce at start:** "I'm executing this plan autonomously in the sandbox."

## The Process

```
For each task triplet (Implement → Spec Review → Code Review):
  1. Mark "Implement" in_progress
  2. Dispatch implementer subagent with full task text
  3. Implementer implements, tests, commits, self-reviews
  4. Parse implementer report, capture agent ID and commit SHA
  5. Mark "Implement" complete
  6. Mark "Spec Review" in_progress
  7. Dispatch spec reviewer subagent
  8. If APPROVED → mark "Spec Review" complete
     If ISSUES → resume implementer to fix, re-dispatch spec reviewer
  9. Mark "Code Review" in_progress
  10. Dispatch code quality reviewer subagent
  11. If APPROVED → mark "Code Review" complete
      If ISSUES → resume implementer to fix, re-dispatch code reviewer
  12. Proceed to next triplet (now unblocked)

After all triplets:
  Write output git bundle
```

### Step 1: Load Plan and Initialize Tasks

1. Read the plan file (path provided as argument)
2. Review critically - if there are fundamental blockers, stop and report
3. Initialize task tracking: create all task triplets from the plan

**IMPORTANT:** Do NOT ask the user any questions. Do NOT use `AskUserQuestion`. If existing tasks are found, always continue from the first incomplete triplet.

### Creating Tasks from Plan

Parse the plan document and create a **task triplet** for each task:

**For each Task N in the plan:**

1. **Create Implementation task:**
   ```
   TaskCreate:
     subject: "Task N: Implement [Component Name]"
     description: |
       [Copy task content from plan: Files, Steps, Acceptance Criteria]
     activeForm: "Implementing [Component Name]"
   ```

2. **Create Spec Review task:**
   ```
   TaskCreate:
     subject: "Task N: Spec Review"
     description: |
       Review implementation of Task N for spec compliance.
       Verify all requirements are met, nothing extra added.
     activeForm: "Reviewing spec compliance for [Component Name]"
   ```

3. **Create Code Review task:**
   ```
   TaskCreate:
     subject: "Task N: Code Review"
     description: |
       Review implementation of Task N for code quality.
       Check tests, error handling, maintainability.
     activeForm: "Reviewing code quality for [Component Name]"
   ```

**After all tasks created, set blocking relationships:**

```
# Within each triplet:
TaskUpdate:
  taskId: [spec-review-id]
  addBlockedBy: [implement-id]

TaskUpdate:
  taskId: [code-review-id]
  addBlockedBy: [spec-review-id]

# Between triplets:
TaskUpdate:
  taskId: [task-N+1-implement-id]
  addBlockedBy: [task-N-code-review-id]
```

### Step 2: Execute Each Task Triplet

For each task triplet in order:

#### 2a. Implementation Phase

**Mark in progress:**
```
TaskUpdate:
  taskId: [implement-task-id]
  status: in_progress
```

**Dispatch implementer subagent:**

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: |
    You are implementing a task from a plan. Follow TDD: write failing test, verify it fails, implement, verify it passes, commit.

    ## Task
    [Full task text from plan]

    ## Instructions
    - Follow the plan steps exactly
    - Use TDD discipline
    - Commit after implementation with a conventional commit message
    - Report back with: commit SHA, files changed, test results

    ## Working Directory
    [Current working directory]
```

**Parse implementer report and mark complete.**

#### 2b. Spec Review Phase

**Dispatch spec reviewer subagent:**

```
Task tool (general-purpose):
  description: "Spec review Task N"
  prompt: |
    Review the implementation of this task for spec compliance.

    ## Task Requirements
    [Task text from plan]

    ## What to Check
    - All requirements from the plan are implemented
    - Nothing extra was added (YAGNI)
    - Tests cover the specified behavior
    - Code matches the plan's file paths and structure

    ## Output Format
    Start your response with exactly one of:
    - APPROVED: [brief reason]
    - ISSUES: [list of issues]
```

**If ISSUES:** Resume implementer to fix, re-dispatch spec reviewer. Repeat until APPROVED.

#### 2c. Code Quality Review Phase

**Dispatch code quality reviewer subagent:**

```
Task tool (general-purpose):
  description: "Code review Task N"
  prompt: |
    Review the implementation of this task for code quality.

    ## What Was Implemented
    [Brief summary]

    ## What to Check
    - Test quality (meaningful assertions, edge cases)
    - Error handling (appropriate, not excessive)
    - Code style (consistent with codebase)
    - No security issues
    - No unnecessary complexity

    ## Output Format
    Start your response with exactly one of:
    - APPROVED: [brief reason]
    - APPROVED_WITH_MINOR: [minor notes]
    - ISSUES: [list of issues]
```

**If ISSUES:** Resume implementer to fix, re-dispatch code reviewer. Repeat until APPROVED.

### Step 3: Write Output Bundle

After all tasks complete:

1. Run full test suite to verify everything works together
2. Determine the session ID from the workspace path:
   ```bash
   basename $(pwd)
   # This returns the session ID since workspace is /workspace/<session-id>
   ```
3. Create the output bundle:
   ```bash
   SESSION_ID=$(basename $(pwd))
   git bundle create "/exchange/${SESSION_ID}/output.bundle" HEAD
   ```
4. Verify the bundle was written:
   ```bash
   ls -la "/exchange/${SESSION_ID}/output.bundle"
   ```

**IMPORTANT:** The output bundle MUST be written to `/exchange/<session-id>/output.bundle`. The host `cco box pull` command is polling for this file.

## Autonomous Operation Rules

- **NEVER** use `AskUserQuestion` — this runs unattended
- **NEVER** stop to ask for clarification — make reasonable decisions and proceed
- **NEVER** call `/complete-work` — the bundle is the completion signal
- If a test failure is not obvious to fix after 2 attempts, skip the task and note it in commit messages
- If a fundamental blocker prevents all progress, write a file `/exchange/<session-id>/error.txt` with the details and exit

## Red Flags

**Never:**
- Skip either review stage
- Proceed to code quality before spec compliance passes
- Ignore Critical or Important issues
- Prompt the user for input

**Always:**
- Follow plan steps exactly
- Use TDD for implementation
- Fix issues before proceeding to next task
- Commit after each task
- Write the output bundle as the very last step
```

**Step 4: Add embed directive**

Update `orchestrator/internal/sandbox/embed.go`:

```go
package sandbox

import _ "embed"

//go:embed files/lima.yaml
var limaTemplate []byte

//go:embed files/CLAUDE.md
var claudeMD []byte

//go:embed files/settings.json
var settingsJSON []byte

//go:embed files/executing-plans-in-sandbox.md
var executingPlansInSandboxSkill []byte
```

**Step 5: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -v -count=1`
Expected: All PASS

**Step 6: Commit**

```bash
cd orchestrator && git add internal/sandbox/files/executing-plans-in-sandbox.md internal/sandbox/embed.go internal/sandbox/sandbox_test.go
git commit -m "feat(sandbox): add executing-plans-in-sandbox skill"
```

---

### Task 9: Update Provisioning to Copy Skill Into VM

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox.go`
- Modify: `orchestrator/internal/sandbox/sandbox_test.go`

**Step 1: Write the failing test**

Update the existing `TestService_Provision_Running` test in `orchestrator/internal/sandbox/sandbox_test.go`:

```go
func TestService_Provision_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Copy", mock.Anything, "~/.claude/CLAUDE.md").Return(nil)
	lima.On("Copy", mock.Anything, "~/.claude/settings.json").Return(nil)
	lima.On("Copy", mock.Anything, "~/.claude/skills/executing-plans-in-sandbox.md").Return(nil)
	lima.On("Shell", "mkdir", "-p", "/home/"+os.Getenv("USER")+".linux/.claude/skills").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Provision()

	require.NoError(t, err)
	lima.AssertNumberOfCalls(t, "Copy", 3)
}
```

Actually, this is tricky because `limactl cp` destination paths use the `~` shorthand which Lima resolves. Let's keep it simpler — just verify that Copy is called 3 times and the skill path is included:

```go
func TestService_Provision_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Provision()

	require.NoError(t, err)
	lima.AssertNumberOfCalls(t, "Copy", 3)
	lima.AssertCalled(t, "Copy", mock.Anything, "~/.claude/skills/executing-plans-in-sandbox.md")
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/sandbox/ -run "TestService_Provision_Running" -v -count=1`
Expected: FAIL — Copy is only called 2 times

**Step 3: Update Provision method**

Update the `Provision` method in `orchestrator/internal/sandbox/sandbox.go` to also copy the skill file. Add a step to ensure the skills directory exists:

```go
// Provision copies Claude config files into the sandbox VM.
func (s *Service) Provision() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "":
		return fmt.Errorf("sandbox not created, run `cco box create`")
	case "Stopped":
		return fmt.Errorf("sandbox not running, run `cco box start`")
	}

	claudeMDPath, err := writeTempFile("cco-claude-md-*", claudeMD)
	if err != nil {
		return fmt.Errorf("failed to write CLAUDE.md: %w", err)
	}
	defer os.Remove(claudeMDPath)

	settingsPath, err := writeTempFile("cco-settings-*.json", settingsJSON)
	if err != nil {
		return fmt.Errorf("failed to write settings.json: %w", err)
	}
	defer os.Remove(settingsPath)

	skillPath, err := writeTempFile("cco-executing-plans-in-sandbox-*.md", executingPlansInSandboxSkill)
	if err != nil {
		return fmt.Errorf("failed to write executing-plans-in-sandbox.md: %w", err)
	}
	defer os.Remove(skillPath)

	if err := s.lima.Copy(claudeMDPath, "~/.claude/CLAUDE.md"); err != nil {
		return err
	}
	if err := s.lima.Copy(settingsPath, "~/.claude/settings.json"); err != nil {
		return err
	}

	// Ensure skills directory exists in VM
	if err := s.lima.Shell("mkdir", "-p", "$HOME/.claude/skills"); err != nil {
		return fmt.Errorf("failed to create skills directory: %w", err)
	}
	if err := s.lima.Copy(skillPath, "~/.claude/skills/executing-plans-in-sandbox.md"); err != nil {
		return err
	}

	s.logger.Info("provisioned config into sandbox")
	return nil
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -v -count=1`
Expected: All PASS

**Step 5: Commit**

```bash
cd orchestrator && git add internal/sandbox/sandbox.go internal/sandbox/sandbox_test.go
git commit -m "feat(sandbox): provision executing-plans-in-sandbox skill"
```

---

### Task 10: Update Documentation

**Files:**
- Modify: `orchestrator/README.md`
- Modify: `CLAUDE.md` (project root)

**Step 1: Update orchestrator README**

In `orchestrator/README.md`, update the commands table at line 7-14 to include push and pull:

Change:
```
| `cco box <cmd>`       | Manage the sandbox (create, start, stop, destroy, status, provision, shell) |
```
To:
```
| `cco box <cmd>`       | Manage the sandbox (create, start, stop, destroy, status, provision, shell, push, pull) |
```

Add a new section after the existing "Destroy the sandbox" section (after line 116), before "The sandbox is persistent":

```markdown
**Push a plan into the sandbox:**

```sh
cco box push .plans/2026-02-21-my-feature-plan.md
# Session a3f7b2 complete. Pull with: cco box pull a3f7b2
```

**Pull results back from the sandbox:**

```sh
cco box pull a3f7b2
```

Push creates a git bundle of your current branch, clones it inside the VM, and launches Claude interactively to execute the plan. When Claude finishes, it writes an output bundle. Pull polls for that bundle and fast-forward merges the commits back onto your branch.

Each push gets a unique session ID so multiple sessions can run in parallel.

**Note:** Push/pull requires the exchange mount. If you created your sandbox before this feature existed, recreate it: `cco box destroy && cco box create`.
```

**Step 2: Update project CLAUDE.md**

In the root `CLAUDE.md`, the skills table doesn't need updating since `executing-plans-in-sandbox` is sandbox-internal and not user-invocable. No changes needed.

**Step 3: Verify no broken links or formatting**

Read through both files to verify the changes look correct.

**Step 4: Commit**

```bash
git add orchestrator/README.md
git commit -m "docs: add sandbox push/pull to README"
```
