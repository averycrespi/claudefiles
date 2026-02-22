# Async Push with Tmux Pane Splitting — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Make `box push` non-blocking by launching Claude in a split tmux pane and returning immediately.

**Architecture:** Refactor `sandbox.Push` into `sandbox.Prepare` (returns session ID + command string). The command layer (`box_push.go`) handles tmux orchestration: looks up the workspace window, splits it, sends the command, returns. `box pull` gains an additional step to kill the sandbox pane after merging. Six new pane-level methods are added to the tmux client.

**Tech Stack:** Go, tmux, testify (mocks)

---

### Task 1: Add pane-level tmux client methods

**Files:**
- Modify: `orchestrator/internal/tmux/tmux.go:100-106` (after SendKeys)
- Test: `orchestrator/internal/tmux/tmux_test.go`

**Step 1: Write failing tests for all six new methods**

Add to `orchestrator/internal/tmux/tmux_test.go`:

```go
func TestClient_SplitWindow(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "split-window", "-h", "-t", "sess:win", "-d", "-P", "-F", "#{pane_id}"}).Return([]byte("%42\n"), nil)

	client := NewClient(r)
	paneID, err := client.SplitWindow("sess", "win")

	require.NoError(t, err)
	assert.Equal(t, "%42", paneID)
}

func TestClient_SplitWindow_Error(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "split-window", "-h", "-t", "sess:win", "-d", "-P", "-F", "#{pane_id}"}).Return([]byte("error"), assert.AnError)

	client := NewClient(r)
	_, err := client.SplitWindow("sess", "win")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "split-window failed")
}

func TestClient_SelectLayout(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "select-layout", "-t", "sess:win", "even-horizontal"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.SelectLayout("sess", "win", "even-horizontal")

	require.NoError(t, err)
}

func TestClient_SetPaneTitle(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "select-pane", "-t", "%42", "-T", "abc123"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.SetPaneTitle("%42", "abc123")

	require.NoError(t, err)
}

func TestClient_SendKeysToPane(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "send-keys", "-t", "%42", "echo hi", "C-m"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.SendKeysToPane("%42", "echo hi")

	require.NoError(t, err)
}

func TestClient_FindPaneByTitle_Found(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-panes", "-s", "-t", "sess", "-F", "#{pane_id} #{pane_title}"}).Return([]byte("%10 main\n%42 abc123\n"), nil)

	client := NewClient(r)
	paneID, err := client.FindPaneByTitle("sess", "abc123")

	require.NoError(t, err)
	assert.Equal(t, "%42", paneID)
}

func TestClient_FindPaneByTitle_NotFound(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-panes", "-s", "-t", "sess", "-F", "#{pane_id} #{pane_title}"}).Return([]byte("%10 main\n"), nil)

	client := NewClient(r)
	_, err := client.FindPaneByTitle("sess", "abc123")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestClient_KillPane(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "kill-pane", "-t", "%42"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.KillPane("%42")

	require.NoError(t, err)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/tmux/ -count=1 -v`
Expected: FAIL — methods not defined

**Step 3: Implement the six methods**

Add to `orchestrator/internal/tmux/tmux.go` after the `SendKeys` method:

```go
func (c *Client) SplitWindow(session, window string) (string, error) {
	out, err := c.run("split-window", "-h", "-t", session+":"+window, "-d", "-P", "-F", "#{pane_id}")
	if err != nil {
		return "", fmt.Errorf("tmux split-window failed: %s", strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

func (c *Client) SelectLayout(session, window, layout string) error {
	out, err := c.run("select-layout", "-t", session+":"+window, layout)
	if err != nil {
		return fmt.Errorf("tmux select-layout failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) SetPaneTitle(paneID, title string) error {
	out, err := c.run("select-pane", "-t", paneID, "-T", title)
	if err != nil {
		return fmt.Errorf("tmux set-pane-title failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) SendKeysToPane(paneID, command string) error {
	out, err := c.run("send-keys", "-t", paneID, command, "C-m")
	if err != nil {
		return fmt.Errorf("tmux send-keys failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) FindPaneByTitle(session, title string) (string, error) {
	out, err := c.run("list-panes", "-s", "-t", session, "-F", "#{pane_id} #{pane_title}")
	if err != nil {
		return "", fmt.Errorf("tmux list-panes failed: %s", strings.TrimSpace(string(out)))
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := strings.SplitN(line, " ", 2)
		if len(parts) == 2 && parts[1] == title {
			return parts[0], nil
		}
	}
	return "", fmt.Errorf("pane with title %q not found", title)
}

func (c *Client) KillPane(paneID string) error {
	out, err := c.run("kill-pane", "-t", paneID)
	if err != nil {
		return fmt.Errorf("tmux kill-pane failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/tmux/ -count=1 -v`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/tmux/tmux.go orchestrator/internal/tmux/tmux_test.go
git commit -m "feat(tmux): add pane-level operations for sandbox integration"
```

---

### Task 2: Refactor `sandbox.Push` into `Prepare`

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox.go:201-251`
- Test: `orchestrator/internal/sandbox/sandbox_test.go`

**Step 1: Write failing test for `Prepare`**

Replace the `TestService_Push_Running` test and add a new test in `orchestrator/internal/sandbox/sandbox_test.go`:

```go
func TestService_Prepare_NotRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	runner := new(mockRunner)
	svc := NewService(lima, logging.NoopLogger{}, runner)

	_, err := svc.Prepare("/repo", ".plans/test-plan.md")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Prepare_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)

	runner := new(mockRunner)
	runner.On("RunDir", "/repo", "git", "rev-parse", "--abbrev-ref", "HEAD").Return([]byte("main\n"), nil)
	runner.On("RunDir", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return([]byte(""), nil)

	svc := NewService(lima, logging.NoopLogger{}, runner)

	result, err := svc.Prepare("/repo", ".plans/test-plan.md")

	require.NoError(t, err)
	assert.Len(t, result.SessionID, 8)
	assert.Contains(t, result.Command, "limactl")
	assert.Contains(t, result.Command, "claude")
	assert.Contains(t, result.Command, result.SessionID)
	assert.Contains(t, result.Command, "executing-plans-in-sandbox")
	assert.Equal(t, "main", result.Branch)
	// Should NOT have called Shell (no interactive launch)
	lima.AssertNotCalled(t, "Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -v -run TestService_Prepare`
Expected: FAIL — `Prepare` method not defined

**Step 3: Implement `Prepare` and remove old `Push`**

In `orchestrator/internal/sandbox/sandbox.go`, replace the `Push` method (lines 201-251) with:

```go
// PreparedSession contains the info needed to launch Claude in a tmux pane.
type PreparedSession struct {
	SessionID string // random hex session identifier
	Branch    string // git branch that was bundled
	Command   string // full limactl shell command to run Claude
}

// Prepare bundles the current branch, clones it in the VM, and returns the
// command to launch Claude. The caller is responsible for running the command
// (e.g., via tmux send-keys).
func (s *Service) Prepare(repoRoot, planPath string) (PreparedSession, error) {
	status, err := s.lima.Status()
	if err != nil {
		return PreparedSession{}, err
	}
	switch status {
	case "":
		return PreparedSession{}, fmt.Errorf("sandbox not created, run `cco box create`")
	case "Stopped":
		return PreparedSession{}, fmt.Errorf("sandbox not running, run `cco box start`")
	}

	// Get current branch
	out, err := s.runner.RunDir(repoRoot, "git", "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return PreparedSession{}, fmt.Errorf("failed to get current branch: %w", err)
	}
	branch := strings.TrimSpace(string(out))

	// Generate session ID and create exchange directory
	sessionID := NewSessionID()
	exchangeDir := paths.SessionExchangeDir(sessionID)
	if err := os.MkdirAll(exchangeDir, 0o755); err != nil {
		return PreparedSession{}, fmt.Errorf("failed to create exchange directory: %w", err)
	}

	// Create git bundle
	bundlePath := filepath.Join(exchangeDir, "input.bundle")
	s.logger.Info("creating bundle for branch %s...", branch)
	if out, err := s.runner.RunDir(repoRoot, "git", "bundle", "create", bundlePath, branch); err != nil {
		return PreparedSession{}, fmt.Errorf("git bundle create failed: %s", strings.TrimSpace(string(out)))
	}

	// Clone from bundle inside VM
	guestWorkspace := "/workspace/" + sessionID
	s.logger.Info("cloning into sandbox workspace %s...", guestWorkspace)
	if err := s.lima.Shell("--", "git", "clone", "/exchange/"+sessionID+"/input.bundle", guestWorkspace); err != nil {
		return PreparedSession{}, fmt.Errorf("git clone in sandbox failed: %w", err)
	}

	// Build the command string for the caller to run
	prompt := fmt.Sprintf("/executing-plans-in-sandbox %s", planPath)
	command := fmt.Sprintf("limactl shell --workdir / %s -- bash -c 'cd %s && claude --dangerously-skip-permissions %q'",
		lima.VMName, guestWorkspace, prompt)

	s.logger.Info("prepared session %s for branch %s", sessionID, branch)
	return PreparedSession{
		SessionID: sessionID,
		Branch:    branch,
		Command:   command,
	}, nil
}
```

Note: Add `lima` import alias. The sandbox.go file imports `"github.com/averycrespi/claudefiles/orchestrator/internal/lima"` — but actually, `lima` is only used as an interface here. We need to reference `lima.VMName` for the command string. Check whether there's already an import. If not, we can hardcode the VM name as a constant or import the lima package.

Actually, looking at the current code, `sandbox.go` does **not** import the `lima` package — it uses the `limaClient` interface. For the command string, use the constant directly. Add to `sandbox.go`:

```go
const vmName = "cco-sandbox"
```

Or import the lima package. The simpler option is to just hardcode the string `"cco-sandbox"` in the format string since it's a build-time constant. But the cleanest approach is to import `lima` and use `lima.VMName`. Add the import.

**Step 4: Remove old `Push` tests and update**

In `orchestrator/internal/sandbox/sandbox_test.go`:
- Remove `TestService_Push_NotRunning` and `TestService_Push_Running`
- The new `TestService_Prepare_NotRunning` and `TestService_Prepare_Running` replace them

**Step 5: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -v`
Expected: PASS

**Step 6: Commit**

```bash
git add orchestrator/internal/sandbox/sandbox.go orchestrator/internal/sandbox/sandbox_test.go
git commit -m "refactor(sandbox): replace Push with Prepare for async pane launching"
```

---

### Task 3: Update `box_push.go` to use tmux pane splitting

**Files:**
- Modify: `orchestrator/cmd/box_push.go`
- Modify: `orchestrator/cmd/wire.go`

**Step 1: Update `wire.go` to expose tmux client and git client for box commands**

Add to `orchestrator/cmd/wire.go`:

```go
func newTmuxClient() *tmux.Client {
	runner := ccoexec.NewOSRunner()
	tc := tmux.NewClient(runner)
	tc.TmuxEnv = os.Getenv("TMUX")
	return tc
}

func newGitClient() *git.Client {
	runner := ccoexec.NewOSRunner()
	return git.NewClient(runner)
}
```

**Step 2: Rewrite `box_push.go`**

Replace the entire content of `orchestrator/cmd/box_push.go`:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
	"github.com/spf13/cobra"
)

var boxPushCmd = &cobra.Command{
	Use:   "push <plan-path>",
	Short: "Push a plan into the sandbox for execution",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		planPath := args[0]

		if _, err := os.Stat(planPath); os.IsNotExist(err) {
			return fmt.Errorf("plan file not found: %s", planPath)
		}

		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		// Look up workspace tmux session and window
		gitClient := newGitClient()
		info, err := gitClient.RepoInfo(cwd)
		if err != nil {
			return err
		}

		tmuxSession := paths.TmuxSessionName(info.Name)
		tc := newTmuxClient()

		if !tc.SessionExists(tmuxSession) {
			return fmt.Errorf("no workspace found for repo %q — run 'cco add <branch>' first", info.Name)
		}

		// Prepare sandbox session (bundle, clone, build command)
		svc := newSandboxService()
		prepared, err := svc.Prepare(cwd, planPath)
		if err != nil {
			return err
		}

		windowName := paths.TmuxWindowName(prepared.Branch)
		if !tc.WindowExists(tmuxSession, windowName) {
			return fmt.Errorf("no workspace window for branch %q — run 'cco add %s' first", prepared.Branch, prepared.Branch)
		}

		// Split the workspace pane and launch Claude
		actualWindow := tc.ActualWindowName(tmuxSession, windowName)
		paneID, err := tc.SplitWindow(tmuxSession, actualWindow)
		if err != nil {
			return fmt.Errorf("failed to split pane: %w", err)
		}

		if err := tc.SelectLayout(tmuxSession, actualWindow, "even-horizontal"); err != nil {
			return fmt.Errorf("failed to set layout: %w", err)
		}

		if err := tc.SetPaneTitle(paneID, prepared.SessionID); err != nil {
			return fmt.Errorf("failed to set pane title: %w", err)
		}

		if err := tc.SendKeysToPane(paneID, prepared.Command); err != nil {
			return fmt.Errorf("failed to send command to pane: %w", err)
		}

		fmt.Printf("Session %s started. Pull with: cco box pull %s\n", prepared.SessionID, prepared.SessionID)
		return nil
	},
}

func init() { boxCmd.AddCommand(boxPushCmd) }
```

**Step 3: Run full test suite to verify nothing is broken**

Run: `cd orchestrator && go test ./... -count=1`
Expected: PASS (no tests directly exercise `box_push.go` — it's a cobra command)

**Step 4: Commit**

```bash
git add orchestrator/cmd/box_push.go orchestrator/cmd/wire.go
git commit -m "feat(box): make push non-blocking with tmux pane splitting"
```

---

### Task 4: Update `box_pull.go` to clean up the tmux pane

**Files:**
- Modify: `orchestrator/cmd/box_pull.go`

**Step 1: Rewrite `box_pull.go` to kill the sandbox pane after merge**

Replace the content of `orchestrator/cmd/box_pull.go`:

```go
package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
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
		if err := svc.Pull(cwd, sessionID, 30*time.Minute, 3*time.Second); err != nil {
			return err
		}

		// Clean up tmux pane (best effort)
		logger := logging.NewStdLogger(verbose)
		gitClient := newGitClient()
		info, err := gitClient.RepoInfo(cwd)
		if err != nil {
			logger.Info("warning: could not look up workspace to clean up pane: %s", err)
			return nil
		}

		tmuxSession := paths.TmuxSessionName(info.Name)
		tc := newTmuxClient()

		if !tc.SessionExists(tmuxSession) {
			return nil
		}

		paneID, err := tc.FindPaneByTitle(tmuxSession, sessionID)
		if err != nil {
			logger.Info("sandbox pane already closed")
			return nil
		}

		if err := tc.KillPane(paneID); err != nil {
			logger.Info("warning: could not close sandbox pane: %s", err)
		} else {
			logger.Info("closed sandbox pane")
		}

		return nil
	},
}

func init() { boxCmd.AddCommand(boxPullCmd) }
```

**Step 2: Run full test suite**

Run: `cd orchestrator && go test ./... -count=1`
Expected: PASS

**Step 3: Commit**

```bash
git add orchestrator/cmd/box_pull.go
git commit -m "feat(box): clean up tmux pane on pull"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `orchestrator/README.md` (if it documents push/pull behavior)

**Step 1: Check if README mentions push/pull**

Read `orchestrator/README.md` and check for push/pull documentation.

**Step 2: Update if needed**

If the README documents `box push` or `box pull` behavior, update it to reflect:
- `push` now requires a workspace (`cco add <branch>`) and splits a tmux pane
- `push` returns immediately instead of blocking
- `pull` cleans up the tmux pane after merging
- The output message changed from "Session X complete" to "Session X started"

**Step 3: Commit**

```bash
git add orchestrator/README.md
git commit -m "docs: update push/pull behavior for async tmux panes"
```

<!-- If README doesn't mention push/pull, skip this task and note: No documentation updates needed -->
