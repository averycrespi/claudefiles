# Clean Architecture Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Introduce interfaces and dependency injection into the orchestrator so that `workspace` and `sandbox` can be unit tested without real git, tmux, or limactl.

**Architecture:** Bottom-up refactor in 8 tasks. First add `testify` and create the `exec.Runner` interface. Then convert each tool package (`logging`, `git`, `tmux`, `lima`) from package-level functions to `Client` structs with `Runner` dependency. Then convert orchestration packages (`sandbox`, `workspace`) to `Service` structs with consumer-side interfaces. Finally, wire everything together in `cmd/` and update docs.

**Tech Stack:** Go 1.23, Cobra, testify (mock/assert/require)

---

### Task 1: Add testify dependency and create exec.Runner interface

**Files:**
- Create: `orchestrator/internal/exec/exec.go`
- Create: `orchestrator/internal/exec/exec_test.go`
- Modify: `orchestrator/go.mod`

**Step 1: Write the failing test**

Create `orchestrator/internal/exec/exec_test.go`:

```go
package exec

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOSRunner_ImplementsRunner(t *testing.T) {
	var _ Runner = &OSRunner{}
}

func TestOSRunner_Run(t *testing.T) {
	r := NewOSRunner()
	out, err := r.Run("echo", "hello")
	assert.NoError(t, err)
	assert.Contains(t, string(out), "hello")
}

func TestOSRunner_RunDir(t *testing.T) {
	r := NewOSRunner()
	out, err := r.RunDir("/tmp", "pwd")
	assert.NoError(t, err)
	assert.Contains(t, string(out), "tmp")
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/exec/ -count=1 -v`
Expected: Compilation failure — package doesn't exist yet.

**Step 3: Write minimal implementation**

Create `orchestrator/internal/exec/exec.go`:

```go
package exec

import (
	"os"
	osexec "os/exec"
)

// Runner abstracts command execution for testability.
type Runner interface {
	// Run executes a command and returns its combined output.
	Run(name string, args ...string) ([]byte, error)
	// RunDir executes a command in a specific directory.
	RunDir(dir, name string, args ...string) ([]byte, error)
	// RunInteractive executes a command with stdin/stdout/stderr connected.
	RunInteractive(name string, args ...string) error
}

// OSRunner implements Runner using os/exec.
type OSRunner struct{}

// NewOSRunner returns a Runner that uses real OS commands.
func NewOSRunner() *OSRunner { return &OSRunner{} }

func (r *OSRunner) Run(name string, args ...string) ([]byte, error) {
	return osexec.Command(name, args...).CombinedOutput()
}

func (r *OSRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
	cmd := osexec.Command(name, args...)
	cmd.Dir = dir
	return cmd.CombinedOutput()
}

func (r *OSRunner) RunInteractive(name string, args ...string) error {
	cmd := osexec.Command(name, args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
```

Then add testify: `cd orchestrator && go get github.com/stretchr/testify`

**Step 4: Run test to verify it passes**

Run: `cd orchestrator && go test ./internal/exec/ -count=1 -v`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/exec/ orchestrator/go.mod orchestrator/go.sum
git commit -m "feat: add exec.Runner interface and OSRunner implementation"
```

---

### Task 2: Convert logging to Logger interface

**Files:**
- Modify: `orchestrator/internal/logging/logging.go`
- Modify: `orchestrator/internal/logging/logging_test.go`

**Step 1: Write the failing test**

Replace `orchestrator/internal/logging/logging_test.go` with:

```go
package logging

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestStdLogger_ImplementsLogger(t *testing.T) {
	var _ Logger = &StdLogger{}
}

func TestNoopLogger_ImplementsLogger(t *testing.T) {
	var _ Logger = NoopLogger{}
}

func TestStdLogger_InfoAlwaysPrints(t *testing.T) {
	logger := NewStdLogger(false)
	out := captureStdout(t, func() {
		logger.Info("hello %s", "world")
	})
	assert.Equal(t, "hello world\n", out)
}

func TestStdLogger_DebugSilentByDefault(t *testing.T) {
	logger := NewStdLogger(false)
	out := captureStdout(t, func() {
		logger.Debug("should not appear")
	})
	assert.Empty(t, out)
}

func TestStdLogger_DebugPrintsWhenVerbose(t *testing.T) {
	logger := NewStdLogger(true)
	out := captureStdout(t, func() {
		logger.Debug("verbose %s", "msg")
	})
	assert.Equal(t, "verbose msg\n", out)
}

func TestNoopLogger_DoesNotPrint(t *testing.T) {
	logger := NoopLogger{}
	out := captureStdout(t, func() {
		logger.Info("should not appear")
		logger.Debug("should not appear")
	})
	assert.Empty(t, out)
}
```

Keep the `captureStdout` helper — add `import` for `"bytes"` and `"os"`:

```go
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
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/logging/ -count=1 -v`
Expected: Compilation failure — `Logger`, `StdLogger`, `NoopLogger`, `NewStdLogger` not defined.

**Step 3: Write minimal implementation**

Replace `orchestrator/internal/logging/logging.go` with:

```go
package logging

import "fmt"

// Logger abstracts logging for testability.
type Logger interface {
	Info(format string, args ...any)
	Debug(format string, args ...any)
}

// StdLogger implements Logger using fmt.Printf to stdout.
type StdLogger struct {
	verbose bool
}

// NewStdLogger returns a Logger that prints to stdout.
func NewStdLogger(verbose bool) *StdLogger {
	return &StdLogger{verbose: verbose}
}

func (l *StdLogger) Info(format string, args ...any) {
	fmt.Printf(format+"\n", args...)
}

func (l *StdLogger) Debug(format string, args ...any) {
	if l.verbose {
		fmt.Printf(format+"\n", args...)
	}
}

// NoopLogger is a Logger that discards all output. Useful in tests.
type NoopLogger struct{}

func (NoopLogger) Info(string, ...any)  {}
func (NoopLogger) Debug(string, ...any) {}
```

**Step 4: Run test to verify it passes**

Run: `cd orchestrator && go test ./internal/logging/ -count=1 -v`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/logging/
git commit -m "refactor: convert logging to Logger interface with StdLogger and NoopLogger"
```

---

### Task 3: Convert git package to Client struct

**Files:**
- Modify: `orchestrator/internal/git/git.go`
- Modify: `orchestrator/internal/git/git_test.go`

**Step 1: Write the failing test**

Replace `orchestrator/internal/git/git_test.go` with:

```go
package git

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
)

// mockRunner implements exec.Runner for unit tests.
type mockRunner struct {
	mock.Mock
}

func (m *mockRunner) Run(name string, args ...string) ([]byte, error) {
	callArgs := m.Called(name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
	callArgs := m.Called(dir, name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunInteractive(name string, args ...string) error {
	callArgs := m.Called(name, args)
	return callArgs.Error(0)
}

var _ exec.Runner = (*mockRunner)(nil)

func TestClient_RepoInfo_MainRepo(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"rev-parse", "--is-inside-work-tree"}).Return([]byte("true\n"), nil)
	r.On("RunDir", "/repo", "git", []string{"rev-parse", "--show-toplevel"}).Return([]byte("/repo\n"), nil)
	r.On("RunDir", "/repo", "git", []string{"rev-parse", "--git-common-dir"}).Return([]byte(".git\n"), nil)

	client := NewClient(r)
	info, err := client.RepoInfo("/repo")

	require.NoError(t, err)
	assert.Equal(t, "repo", info.Name)
	assert.Equal(t, "/repo", info.Root)
	assert.False(t, info.IsWorktree)
	r.AssertExpectations(t)
}

func TestClient_RepoInfo_Worktree(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/wt", "git", []string{"rev-parse", "--is-inside-work-tree"}).Return([]byte("true\n"), nil)
	r.On("RunDir", "/wt", "git", []string{"rev-parse", "--show-toplevel"}).Return([]byte("/wt\n"), nil)
	r.On("RunDir", "/wt", "git", []string{"rev-parse", "--git-common-dir"}).Return([]byte("/repo/.git/worktrees/wt\n"), nil)

	client := NewClient(r)
	info, err := client.RepoInfo("/wt")

	require.NoError(t, err)
	assert.True(t, info.IsWorktree)
}

func TestClient_RepoInfo_NotARepo(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/tmp", "git", []string{"rev-parse", "--is-inside-work-tree"}).Return([]byte("fatal: not a git repository\n"), assert.AnError)

	client := NewClient(r)
	_, err := client.RepoInfo("/tmp")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not a git repository")
}

func TestClient_BranchExists(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"show-ref", "--verify", "--quiet", "refs/heads/main"}).Return([]byte(""), nil)

	client := NewClient(r)
	assert.True(t, client.BranchExists("/repo", "main"))
}

func TestClient_BranchNotExists(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"show-ref", "--verify", "--quiet", "refs/heads/nope"}).Return([]byte(""), assert.AnError)

	client := NewClient(r)
	assert.False(t, client.BranchExists("/repo", "nope"))
}

func TestClient_AddWorktree_NewBranch(t *testing.T) {
	r := new(mockRunner)
	// BranchExists check fails → new branch
	r.On("RunDir", "/repo", "git", []string{"show-ref", "--verify", "--quiet", "refs/heads/feat"}).Return([]byte(""), assert.AnError)
	r.On("RunDir", "/repo", "git", []string{"worktree", "add", "--quiet", "-b", "feat", "/wt"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.AddWorktree("/repo", "/wt", "feat")

	require.NoError(t, err)
	r.AssertExpectations(t)
}

func TestClient_AddWorktree_ExistingBranch(t *testing.T) {
	r := new(mockRunner)
	// BranchExists check succeeds → existing branch
	r.On("RunDir", "/repo", "git", []string{"show-ref", "--verify", "--quiet", "refs/heads/feat"}).Return([]byte(""), nil)
	r.On("RunDir", "/repo", "git", []string{"worktree", "add", "--quiet", "/wt", "feat"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.AddWorktree("/repo", "/wt", "feat")

	require.NoError(t, err)
	r.AssertExpectations(t)
}

func TestClient_RemoveWorktree(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"worktree", "remove", "/wt"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.RemoveWorktree("/repo", "/wt")

	require.NoError(t, err)
	r.AssertExpectations(t)
}

func TestClient_CommonDir(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/wt", "git", []string{"rev-parse", "--git-common-dir"}).Return([]byte("/repo/.git\n"), nil)

	client := NewClient(r)
	dir, err := client.CommonDir("/wt")

	require.NoError(t, err)
	assert.Equal(t, "/repo/.git", dir)
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/git/ -count=1 -v`
Expected: Compilation failure — `NewClient` not defined, functions are package-level not methods.

**Step 3: Write minimal implementation**

Replace `orchestrator/internal/git/git.go` with:

```go
package git

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
)

// Info contains information about a git repository.
type Info struct {
	Name       string // Repository directory name
	Root       string // Absolute path to repository root
	IsWorktree bool   // True if path is inside a worktree (not the main repo)
}

// Client wraps git operations with an injectable command runner.
type Client struct {
	runner exec.Runner
}

// NewClient returns a git Client using the given command runner.
func NewClient(runner exec.Runner) *Client {
	return &Client{runner: runner}
}

// RepoInfo returns information about the git repository at the given path.
func (c *Client) RepoInfo(path string) (Info, error) {
	if out, err := c.runner.RunDir(path, "git", "rev-parse", "--is-inside-work-tree"); err != nil {
		return Info{}, fmt.Errorf("not a git repository: %s", strings.TrimSpace(string(out)))
	}

	out, err := c.runner.RunDir(path, "git", "rev-parse", "--show-toplevel")
	if err != nil {
		return Info{}, fmt.Errorf("could not determine repo root: %w", err)
	}
	root := strings.TrimSpace(string(out))

	out, err = c.runner.RunDir(path, "git", "rev-parse", "--git-common-dir")
	if err != nil {
		return Info{}, fmt.Errorf("could not determine git common dir: %w", err)
	}
	commonDir := strings.TrimSpace(string(out))
	isWorktree := commonDir != ".git"

	return Info{
		Name:       filepath.Base(root),
		Root:       root,
		IsWorktree: isWorktree,
	}, nil
}

// BranchExists checks if a local branch exists.
func (c *Client) BranchExists(repoRoot, branch string) bool {
	_, err := c.runner.RunDir(repoRoot, "git", "show-ref", "--verify", "--quiet", "refs/heads/"+branch)
	return err == nil
}

// AddWorktree creates a git worktree at the given path.
// If the branch exists locally, it checks it out. Otherwise, it creates a new branch.
func (c *Client) AddWorktree(repoRoot, path, branch string) error {
	if c.BranchExists(repoRoot, branch) {
		out, err := c.runner.RunDir(repoRoot, "git", "worktree", "add", "--quiet", path, branch)
		if err != nil {
			return fmt.Errorf("git worktree add failed: %s", strings.TrimSpace(string(out)))
		}
	} else {
		out, err := c.runner.RunDir(repoRoot, "git", "worktree", "add", "--quiet", "-b", branch, path)
		if err != nil {
			return fmt.Errorf("git worktree add -b failed: %s", strings.TrimSpace(string(out)))
		}
	}
	return nil
}

// RemoveWorktree removes a git worktree at the given path.
func (c *Client) RemoveWorktree(repoRoot, path string) error {
	out, err := c.runner.RunDir(repoRoot, "git", "worktree", "remove", path)
	if err != nil {
		return fmt.Errorf("git worktree remove failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// CommonDir returns the git common directory for the repo at path.
// For worktrees this points back to the main repo's .git directory.
func (c *Client) CommonDir(path string) (string, error) {
	out, err := c.runner.RunDir(path, "git", "rev-parse", "--git-common-dir")
	if err != nil {
		return "", fmt.Errorf("could not determine git common dir: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}
```

**Step 4: Run test to verify it passes**

Run: `cd orchestrator && go test ./internal/git/ -count=1 -v`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/git/
git commit -m "refactor: convert git package to Client struct with Runner dependency"
```

---

### Task 4: Convert tmux package to Client struct

**Files:**
- Modify: `orchestrator/internal/tmux/tmux.go`
- Modify: `orchestrator/internal/tmux/tmux_test.go`

**Step 1: Write the failing test**

Replace `orchestrator/internal/tmux/tmux_test.go` with:

```go
package tmux

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
)

type mockRunner struct {
	mock.Mock
}

func (m *mockRunner) Run(name string, args ...string) ([]byte, error) {
	callArgs := m.Called(name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
	callArgs := m.Called(dir, name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunInteractive(name string, args ...string) error {
	callArgs := m.Called(name, args)
	return callArgs.Error(0)
}

var _ exec.Runner = (*mockRunner)(nil)

func TestClient_SessionExists_True(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "has-session", "-t", "mysess"}).Return([]byte(""), nil)

	client := NewClient(r)
	assert.True(t, client.SessionExists("mysess"))
}

func TestClient_SessionExists_False(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "has-session", "-t", "nosess"}).Return([]byte(""), assert.AnError)

	client := NewClient(r)
	assert.False(t, client.SessionExists("nosess"))
}

func TestClient_CreateSession(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "new-session", "-d", "-s", "sess", "-n", "main"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.CreateSession("sess", "main")

	require.NoError(t, err)
	r.AssertExpectations(t)
}

func TestClient_CreateWindow(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "new-window", "-t", "sess", "-n", "win", "-c", "/dir", "-d"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.CreateWindow("sess", "win", "/dir")

	require.NoError(t, err)
	r.AssertExpectations(t)
}

func TestClient_KillWindow(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "kill-window", "-t", "sess:win"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.KillWindow("sess", "win")

	require.NoError(t, err)
}

func TestClient_ListWindows(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-windows", "-t", "sess", "-F", "#{window_name}"}).Return([]byte("main\nfeature\n"), nil)

	client := NewClient(r)
	windows, err := client.ListWindows("sess")

	require.NoError(t, err)
	assert.Equal(t, []string{"main", "feature"}, windows)
}

func TestClient_ListWindows_Empty(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-windows", "-t", "sess", "-F", "#{window_name}"}).Return([]byte(""), nil)

	client := NewClient(r)
	windows, err := client.ListWindows("sess")

	require.NoError(t, err)
	assert.Nil(t, windows)
}

func TestClient_WindowExists_Direct(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-windows", "-t", "sess", "-F", "#{window_name}"}).Return([]byte("main\nfeat\n"), nil)

	client := NewClient(r)
	assert.True(t, client.WindowExists("sess", "feat"))
}

func TestClient_WindowExists_BellPrefix(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-windows", "-t", "sess", "-F", "#{window_name}"}).Return([]byte("main\n🔔 feat\n"), nil)

	client := NewClient(r)
	assert.True(t, client.WindowExists("sess", "feat"))
}

func TestClient_WindowExists_NotFound(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-windows", "-t", "sess", "-F", "#{window_name}"}).Return([]byte("main\n"), nil)

	client := NewClient(r)
	assert.False(t, client.WindowExists("sess", "nope"))
}

func TestClient_ActualWindowName_Direct(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-windows", "-t", "sess", "-F", "#{window_name}"}).Return([]byte("main\nfeat\n"), nil)

	client := NewClient(r)
	assert.Equal(t, "feat", client.ActualWindowName("sess", "feat"))
}

func TestClient_ActualWindowName_Bell(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-windows", "-t", "sess", "-F", "#{window_name}"}).Return([]byte("main\n🔔 feat\n"), nil)

	client := NewClient(r)
	assert.Equal(t, "🔔 feat", client.ActualWindowName("sess", "feat"))
}

func TestClient_ActualWindowName_NotFound(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "list-windows", "-t", "sess", "-F", "#{window_name}"}).Return([]byte("main\n"), nil)

	client := NewClient(r)
	assert.Equal(t, "", client.ActualWindowName("sess", "nope"))
}

func TestClient_SendKeys(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "send-keys", "-t", "sess:win", "echo hi", "C-m"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.SendKeys("sess", "win", "echo hi")

	require.NoError(t, err)
}

func TestClient_RenameWindow(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "tmux", []string{"-L", SocketName, "rename-window", "-t", "sess:old", "new"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.RenameWindow("sess", "old", "new")

	require.NoError(t, err)
}

func TestClient_IsActiveWindow(t *testing.T) {
	r := new(mockRunner)
	// WindowExists calls ListWindows
	r.On("Run", "tmux", []string{"-L", SocketName, "list-windows", "-t", "sess", "-F", "#{window_name}"}).Return([]byte("main\nfeat\n"), nil)
	// display-message for active check
	r.On("Run", "tmux", []string{"-L", SocketName, "display-message", "-t", "sess:feat", "-p", "#{window_active}"}).Return([]byte("1\n"), nil)

	client := NewClient(r)
	assert.True(t, client.IsActiveWindow("sess", "feat"))
}

func TestClient_Attach(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "tmux", []string{"-L", SocketName, "attach-session", "-t", "sess"}).Return(nil)

	client := NewClient(r)
	err := client.Attach("sess")

	require.NoError(t, err)
}

func TestClient_AttachToWindow(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "tmux", []string{"-L", SocketName, "attach-session", "-t", "sess:win"}).Return(nil)

	client := NewClient(r)
	err := client.AttachToWindow("sess", "win")

	require.NoError(t, err)
}

func TestInsideCcoSocket(t *testing.T) {
	tests := []struct {
		name   string
		tmux   string
		expect bool
	}{
		{"empty", "", false},
		{"default socket", "/tmp/tmux-501/default,1234,0", false},
		{"cco socket", "/tmp/tmux-501/cco,1234,0", true},
		{"private tmp cco", "/private/tmp/tmux-501/cco,5678,1", true},
		{"similar name", "/tmp/tmux-501/cco-other,1234,0", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expect, insideCcoSocket(tt.tmux))
		})
	}
}
```

**Important note on `Attach`/`AttachToWindow`:** The current implementation checks `os.Getenv("TMUX")` to decide between `switch-client` and `attach-session`. To keep this testable, we'll pass the TMUX env value as a field on the Client. The test above assumes the default (empty TMUX → attach-session). Add a `TmuxEnv` field to Client.

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/tmux/ -count=1 -v`
Expected: Compilation failure — `NewClient` not defined, functions are package-level.

**Step 3: Write minimal implementation**

Replace `orchestrator/internal/tmux/tmux.go` with:

```go
package tmux

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
)

const bellPrefix = "🔔 "

const SocketName = "cco"

// Client wraps tmux operations with an injectable command runner.
type Client struct {
	runner   exec.Runner
	TmuxEnv  string // value of $TMUX, used to detect if already inside cco socket
}

// NewClient returns a tmux Client using the given command runner.
func NewClient(runner exec.Runner) *Client {
	return &Client{runner: runner}
}

func (c *Client) tmuxArgs(args ...string) []string {
	return append([]string{"-L", SocketName}, args...)
}

func (c *Client) run(args ...string) ([]byte, error) {
	return c.runner.Run("tmux", c.tmuxArgs(args...)...)
}

func (c *Client) SessionExists(name string) bool {
	_, err := c.run("has-session", "-t", name)
	return err == nil
}

func (c *Client) CreateSession(name, windowName string) error {
	out, err := c.run("new-session", "-d", "-s", name, "-n", windowName)
	if err != nil {
		return fmt.Errorf("tmux new-session failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) WindowExists(session, window string) bool {
	windows, err := c.ListWindows(session)
	if err != nil {
		return false
	}
	for _, w := range windows {
		if w == window || w == bellPrefix+window {
			return true
		}
	}
	return false
}

func (c *Client) ActualWindowName(session, window string) string {
	windows, err := c.ListWindows(session)
	if err != nil {
		return ""
	}
	for _, w := range windows {
		if w == window {
			return window
		}
		if w == bellPrefix+window {
			return bellPrefix + window
		}
	}
	return ""
}

func (c *Client) CreateWindow(session, window, cwd string) error {
	out, err := c.run("new-window", "-t", session, "-n", window, "-c", cwd, "-d")
	if err != nil {
		return fmt.Errorf("tmux new-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) KillWindow(session, window string) error {
	out, err := c.run("kill-window", "-t", session+":"+window)
	if err != nil {
		return fmt.Errorf("tmux kill-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) KillSession(name string) error {
	out, err := c.run("kill-session", "-t", name)
	if err != nil {
		return fmt.Errorf("tmux kill-session failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) SendKeys(session, window, command string) error {
	out, err := c.run("send-keys", "-t", session+":"+window, command, "C-m")
	if err != nil {
		return fmt.Errorf("tmux send-keys failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) RenameWindow(session, oldName, newName string) error {
	out, err := c.run("rename-window", "-t", session+":"+oldName, newName)
	if err != nil {
		return fmt.Errorf("tmux rename-window failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Client) ListWindows(session string) ([]string, error) {
	out, err := c.run("list-windows", "-t", session, "-F", "#{window_name}")
	if err != nil {
		return nil, fmt.Errorf("tmux list-windows failed: %w", err)
	}
	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return nil, nil
	}
	return strings.Split(raw, "\n"), nil
}

func insideCcoSocket(tmuxEnv string) bool {
	if tmuxEnv == "" {
		return false
	}
	socketPath := tmuxEnv
	if i := strings.Index(tmuxEnv, ","); i >= 0 {
		socketPath = tmuxEnv[:i]
	}
	base := filepath.Base(socketPath)
	return base == SocketName
}

func (c *Client) IsActiveWindow(session, window string) bool {
	if !c.WindowExists(session, window) {
		return false
	}
	actual := c.ActualWindowName(session, window)
	out, err := c.run("display-message", "-t", session+":"+actual, "-p", "#{window_active}")
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "1"
}

func (c *Client) Attach(session string) error {
	if insideCcoSocket(c.TmuxEnv) {
		return c.runner.RunInteractive("tmux", c.tmuxArgs("switch-client", "-t", session)...)
	}
	return c.runner.RunInteractive("tmux", c.tmuxArgs("attach-session", "-t", session)...)
}

func (c *Client) AttachToWindow(session, window string) error {
	target := session + ":" + window
	if insideCcoSocket(c.TmuxEnv) {
		return c.runner.RunInteractive("tmux", c.tmuxArgs("switch-client", "-t", target)...)
	}
	return c.runner.RunInteractive("tmux", c.tmuxArgs("attach-session", "-t", target)...)
}
```

**Step 4: Run test to verify it passes**

Run: `cd orchestrator && go test ./internal/tmux/ -count=1 -v`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/tmux/
git commit -m "refactor: convert tmux package to Client struct with Runner dependency"
```

---

### Task 5: Convert lima package to Client struct

**Files:**
- Modify: `orchestrator/internal/lima/lima.go`
- Modify: `orchestrator/internal/lima/lima_test.go`

**Step 1: Write the failing test**

Replace `orchestrator/internal/lima/lima_test.go` with:

```go
package lima

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
)

type mockRunner struct {
	mock.Mock
}

func (m *mockRunner) Run(name string, args ...string) ([]byte, error) {
	callArgs := m.Called(name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
	callArgs := m.Called(dir, name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunInteractive(name string, args ...string) error {
	callArgs := m.Called(name, args)
	return callArgs.Error(0)
}

var _ exec.Runner = (*mockRunner)(nil)

func TestClient_Status_Running(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "limactl", []string{"list", "--json", VMName}).Return([]byte(`[{"name":"cco-sandbox","status":"Running"}]`), nil)

	client := NewClient(r)
	status, err := client.Status()

	require.NoError(t, err)
	assert.Equal(t, "Running", status)
}

func TestClient_Status_NotFound(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "limactl", []string{"list", "--json", VMName}).Return([]byte(`[]`), nil)

	client := NewClient(r)
	status, err := client.Status()

	require.NoError(t, err)
	assert.Equal(t, "", status)
}

func TestClient_Create(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "limactl", []string{"start", "--name=" + VMName, "/tmp/template.yaml"}).Return(nil)

	client := NewClient(r)
	err := client.Create("/tmp/template.yaml")

	require.NoError(t, err)
	r.AssertExpectations(t)
}

func TestClient_Start(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "limactl", []string{"start", VMName}).Return(nil)

	client := NewClient(r)
	err := client.Start()

	require.NoError(t, err)
}

func TestClient_Stop(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "limactl", []string{"stop", VMName}).Return(nil)

	client := NewClient(r)
	err := client.Stop()

	require.NoError(t, err)
}

func TestClient_Delete(t *testing.T) {
	r := new(mockRunner)
	r.On("RunInteractive", "limactl", []string{"delete", VMName}).Return(nil)

	client := NewClient(r)
	err := client.Delete()

	require.NoError(t, err)
}

func TestClient_Copy(t *testing.T) {
	r := new(mockRunner)
	r.On("Run", "limactl", []string{"cp", "/tmp/file", VMName + ":~/.config/file"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.Copy("/tmp/file", "~/.config/file")

	require.NoError(t, err)
}

func TestParseStatus_InvalidJSON(t *testing.T) {
	_, err := parseStatus([]byte(`not json`))
	assert.Error(t, err)
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/lima/ -count=1 -v`
Expected: Compilation failure — `NewClient` not defined.

**Step 3: Write minimal implementation**

Replace `orchestrator/internal/lima/lima.go` with:

```go
package lima

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
)

const VMName = "cco-sandbox"

type instance struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

func parseStatus(data []byte) (string, error) {
	var instances []instance
	if err := json.Unmarshal(data, &instances); err != nil {
		return "", fmt.Errorf("failed to parse limactl output: %s", err)
	}
	if len(instances) == 0 {
		return "", nil
	}
	return instances[0].Status, nil
}

// Client wraps limactl operations with an injectable command runner.
type Client struct {
	runner exec.Runner
}

// NewClient returns a lima Client using the given command runner.
func NewClient(runner exec.Runner) *Client {
	return &Client{runner: runner}
}

// Status returns the VM status: "Running", "Stopped", or "" if not found.
func (c *Client) Status() (string, error) {
	out, err := c.runner.Run("limactl", "list", "--json", VMName)
	if err != nil {
		return "", fmt.Errorf("limactl list failed: %s", strings.TrimSpace(string(out)))
	}
	return parseStatus(out)
}

// Create starts a new VM from a template file path.
func (c *Client) Create(templatePath string) error {
	if err := c.runner.RunInteractive("limactl", "start", "--name="+VMName, templatePath); err != nil {
		return fmt.Errorf("limactl start failed: %s", err)
	}
	return nil
}

// Start boots a stopped VM.
func (c *Client) Start() error {
	if err := c.runner.RunInteractive("limactl", "start", VMName); err != nil {
		return fmt.Errorf("limactl start failed: %s", err)
	}
	return nil
}

// Stop halts a running VM.
func (c *Client) Stop() error {
	if err := c.runner.RunInteractive("limactl", "stop", VMName); err != nil {
		return fmt.Errorf("limactl stop failed: %s", err)
	}
	return nil
}

// Delete removes the VM. Limactl prompts for confirmation interactively.
func (c *Client) Delete() error {
	if err := c.runner.RunInteractive("limactl", "delete", VMName); err != nil {
		return fmt.Errorf("limactl delete failed: %s", err)
	}
	return nil
}

// Copy copies a local file into the VM at the given guest path.
func (c *Client) Copy(localPath, guestPath string) error {
	dest := VMName + ":" + guestPath
	out, err := c.runner.Run("limactl", "cp", localPath, dest)
	if err != nil {
		return fmt.Errorf("limactl cp failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
```

**Note:** `lima.Stop()` originally used `cmd.Stdout = os.Stdout` and `cmd.Stderr = os.Stderr` but not `cmd.Stdin`. Since `RunInteractive` connects all three, this is a minor behavioral change — `Stop` now also connects stdin. This is harmless since `limactl stop` doesn't read stdin.

**Step 4: Run test to verify it passes**

Run: `cd orchestrator && go test ./internal/lima/ -count=1 -v`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/lima/
git commit -m "refactor: convert lima package to Client struct with Runner dependency"
```

---

### Task 6: Convert sandbox package to Service struct

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox.go`
- Modify: `orchestrator/internal/sandbox/sandbox_test.go`

**Step 1: Write the failing test**

Replace `orchestrator/internal/sandbox/sandbox_test.go` with:

```go
package sandbox

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
)

// mockLimaClient implements limaClient for tests.
type mockLimaClient struct {
	mock.Mock
}

func (m *mockLimaClient) Status() (string, error) {
	args := m.Called()
	return args.String(0), args.Error(1)
}

func (m *mockLimaClient) Create(templatePath string) error {
	args := m.Called(templatePath)
	return args.Error(0)
}

func (m *mockLimaClient) Start() error {
	args := m.Called()
	return args.Error(0)
}

func (m *mockLimaClient) Stop() error {
	args := m.Called()
	return args.Error(0)
}

func (m *mockLimaClient) Delete() error {
	args := m.Called()
	return args.Error(0)
}

func (m *mockLimaClient) Copy(src, dst string) error {
	args := m.Called(src, dst)
	return args.Error(0)
}

// --- Embedded file tests (unchanged) ---

func TestEmbeddedFiles_NotEmpty(t *testing.T) {
	assert.NotEmpty(t, limaTemplate)
	assert.NotEmpty(t, claudeMD)
	assert.NotEmpty(t, settingsJSON)
}

func TestEmbeddedLimaTemplate_ContainsExpectedContent(t *testing.T) {
	content := string(limaTemplate)
	assert.Contains(t, content, "minimumLimaVersion")
	assert.Contains(t, content, "ubuntu-24.04")
}

func TestEmbeddedSettingsJSON_ValidJSON(t *testing.T) {
	assert.Contains(t, string(settingsJSON), "permissions")
}

// --- Service tests ---

func TestService_Start_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Start()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Start_AlreadyRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Start()

	require.NoError(t, err)
}

func TestService_Start_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	lima.On("Start").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Start()

	require.NoError(t, err)
	lima.AssertCalled(t, "Start")
}

func TestService_Stop_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Stop")
}

func TestService_Stop_AlreadyStopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Stop")
}

func TestService_Stop_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Stop").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertCalled(t, "Stop")
}

func TestService_Destroy_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Destroy()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Delete")
}

func TestService_Destroy_Exists(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Delete").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Destroy()

	require.NoError(t, err)
	lima.AssertCalled(t, "Delete")
}

func TestService_Provision_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Provision()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Provision_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Provision()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Provision_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Copy", mock.Anything, "~/.claude/CLAUDE.md").Return(nil)
	lima.On("Copy", mock.Anything, "~/.claude/settings.json").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Provision()

	require.NoError(t, err)
	lima.AssertNumberOfCalls(t, "Copy", 2)
}

func TestService_Create_AlreadyRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Create()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Create", mock.Anything)
}

func TestService_Create_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil).Once()
	lima.On("Start").Return(nil)
	// After Start, Provision calls Status again
	lima.On("Status").Return("Running", nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Create()

	require.NoError(t, err)
	lima.AssertCalled(t, "Start")
}

func TestService_Status_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	var buf strings.Builder
	svc := NewService(lima, logging.NoopLogger{})

	status, err := svc.StatusString()

	require.NoError(t, err)
	assert.Equal(t, "NotCreated", status)
	_ = buf
}

func TestService_Status_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{})

	status, err := svc.StatusString()

	require.NoError(t, err)
	assert.Equal(t, "Running", status)
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -v`
Expected: Compilation failure — `NewService`, `limaClient` interface, `StatusString` not defined.

**Step 3: Write minimal implementation**

Replace `orchestrator/internal/sandbox/sandbox.go` with:

```go
package sandbox

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
)

// limaClient defines the lima operations needed by the sandbox service.
type limaClient interface {
	Status() (string, error)
	Create(templatePath string) error
	Start() error
	Stop() error
	Delete() error
	Copy(src, dst string) error
}

// Service manages the sandbox VM lifecycle.
type Service struct {
	lima   limaClient
	logger logging.Logger
}

// NewService returns a sandbox Service.
func NewService(lima limaClient, logger logging.Logger) *Service {
	return &Service{lima: lima, logger: logger}
}

// Create creates, starts, and provisions the sandbox VM.
func (s *Service) Create() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "Running":
		s.logger.Info("Sandbox is already created and running")
		return s.Provision()
	case "Stopped":
		s.logger.Info("Sandbox exists but is stopped, starting...")
		if err := s.lima.Start(); err != nil {
			return err
		}
		return s.Provision()
	}

	templatePath, err := writeTempFile("cco-lima-*.yaml", limaTemplate)
	if err != nil {
		return fmt.Errorf("failed to write lima template: %w", err)
	}
	defer os.Remove(templatePath)

	if err := s.lima.Create(templatePath); err != nil {
		return err
	}
	return s.Provision()
}

// Start starts a stopped sandbox VM.
func (s *Service) Start() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "":
		return fmt.Errorf("sandbox not created, run `cco box create`")
	case "Running":
		s.logger.Info("Sandbox is already running")
		return nil
	}
	return s.lima.Start()
}

// Stop stops a running sandbox VM.
func (s *Service) Stop() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "":
		s.logger.Info("Sandbox is not created")
		return nil
	case "Stopped":
		s.logger.Info("Sandbox is already stopped")
		return nil
	}
	return s.lima.Stop()
}

// Destroy deletes the sandbox VM. Limactl prompts for confirmation.
func (s *Service) Destroy() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	if status == "" {
		s.logger.Info("Sandbox is not created")
		return nil
	}
	return s.lima.Delete()
}

// StatusString returns the sandbox VM status as a display string.
func (s *Service) StatusString() (string, error) {
	status, err := s.lima.Status()
	if err != nil {
		return "", err
	}
	if status == "" {
		return "NotCreated", nil
	}
	return status, nil
}

// Status prints the sandbox VM status to stdout.
func (s *Service) Status() error {
	status, err := s.StatusString()
	if err != nil {
		return err
	}
	fmt.Println(status)
	return nil
}

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

	if err := s.lima.Copy(claudeMDPath, "~/.claude/CLAUDE.md"); err != nil {
		return err
	}
	if err := s.lima.Copy(settingsPath, "~/.claude/settings.json"); err != nil {
		return err
	}

	s.logger.Info("Provisioned Claude config into sandbox")
	return nil
}

func writeTempFile(pattern string, data []byte) (string, error) {
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", err
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}
```

**Step 4: Run test to verify it passes**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -v`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/sandbox/
git commit -m "refactor: convert sandbox package to Service struct with limaClient interface"
```

---

### Task 7: Convert workspace package to Service struct

**Files:**
- Modify: `orchestrator/internal/workspace/workspace.go`

This is the largest task. The workspace package has 5 exported functions that become methods, plus 2 unexported helpers that also need to use the runner for `runSetupScripts`.

**Step 1: Write the failing test**

Create `orchestrator/internal/workspace/workspace_test.go`:

```go
package workspace

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
	"github.com/averycrespi/claudefiles/orchestrator/internal/git"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
)

// mockGitClient implements gitClient for tests.
type mockGitClient struct {
	mock.Mock
}

func (m *mockGitClient) RepoInfo(path string) (git.Info, error) {
	args := m.Called(path)
	return args.Get(0).(git.Info), args.Error(1)
}

func (m *mockGitClient) AddWorktree(repoRoot, worktreeDir, branch string) error {
	args := m.Called(repoRoot, worktreeDir, branch)
	return args.Error(0)
}

func (m *mockGitClient) RemoveWorktree(repoRoot, worktreeDir string) error {
	args := m.Called(repoRoot, worktreeDir)
	return args.Error(0)
}

func (m *mockGitClient) CommonDir(path string) (string, error) {
	args := m.Called(path)
	return args.String(0), args.Error(1)
}

// mockTmuxClient implements tmuxClient for tests.
type mockTmuxClient struct {
	mock.Mock
}

func (m *mockTmuxClient) SessionExists(session string) bool {
	args := m.Called(session)
	return args.Bool(0)
}

func (m *mockTmuxClient) CreateSession(session, window string) error {
	args := m.Called(session, window)
	return args.Error(0)
}

func (m *mockTmuxClient) CreateWindow(session, window, dir string) error {
	args := m.Called(session, window, dir)
	return args.Error(0)
}

func (m *mockTmuxClient) KillWindow(session, window string) error {
	args := m.Called(session, window)
	return args.Error(0)
}

func (m *mockTmuxClient) WindowExists(session, window string) bool {
	args := m.Called(session, window)
	return args.Bool(0)
}

func (m *mockTmuxClient) ListWindows(session string) ([]string, error) {
	args := m.Called(session)
	return args.Get(0).([]string), args.Error(1)
}

func (m *mockTmuxClient) RenameWindow(session, oldName, newName string) error {
	args := m.Called(session, oldName, newName)
	return args.Error(0)
}

func (m *mockTmuxClient) SendKeys(session, window, keys string) error {
	args := m.Called(session, window, keys)
	return args.Error(0)
}

func (m *mockTmuxClient) ActualWindowName(session, window string) string {
	args := m.Called(session, window)
	return args.String(0)
}

func (m *mockTmuxClient) IsActiveWindow(session, window string) bool {
	args := m.Called(session, window)
	return args.Bool(0)
}

func (m *mockTmuxClient) Attach(session string) error {
	args := m.Called(session)
	return args.Error(0)
}

func (m *mockTmuxClient) AttachToWindow(session, window string) error {
	args := m.Called(session, window)
	return args.Error(0)
}

// mockRunner implements exec.Runner for setup script tests.
type mockRunner struct {
	mock.Mock
}

func (m *mockRunner) Run(name string, args ...string) ([]byte, error) {
	callArgs := m.Called(name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
	callArgs := m.Called(dir, name, args)
	return callArgs.Get(0).([]byte), callArgs.Error(1)
}

func (m *mockRunner) RunInteractive(name string, args ...string) error {
	callArgs := m.Called(name, args)
	return callArgs.Error(0)
}

var _ exec.Runner = (*mockRunner)(nil)

func TestService_Init_CreatesSession(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(false)
	tm.On("CreateSession", "cco-myrepo", "main").Return(nil)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Init("/repo")

	require.NoError(t, err)
	tm.AssertCalled(t, "CreateSession", "cco-myrepo", "main")
}

func TestService_Init_SessionAlreadyExists(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(true)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Init("/repo")

	require.NoError(t, err)
	tm.AssertNotCalled(t, "CreateSession", mock.Anything, mock.Anything)
}

func TestService_Init_RejectsWorktree(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/wt").Return(git.Info{Name: "wt", Root: "/wt", IsWorktree: true}, nil)

	svc := NewService(g, new(mockTmuxClient), logging.NoopLogger{}, nil)
	err := svc.Init("/wt")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "main git repository")
}

func TestService_Add_CreatesWorktreeAndWindow(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)
	g.On("AddWorktree", "/repo", mock.Anything, "feat").Return(nil)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(true)
	tm.On("WindowExists", "cco-myrepo", "feat").Return(false)
	tm.On("CreateWindow", "cco-myrepo", "feat", mock.Anything).Return(nil)
	tm.On("SendKeys", "cco-myrepo", "feat", "claude --permission-mode acceptEdits").Return(nil)

	// Use a temp dir that won't exist for the worktree path check
	origDataDir := os.Getenv("XDG_DATA_HOME")
	tmpDir := t.TempDir()
	os.Setenv("XDG_DATA_HOME", tmpDir)
	defer os.Setenv("XDG_DATA_HOME", origDataDir)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Add("/repo", "feat")

	require.NoError(t, err)
	tm.AssertCalled(t, "CreateWindow", "cco-myrepo", "feat", mock.Anything)
	tm.AssertCalled(t, "SendKeys", "cco-myrepo", "feat", "claude --permission-mode acceptEdits")
}

func TestService_Remove_RemovesWorktreeAndWindow(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)

	// Create a fake worktree dir so os.Stat finds it
	origDataDir := os.Getenv("XDG_DATA_HOME")
	tmpDir := t.TempDir()
	os.Setenv("XDG_DATA_HOME", tmpDir)
	defer os.Setenv("XDG_DATA_HOME", origDataDir)

	worktreeDir := filepath.Join(tmpDir, "cco", "worktrees", "myrepo", "myrepo-feat")
	os.MkdirAll(worktreeDir, 0o755)

	g.On("RemoveWorktree", "/repo", worktreeDir).Return(nil)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(true)
	tm.On("ActualWindowName", "cco-myrepo", "feat").Return("feat")
	tm.On("KillWindow", "cco-myrepo", "feat").Return(nil)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Remove("/repo", "feat")

	require.NoError(t, err)
	g.AssertCalled(t, "RemoveWorktree", "/repo", worktreeDir)
	tm.AssertCalled(t, "KillWindow", "cco-myrepo", "feat")
}

func TestService_Attach_Session(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(true)
	tm.On("Attach", "cco-myrepo").Return(nil)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Attach("/repo", "")

	require.NoError(t, err)
	tm.AssertCalled(t, "Attach", "cco-myrepo")
}

func TestService_Attach_Window(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(true)
	tm.On("WindowExists", "cco-myrepo", "feat").Return(true)
	tm.On("ActualWindowName", "cco-myrepo", "feat").Return("feat")
	tm.On("AttachToWindow", "cco-myrepo", "feat").Return(nil)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Attach("/repo", "feat")

	require.NoError(t, err)
	tm.AssertCalled(t, "AttachToWindow", "cco-myrepo", "feat")
}

func TestService_Attach_FromWorktree(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/wt").Return(git.Info{Name: "wt", Root: "/wt", IsWorktree: true}, nil)
	g.On("CommonDir", "/wt").Return("/repo/.git", nil)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-repo").Return(true)
	tm.On("Attach", "cco-repo").Return(nil)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Attach("/wt", "")

	require.NoError(t, err)
	tm.AssertCalled(t, "Attach", "cco-repo")
}

func TestService_Notify_AddssBellPrefix(t *testing.T) {
	g := new(mockGitClient)

	origDataDir := os.Getenv("XDG_DATA_HOME")
	tmpDir := t.TempDir()
	os.Setenv("XDG_DATA_HOME", tmpDir)
	defer os.Setenv("XDG_DATA_HOME", origDataDir)

	worktreeRoot := filepath.Join(tmpDir, "cco", "worktrees", "myrepo", "myrepo-feat")
	g.On("RepoInfo", mock.Anything).Return(git.Info{Name: "myrepo-feat", Root: worktreeRoot, IsWorktree: true}, nil)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(true)
	tm.On("ListWindows", "cco-myrepo").Return([]string{"main", "feat"}, nil)
	tm.On("IsActiveWindow", "cco-myrepo", "feat").Return(false)
	tm.On("RenameWindow", "cco-myrepo", "feat", "🔔 feat").Return(nil)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Notify(worktreeRoot)

	require.NoError(t, err)
	tm.AssertCalled(t, "RenameWindow", "cco-myrepo", "feat", "🔔 feat")
}

func TestService_Notify_SkipsActiveWindow(t *testing.T) {
	g := new(mockGitClient)

	origDataDir := os.Getenv("XDG_DATA_HOME")
	tmpDir := t.TempDir()
	os.Setenv("XDG_DATA_HOME", tmpDir)
	defer os.Setenv("XDG_DATA_HOME", origDataDir)

	worktreeRoot := filepath.Join(tmpDir, "cco", "worktrees", "myrepo", "myrepo-feat")
	g.On("RepoInfo", mock.Anything).Return(git.Info{Name: "myrepo-feat", Root: worktreeRoot, IsWorktree: true}, nil)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(true)
	tm.On("ListWindows", "cco-myrepo").Return([]string{"main", "feat"}, nil)
	tm.On("IsActiveWindow", "cco-myrepo", "feat").Return(true)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Notify(worktreeRoot)

	require.NoError(t, err)
	tm.AssertNotCalled(t, "RenameWindow", mock.Anything, mock.Anything, mock.Anything)
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/workspace/ -count=1 -v`
Expected: Compilation failure — `NewService`, `Service`, interfaces not defined.

**Step 3: Write minimal implementation**

Replace `orchestrator/internal/workspace/workspace.go` with:

```go
package workspace

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
	"github.com/averycrespi/claudefiles/orchestrator/internal/git"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
)

// gitClient defines the git operations needed by the workspace service.
type gitClient interface {
	RepoInfo(path string) (git.Info, error)
	AddWorktree(repoRoot, worktreeDir, branch string) error
	RemoveWorktree(repoRoot, worktreeDir string) error
	CommonDir(path string) (string, error)
}

// tmuxClient defines the tmux operations needed by the workspace service.
type tmuxClient interface {
	SessionExists(session string) bool
	CreateSession(session, window string) error
	CreateWindow(session, window, dir string) error
	KillWindow(session, window string) error
	WindowExists(session, window string) bool
	ListWindows(session string) ([]string, error)
	RenameWindow(session, oldName, newName string) error
	SendKeys(session, window, keys string) error
	ActualWindowName(session, window string) string
	IsActiveWindow(session, window string) bool
	Attach(session string) error
	AttachToWindow(session, window string) error
}

// Service manages workspace lifecycle.
type Service struct {
	git    gitClient
	tmux   tmuxClient
	logger logging.Logger
	runner exec.Runner // used for running setup scripts; nil disables setup
}

// NewService returns a workspace Service.
func NewService(g gitClient, t tmuxClient, l logging.Logger, r exec.Runner) *Service {
	return &Service{git: g, tmux: t, logger: l, runner: r}
}

// Init ensures a tmux session exists for the repository.
func (s *Service) Init(repoRoot string) error {
	info, err := s.git.RepoInfo(repoRoot)
	if err != nil {
		return err
	}
	if info.IsWorktree {
		return fmt.Errorf("this command must be run from the main git repository, not a worktree")
	}

	tmuxSession := paths.TmuxSessionName(info.Name)
	if s.tmux.SessionExists(tmuxSession) {
		s.logger.Debug("tmux session already exists: %s", tmuxSession)
		return nil
	}

	s.logger.Info("creating tmux session: %s with main window", tmuxSession)
	return s.tmux.CreateSession(tmuxSession, "main")
}

// Add creates a new workspace: worktree, tmux window, setup, and Claude launch.
func (s *Service) Add(repoRoot, branch string) error {
	info, err := s.git.RepoInfo(repoRoot)
	if err != nil {
		return err
	}
	if info.IsWorktree {
		return fmt.Errorf("this command must be run from the main git repository, not a worktree")
	}

	// Ensure tmux session exists
	if err := s.Init(repoRoot); err != nil {
		return err
	}

	tmuxSession := paths.TmuxSessionName(info.Name)
	windowName := paths.TmuxWindowName(branch)
	worktreeDir := paths.WorktreeDir(info.Name, branch)

	// Create worktree if it doesn't exist
	if _, err := os.Stat(worktreeDir); os.IsNotExist(err) {
		s.logger.Info("creating worktree at: %s", worktreeDir)
		if err := os.MkdirAll(filepath.Dir(worktreeDir), 0o755); err != nil {
			return fmt.Errorf("could not create worktree directory: %w", err)
		}
		if err := s.git.AddWorktree(info.Root, worktreeDir, branch); err != nil {
			return err
		}
		s.runSetupScripts(worktreeDir)
		copyLocalSettings(info.Root, worktreeDir, s.logger)
	} else {
		s.logger.Debug("worktree already exists at: %s", worktreeDir)
	}

	// Create tmux window if it doesn't exist
	if s.tmux.WindowExists(tmuxSession, windowName) {
		s.logger.Debug("tmux window already exists: %s", windowName)
	} else {
		s.logger.Info("creating tmux window: %s", windowName)
		if err := s.tmux.CreateWindow(tmuxSession, windowName, worktreeDir); err != nil {
			return err
		}
		s.logger.Info("launching Claude Code in tmux window")
		if err := s.tmux.SendKeys(tmuxSession, windowName, "claude --permission-mode acceptEdits"); err != nil {
			return err
		}
	}

	return nil
}

// Remove removes a workspace: worktree and tmux window.
func (s *Service) Remove(repoRoot, branch string) error {
	info, err := s.git.RepoInfo(repoRoot)
	if err != nil {
		return err
	}
	if info.IsWorktree {
		return fmt.Errorf("this command must be run from the main git repository, not a worktree")
	}

	tmuxSession := paths.TmuxSessionName(info.Name)
	windowName := paths.TmuxWindowName(branch)
	worktreeDir := paths.WorktreeDir(info.Name, branch)

	// Remove worktree if it exists
	if _, err := os.Stat(worktreeDir); os.IsNotExist(err) {
		s.logger.Debug("worktree does not exist at: %s", worktreeDir)
	} else {
		s.logger.Info("removing worktree at: %s", worktreeDir)
		if err := s.git.RemoveWorktree(info.Root, worktreeDir); err != nil {
			return err
		}
	}

	// Close tmux window if it exists
	if !s.tmux.SessionExists(tmuxSession) {
		s.logger.Debug("tmux session does not exist: %s", tmuxSession)
		return nil
	}

	actualName := s.tmux.ActualWindowName(tmuxSession, windowName)
	if actualName != "" {
		s.logger.Info("closing tmux window: %s", windowName)
		return s.tmux.KillWindow(tmuxSession, actualName)
	}
	s.logger.Debug("tmux window does not exist: %s", windowName)
	return nil
}

// Attach attaches to the tmux session for the repository at the given path.
// If branch is non-empty, attaches to the specific window for that branch.
// Works from both the main repo and worktrees.
func (s *Service) Attach(path, branch string) error {
	info, err := s.git.RepoInfo(path)
	if err != nil {
		return err
	}

	var repoName string
	if info.IsWorktree {
		commonDir, err := s.git.CommonDir(path)
		if err != nil {
			return fmt.Errorf("could not determine main repo: %w", err)
		}
		resolved := filepath.Clean(filepath.Join(path, commonDir))
		mainRoot := filepath.Dir(resolved)
		repoName = filepath.Base(mainRoot)
	} else {
		repoName = info.Name
	}

	tmuxSession := paths.TmuxSessionName(repoName)

	if !s.tmux.SessionExists(tmuxSession) {
		if info.IsWorktree {
			return fmt.Errorf("tmux session does not exist: %s. Run 'cco add <branch>' from the main repository first", tmuxSession)
		}
		if err := s.Init(path); err != nil {
			return err
		}
	}

	if branch != "" {
		windowName := paths.TmuxWindowName(branch)
		if !s.tmux.WindowExists(tmuxSession, windowName) {
			return fmt.Errorf("tmux window does not exist for branch: %s", branch)
		}
		actualName := s.tmux.ActualWindowName(tmuxSession, windowName)
		s.logger.Info("attaching to tmux window: %s:%s", tmuxSession, windowName)
		return s.tmux.AttachToWindow(tmuxSession, actualName)
	}

	s.logger.Info("attaching to tmux session: %s", tmuxSession)
	return s.tmux.Attach(tmuxSession)
}

// Notify adds a bell emoji to the tmux window for the current workspace.
// Designed to be called from hooks -- prints skip reason to stderr and always returns nil.
func (s *Service) Notify(path string) error {
	info, err := s.git.RepoInfo(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "skipped: %v\n", err)
		return nil
	}

	if !info.IsWorktree {
		fmt.Fprintln(os.Stderr, "skipped: this command must be run from a worktree, not the main repository")
		return nil
	}

	worktreesDir := filepath.Join(paths.DataDir(), "worktrees")
	relPath, err := filepath.Rel(worktreesDir, info.Root)
	if err != nil || relPath == "." || strings.HasPrefix(relPath, "..") {
		fmt.Fprintf(os.Stderr, "skipped: worktree path '%s' is not under cco worktrees directory\n", info.Root)
		return nil
	}

	dir, leaf := filepath.Split(relPath)
	repoName := filepath.Clean(dir)
	if repoName == "" || repoName == "." || leaf == "" {
		fmt.Fprintf(os.Stderr, "skipped: could not parse repo/branch from path '%s'\n", info.Root)
		return nil
	}

	tmuxSession := paths.TmuxSessionName(repoName)

	if !s.tmux.SessionExists(tmuxSession) {
		fmt.Fprintf(os.Stderr, "skipped: tmux session '%s' does not exist\n", tmuxSession)
		return nil
	}

	windowName := strings.TrimPrefix(leaf, repoName+"-")
	windows, err := s.tmux.ListWindows(tmuxSession)
	if err != nil {
		fmt.Fprintf(os.Stderr, "skipped: could not list windows for session '%s'\n", tmuxSession)
		return nil
	}

	bellName := "🔔 " + windowName
	for _, w := range windows {
		if w == bellName {
			s.logger.Debug("tmux window '%s' already has a notification", windowName)
			return nil
		}
	}

	for _, w := range windows {
		if w == windowName {
			if s.tmux.IsActiveWindow(tmuxSession, windowName) {
				fmt.Fprintf(os.Stderr, "skipped: window '%s' is currently active\n", windowName)
				return nil
			}
			s.logger.Info("adding notification to tmux window: %s", windowName)
			if err := s.tmux.RenameWindow(tmuxSession, windowName, bellName); err != nil {
				fmt.Fprintf(os.Stderr, "skipped: could not rename tmux window '%s'\n", windowName)
			}
			return nil
		}
	}

	fmt.Fprintf(os.Stderr, "skipped: tmux window '%s' does not exist\n", windowName)
	return nil
}

// runSetupScripts looks for and runs setup scripts in the workspace directory.
func (s *Service) runSetupScripts(worktreeDir string) {
	if s.runner == nil {
		return
	}
	scriptsDir := filepath.Join(worktreeDir, "scripts")
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
		s.logger.Info("running setup script: %s", scriptPath)
		if err := s.runner.RunInteractive(scriptPath); err != nil {
			fmt.Fprintf(os.Stderr, "warning: setup script %s failed: %v\n", name, err)
		}
		return
	}
	s.logger.Debug("no setup scripts found")
}

// copyLocalSettings copies .claude/settings.local.json from the main repo to the worktree dir.
func copyLocalSettings(repoRoot, worktreeDir string, logger logging.Logger) {
	src := filepath.Join(repoRoot, ".claude", "settings.local.json")
	dst := filepath.Join(worktreeDir, ".claude", "settings.local.json")

	srcFile, err := os.Open(src)
	if err != nil {
		logger.Debug("no local Claude settings found in repo")
		return
	}
	defer srcFile.Close()

	if _, err := os.Stat(dst); err == nil {
		logger.Debug("local Claude settings already exist in worktree")
		return
	}

	logger.Info("copying local Claude settings to: %s", dst)
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not create .claude dir: %v\n", err)
		return
	}
	dstFile, err := os.Create(dst)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not create settings file: %v\n", err)
		return
	}
	defer dstFile.Close()
	io.Copy(dstFile, srcFile)
}
```

**Step 4: Run test to verify it passes**

Run: `cd orchestrator && go test ./internal/workspace/ -count=1 -v`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/workspace/
git commit -m "refactor: convert workspace package to Service struct with consumer-side interfaces"
```

---

### Task 8: Wire services in cmd/ and update integration tests

**Files:**
- Create: `orchestrator/cmd/wire.go`
- Modify: `orchestrator/cmd/root.go`
- Modify: `orchestrator/cmd/add.go`
- Modify: `orchestrator/cmd/rm.go`
- Modify: `orchestrator/cmd/attach.go`
- Modify: `orchestrator/cmd/notify.go`
- Modify: `orchestrator/cmd/box_create.go`
- Modify: `orchestrator/cmd/box_start.go`
- Modify: `orchestrator/cmd/box_stop.go`
- Modify: `orchestrator/cmd/box_destroy.go`
- Modify: `orchestrator/cmd/box_status.go`
- Modify: `orchestrator/cmd/box_provision.go`
- Modify: `orchestrator/cmd/cco/integration_test.go`

**Step 1: Create wire.go with service constructors**

Create `orchestrator/cmd/wire.go`:

```go
package cmd

import (
	"os"

	ccoexec "github.com/averycrespi/claudefiles/orchestrator/internal/exec"
	"github.com/averycrespi/claudefiles/orchestrator/internal/git"
	"github.com/averycrespi/claudefiles/orchestrator/internal/lima"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/averycrespi/claudefiles/orchestrator/internal/tmux"
	"github.com/averycrespi/claudefiles/orchestrator/internal/workspace"
)

func newWorkspaceService() *workspace.Service {
	runner := ccoexec.NewOSRunner()
	logger := logging.NewStdLogger(verbose)
	tc := tmux.NewClient(runner)
	tc.TmuxEnv = os.Getenv("TMUX")
	return workspace.NewService(
		git.NewClient(runner),
		tc,
		logger,
		runner,
	)
}

func newSandboxService() *sandbox.Service {
	runner := ccoexec.NewOSRunner()
	logger := logging.NewStdLogger(verbose)
	return sandbox.NewService(
		lima.NewClient(runner),
		logger,
	)
}
```

**Step 2: Update root.go — remove logging.SetVerbose**

Replace `orchestrator/cmd/root.go` with:

```go
package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

var verbose bool

var rootCmd = &cobra.Command{
	Use:   "cco",
	Short: "Orchestrate Claude Code workspaces",
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "show verbose output")
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
```

**Step 3: Update each command file to use services**

Replace `orchestrator/cmd/add.go`:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var addCmd = &cobra.Command{
	Use:   "add <branch>",
	Short: "Create a workspace for a branch",
	Long: `Create a workspace (worktree + tmux window) for a branch, then launch Claude Code in it.

This command is idempotent, and can safely be run multiple times:
- If the tmux session does not exist -> initialize the session
- If the branch does not exist -> create the branch
- If the worktree does not exist -> create the worktree & perform setup
- If the tmux window does not exist -> create the window & launch Claude Code

Notes:
- Must be run from the main repository, not a worktree`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		svc := newWorkspaceService()
		if err := svc.Add(cwd, args[0]); err != nil {
			return err
		}
		attach, _ := cmd.Flags().GetBool("attach")
		if attach {
			return svc.Attach(cwd, args[0])
		}
		return nil
	},
}

func init() {
	addCmd.Flags().BoolP("attach", "a", false, "Attach to the workspace after creation")
	rootCmd.AddCommand(addCmd)
}
```

Replace `orchestrator/cmd/rm.go`:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rmCmd = &cobra.Command{
	Use:   "rm <branch>",
	Short: "Remove a workspace",
	Long: `Remove the git worktree and close the tmux window for the given branch.

This command is idempotent, and can safely be run multiple times:
- If the tmux window exists -> close the window
- If the worktree exists -> remove the worktree

Notes:
- The branch itself will NOT be deleted
- Must be run from the main repository, not a worktree`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return newWorkspaceService().Remove(cwd, args[0])
	},
}

func init() {
	rootCmd.AddCommand(rmCmd)
}
```

Replace `orchestrator/cmd/attach.go`:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var attachCmd = &cobra.Command{
	Use:   "attach [branch]",
	Short: "Attach to the tmux session or window",
	Long: `Attach to the repository's tmux session, or a specific window in the session.

This command has two modes of operation:
- If a branch is provided -> attach to the branch's window in the session
- If no branch is provided -> just attach to the session itself

Notes:
- If the tmux session does not exist, it will be created
- Can be run from the main repository or a worktree
- If we're already in the tmux session, switch instead of attaching`,
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
		return newWorkspaceService().Attach(cwd, branch)
	},
}

func init() {
	rootCmd.AddCommand(attachCmd)
}
```

Replace `orchestrator/cmd/notify.go`:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var notifyCmd = &cobra.Command{
	Use:   "notify",
	Short: "Add notification bell to current workspace's tmux window",
	Long: `Add a bell emoji prefix to the tmux window name for the current workspace.

The bell is skipped when:
- The window is already the active window in the session
- The window already has a bell prefix
- The command is not run from a cco-managed worktree

Notes:
- Designed for hooks: always exits 0, even when skipping`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return newWorkspaceService().Notify(cwd)
	},
}

func init() {
	rootCmd.AddCommand(notifyCmd)
}
```

Replace each `box_*.go` file:

`orchestrator/cmd/box_create.go`:
```go
package cmd

import "github.com/spf13/cobra"

var boxCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create, start, and provision the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Create()
	},
}

func init() { boxCmd.AddCommand(boxCreateCmd) }
```

`orchestrator/cmd/box_start.go`:
```go
package cmd

import "github.com/spf13/cobra"

var boxStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Start()
	},
}

func init() { boxCmd.AddCommand(boxStartCmd) }
```

`orchestrator/cmd/box_stop.go`:
```go
package cmd

import "github.com/spf13/cobra"

var boxStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Stop()
	},
}

func init() { boxCmd.AddCommand(boxStopCmd) }
```

`orchestrator/cmd/box_destroy.go`:
```go
package cmd

import "github.com/spf13/cobra"

var boxDestroyCmd = &cobra.Command{
	Use:   "destroy",
	Short: "Delete the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Destroy()
	},
}

func init() { boxCmd.AddCommand(boxDestroyCmd) }
```

`orchestrator/cmd/box_status.go`:
```go
package cmd

import "github.com/spf13/cobra"

var boxStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show the sandbox VM status",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Status()
	},
}

func init() { boxCmd.AddCommand(boxStatusCmd) }
```

`orchestrator/cmd/box_provision.go`:
```go
package cmd

import "github.com/spf13/cobra"

var boxProvisionCmd = &cobra.Command{
	Use:   "provision",
	Short: "Copy Claude config files into the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Provision()
	},
}

func init() { boxCmd.AddCommand(boxProvisionCmd) }
```

**Step 4: Update integration tests**

Read `orchestrator/cmd/cco/integration_test.go` — it builds the binary and runs it end-to-end. These tests call the compiled `cco` binary, so they don't need changes to import paths. However, any helper functions that directly call the old package-level functions (like `tmux.KillSession`) need to be updated to use `tmux.Client`.

Scan the integration test and update any direct calls to `tmux.*` package-level functions to use a `tmux.Client` instance. For example, `tmux.KillSession(session)` becomes:

```go
tc := tmux.NewClient(ccoexec.NewOSRunner())
tc.KillSession(session)
```

Similarly for any `tmux.ListWindows`, etc. used in test helpers.

**Step 5: Run all tests**

Run: `cd orchestrator && go test ./... -count=1`
Expected: All PASS (unit tests for all packages + integration tests)

**Step 6: Commit**

```bash
git add orchestrator/cmd/ orchestrator/go.mod orchestrator/go.sum
git commit -m "refactor: wire services in cmd/ layer with dependency injection"
```

---

### Task 9: Update documentation

**Files:**
- Modify: `orchestrator/README.md`

The Architecture section of the README needs updating to reflect the new structure. The commands and usage sections stay the same.

**Step 1: Update the Architecture section**

In `orchestrator/README.md`, replace the Architecture section (starting at "## Architecture") with:

```markdown
## Architecture

cco is built in Go with [Cobra](https://github.com/spf13/cobra) for CLI scaffolding and follows a dependency injection pattern for testability.

```
cmd/                    # CLI commands + service wiring
├── root.go            # Root command, verbose flag
├── wire.go            # Service constructors (composition root)
├── add.go             # cco add
├── rm.go              # cco rm
├── attach.go          # cco attach
├── notify.go          # cco notify
└── box*.go            # cco box (sandbox management)
internal/
├── exec/              # Runner interface: abstracts os/exec for testability
├── lima/              # Lima Client: wraps limactl with Runner
├── sandbox/           # Sandbox Service: composes lima Client + embedded files
│   └── files/         # Embedded VM template and Claude configs
├── git/               # Git Client: wraps git with Runner
├── tmux/              # Tmux Client: wraps tmux with Runner
├── workspace/         # Workspace Service: composes git + tmux Clients
├── paths/             # Storage paths and naming conventions
└── logging/           # Logger interface with StdLogger and NoopLogger
```

Each `cmd/` file creates services via `wire.go`, which wires together Clients and Services using `exec.OSRunner`. The workspace and sandbox services define consumer-side interfaces for their dependencies, enabling unit testing with mocks.
```

**Step 2: Run tests to make sure nothing broke**

Run: `cd orchestrator && go test ./... -count=1`
Expected: All PASS

**Step 3: Commit**

```bash
git add orchestrator/README.md
git commit -m "docs: update README architecture section for dependency injection"
```
