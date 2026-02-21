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
