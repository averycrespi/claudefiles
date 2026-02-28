# Shallow Git Bundles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Speed up sandbox push/pull by creating bundles from shallow clones instead of full repository history.

**Architecture:** Add a `--depth` flag to `cco box push` (default 100). In `Prepare()`, create a temporary shallow clone of the repo, then bundle from that clone. The output bundle is automatically smaller because the sandbox workspace inherits the shallow history. No changes needed to pull logic.

**Tech Stack:** Go, Cobra CLI, git

---

### Task 1: Add depth parameter to Prepare and update bundle creation

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox.go:1-14` (imports)
- Modify: `orchestrator/internal/sandbox/sandbox.go:209-258` (Prepare method)

**Step 1: Write the failing test**

Add to `orchestrator/internal/sandbox/sandbox_test.go` after the existing `TestService_Prepare_Running` test:

```go
func TestService_Prepare_ShallowBundle(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)

	runner := new(mockRunner)
	// git rev-parse --abbrev-ref HEAD
	runner.On("RunDir", "/repo", "git", "rev-parse", "--abbrev-ref", "HEAD").Return([]byte("feature\n"), nil)
	// git clone --depth 50 --single-branch --branch feature /repo <tmpdir>
	runner.On("Run", "git", "clone", "--depth", "50", "--single-branch", "--branch", "feature", "/repo", mock.Anything).Return([]byte(""), nil)
	// git bundle create from shallow clone dir
	runner.On("RunDir", mock.Anything, "git", "bundle", "create", mock.Anything, "HEAD").Return([]byte(""), nil)
	// git clone in VM
	runner.On("RunDir", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return([]byte(""), nil)

	svc := NewService(lima, logging.NoopLogger{}, runner)

	result, err := svc.Prepare("/repo", ".plans/test-plan.md", 50)

	require.NoError(t, err)
	assert.Equal(t, "feature", result.Branch)
	// Verify shallow clone was called (Run, not RunDir)
	runner.AssertCalled(t, "Run", "git", "clone", "--depth", "50", "--single-branch", "--branch", "feature", "/repo", mock.Anything)
}

func TestService_Prepare_FullHistory(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)

	runner := new(mockRunner)
	runner.On("RunDir", "/repo", "git", "rev-parse", "--abbrev-ref", "HEAD").Return([]byte("main\n"), nil)
	// git bundle create directly from repo (depth=0 means full history)
	runner.On("RunDir", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return([]byte(""), nil)

	svc := NewService(lima, logging.NoopLogger{}, runner)

	result, err := svc.Prepare("/repo", ".plans/test-plan.md", 0)

	require.NoError(t, err)
	assert.Equal(t, "main", result.Branch)
	// Verify NO shallow clone was called
	runner.AssertNotCalled(t, "Run", "git", "clone", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/sandbox/ -run "TestService_Prepare_ShallowBundle|TestService_Prepare_FullHistory" -v -count=1`
Expected: FAIL — `Prepare` doesn't accept a `depth` parameter yet.

**Step 3: Write minimal implementation**

In `orchestrator/internal/sandbox/sandbox.go`:

Add `"strconv"` to the imports block.

Update the `Prepare` method signature from:
```go
func (s *Service) Prepare(repoRoot, planPath string) (*PreparedJob, error) {
```
to:
```go
func (s *Service) Prepare(repoRoot, planPath string, depth int) (*PreparedJob, error) {
```

Replace the bundle creation block (lines 237-242):
```go
	// Create git bundle
	bundlePath := filepath.Join(exchangeDir, "input.bundle")
	s.logger.Info("creating bundle for branch %s...", branch)
	if out, err := s.runner.RunDir(repoRoot, "git", "bundle", "create", bundlePath, branch); err != nil {
		return nil, fmt.Errorf("git bundle create failed: %s", strings.TrimSpace(string(out)))
	}
```

with:
```go
	// Create git bundle
	bundlePath := filepath.Join(exchangeDir, "input.bundle")
	s.logger.Info("creating bundle for branch %s...", branch)

	if depth > 0 {
		// Create shallow clone, then bundle from it for faster transfer
		tmpClone := filepath.Join(os.TempDir(), "cco-shallow-"+jobID)
		defer os.RemoveAll(tmpClone)

		depthStr := strconv.Itoa(depth)
		if out, err := s.runner.Run("git", "clone",
			"--depth", depthStr,
			"--single-branch", "--branch", branch,
			repoRoot, tmpClone); err != nil {
			return nil, fmt.Errorf("shallow clone failed: %s", strings.TrimSpace(string(out)))
		}

		if out, err := s.runner.RunDir(tmpClone, "git", "bundle", "create", bundlePath, "HEAD"); err != nil {
			return nil, fmt.Errorf("git bundle create failed: %s", strings.TrimSpace(string(out)))
		}
	} else {
		// Full history (depth=0)
		if out, err := s.runner.RunDir(repoRoot, "git", "bundle", "create", bundlePath, branch); err != nil {
			return nil, fmt.Errorf("git bundle create failed: %s", strings.TrimSpace(string(out)))
		}
	}
```

**Step 4: Fix existing test and callers**

Update the existing `TestService_Prepare_Running` test call from:
```go
	result, err := svc.Prepare("/repo", ".plans/test-plan.md")
```
to:
```go
	result, err := svc.Prepare("/repo", ".plans/test-plan.md", 0)
```

Update the existing `TestService_Prepare_WithGoProxyPatterns` test call from:
```go
	result, err := svc.Prepare("/repo", ".plans/test-plan.md")
```
to:
```go
	result, err := svc.Prepare("/repo", ".plans/test-plan.md", 0)
```

Update the existing `TestService_Prepare_NotRunning` test call from:
```go
	_, err := svc.Prepare("/repo", ".plans/test-plan.md")
```
to:
```go
	_, err := svc.Prepare("/repo", ".plans/test-plan.md", 0)
```

**Step 5: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -v -count=1`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add orchestrator/internal/sandbox/sandbox.go orchestrator/internal/sandbox/sandbox_test.go
git commit -m "feat: add depth parameter to Prepare for shallow bundles"
```

---

### Task 2: Add --depth flag to box push command

**Files:**
- Modify: `orchestrator/cmd/box_push.go:18-142` (command definition)

**Step 1: Write the failing test**

This is a CLI flag — no unit test needed. The compilation will fail because `box_push.go` calls `Prepare` with the old signature.

**Step 2: Update box_push.go**

In `orchestrator/cmd/box_push.go`, add a `depth` variable and flag. Replace the `init()` function and add the flag:

Change:
```go
func init() { boxCmd.AddCommand(boxPushCmd) }
```
to:
```go
func init() {
	boxPushCmd.Flags().IntVar(&boxPushDepth, "depth", 100, "number of commits to include in bundle (0 for full history)")
	boxCmd.AddCommand(boxPushCmd)
}

var boxPushDepth int
```

Update the `Prepare` call from:
```go
		prepared, err := svc.Prepare(cwd, planPath)
```
to:
```go
		prepared, err := svc.Prepare(cwd, planPath, boxPushDepth)
```

**Step 3: Run build to verify it compiles**

Run: `cd orchestrator && go build ./...`
Expected: Build succeeds.

**Step 4: Run all tests**

Run: `cd orchestrator && go test ./... -count=1`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add orchestrator/cmd/box_push.go
git commit -m "feat: add --depth flag to cco box push"
```

---

### Task 3: Update documentation

**Files:**
- Modify: `orchestrator/docs/sandbox.md`

**Step 1: Read and update sandbox.md**

Add a note about the `--depth` flag to the push section. Find the line:

```
cco box push .plans/2026-02-21-my-feature-plan.md
```

And add below it:

```
cco box push --depth 50 .plans/2026-02-21-my-feature-plan.md  # fewer commits = faster bundle
```

Also update the description paragraph. Find:

```
Push requires a workspace (`cco add <branch>`) for the current branch. It creates a git bundle, clones it inside the VM, and launches Claude in a split tmux pane to execute the plan.
```

And change to:

```
Push requires a workspace (`cco add <branch>`) for the current branch. It creates a git bundle (shallow by default, last 100 commits), clones it inside the VM, and launches Claude in a split tmux pane to execute the plan. Use `--depth` to control how many commits are included (0 for full history).
```

**Step 2: Commit**

```bash
git add orchestrator/docs/sandbox.md
git commit -m "docs: document --depth flag for cco box push"
```
