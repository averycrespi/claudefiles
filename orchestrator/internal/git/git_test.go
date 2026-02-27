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

func TestClient_DeleteBranch_Safe(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"branch", "-d", "feat"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.DeleteBranch("/repo", "feat", false)

	require.NoError(t, err)
	r.AssertExpectations(t)
}

func TestClient_DeleteBranch_Force(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"branch", "-D", "feat"}).Return([]byte(""), nil)

	client := NewClient(r)
	err := client.DeleteBranch("/repo", "feat", true)

	require.NoError(t, err)
	r.AssertExpectations(t)
}

func TestClient_DeleteBranch_Error(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"branch", "-d", "feat"}).Return([]byte("error: branch 'feat' is not fully merged"), assert.AnError)

	client := NewClient(r)
	err := client.DeleteBranch("/repo", "feat", false)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not fully merged")
}

func TestClient_CommonDir(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/wt", "git", []string{"rev-parse", "--git-common-dir"}).Return([]byte("/repo/.git\n"), nil)

	client := NewClient(r)
	dir, err := client.CommonDir("/wt")

	require.NoError(t, err)
	assert.Equal(t, "/repo/.git", dir)
}
