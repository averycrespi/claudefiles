# `cco rm` Branch Deletion Flags Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add `-d` and `-D` flags to `cco rm` that delete the underlying git branch after removing the workspace, mirroring `git branch -d` and `git branch -D`.

**Architecture:** Add a `DeleteBranch` method to the git client, extend the `gitClient` interface, update `workspace.Service.Remove()` to accept delete options, and wire flags through `cmd/rm.go`.

**Tech Stack:** Go, cobra (CLI), testify (mocks/assertions)

---

### Task 1: Add `DeleteBranch` to git client

**Files:**
- Modify: `orchestrator/internal/git/git.go:84` (append after `RemoveWorktree`)
- Test: `orchestrator/internal/git/git_test.go`

**Step 1: Write the failing tests**

Add to `orchestrator/internal/git/git_test.go`:

```go
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
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/git/ -run 'TestClient_DeleteBranch' -v -count=1`
Expected: FAIL — `DeleteBranch` method does not exist.

**Step 3: Write minimal implementation**

Add to `orchestrator/internal/git/git.go` after the `RemoveWorktree` method:

```go
// DeleteBranch deletes a local git branch.
// If force is true, uses -D (force delete). Otherwise uses -d (safe delete).
func (c *Client) DeleteBranch(repoRoot, branch string, force bool) error {
	flag := "-d"
	if force {
		flag = "-D"
	}
	out, err := c.runner.RunDir(repoRoot, "git", "branch", flag, branch)
	if err != nil {
		return fmt.Errorf("git branch delete failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/git/ -run 'TestClient_DeleteBranch' -v -count=1`
Expected: PASS (all 3 tests)

**Step 5: Commit**

```
feat(git): add DeleteBranch method to git client
```

---

### Task 2: Wire branch deletion through workspace service

**Files:**
- Modify: `orchestrator/internal/workspace/workspace.go:17-22` (interface), `orchestrator/internal/workspace/workspace.go:124-161` (Remove method)
- Modify: `orchestrator/internal/workspace/workspace_test.go:18-40` (mock)
- Test: `orchestrator/internal/workspace/workspace_test.go`

**Step 1: Write the failing tests**

Add `DeleteBranch` to the `mockGitClient` in `orchestrator/internal/workspace/workspace_test.go` (after the `CommonDir` mock method at line 40):

```go
func (m *mockGitClient) DeleteBranch(repoRoot, branch string, force bool) error {
	args := m.Called(repoRoot, branch, force)
	return args.Error(0)
}
```

Then add these test functions:

```go
func TestService_Remove_DeletesBranch(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)
	g.On("DeleteBranch", "/repo", "feat", false).Return(nil)

	origDataDir := os.Getenv("XDG_DATA_HOME")
	tmpDir := t.TempDir()
	os.Setenv("XDG_DATA_HOME", tmpDir)
	defer os.Setenv("XDG_DATA_HOME", origDataDir)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(false)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Remove("/repo", "feat", true, false)

	require.NoError(t, err)
	g.AssertCalled(t, "DeleteBranch", "/repo", "feat", false)
}

func TestService_Remove_ForceDeletesBranch(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)
	g.On("DeleteBranch", "/repo", "feat", true).Return(nil)

	origDataDir := os.Getenv("XDG_DATA_HOME")
	tmpDir := t.TempDir()
	os.Setenv("XDG_DATA_HOME", tmpDir)
	defer os.Setenv("XDG_DATA_HOME", origDataDir)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(false)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Remove("/repo", "feat", false, true)

	require.NoError(t, err)
	g.AssertCalled(t, "DeleteBranch", "/repo", "feat", true)
}

func TestService_Remove_SkipsBranchDeleteByDefault(t *testing.T) {
	g := new(mockGitClient)
	g.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)

	origDataDir := os.Getenv("XDG_DATA_HOME")
	tmpDir := t.TempDir()
	os.Setenv("XDG_DATA_HOME", tmpDir)
	defer os.Setenv("XDG_DATA_HOME", origDataDir)

	tm := new(mockTmuxClient)
	tm.On("SessionExists", "cco-myrepo").Return(false)

	svc := NewService(g, tm, logging.NoopLogger{}, nil)
	err := svc.Remove("/repo", "feat", false, false)

	require.NoError(t, err)
	g.AssertNotCalled(t, "DeleteBranch", mock.Anything, mock.Anything, mock.Anything)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/workspace/ -run 'TestService_Remove' -v -count=1`
Expected: FAIL — compilation errors (interface mismatch, wrong number of args to `Remove`).

**Step 3: Implement the changes**

3a. Add `DeleteBranch` to the `gitClient` interface in `orchestrator/internal/workspace/workspace.go`:

```go
type gitClient interface {
	RepoInfo(path string) (git.Info, error)
	AddWorktree(repoRoot, worktreeDir, branch string) error
	RemoveWorktree(repoRoot, worktreeDir string) error
	DeleteBranch(repoRoot, branch string, force bool) error
	CommonDir(path string) (string, error)
}
```

3b. Update the `Remove` method signature and add branch deletion at the end, in `orchestrator/internal/workspace/workspace.go`:

```go
// Remove removes a workspace: worktree, tmux window, and optionally the branch.
func (s *Service) Remove(repoRoot, branch string, deleteBranch, forceDelete bool) error {
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
	} else {
		actualName := s.tmux.ActualWindowName(tmuxSession, windowName)
		if actualName != "" {
			s.logger.Info("closing tmux window: %s", windowName)
			if err := s.tmux.KillWindow(tmuxSession, actualName); err != nil {
				return err
			}
		} else {
			s.logger.Debug("tmux window does not exist: %s", windowName)
		}
	}

	// Delete branch if requested
	if deleteBranch || forceDelete {
		s.logger.Info("deleting branch: %s (force=%v)", branch, forceDelete)
		if err := s.git.DeleteBranch(info.Root, branch, forceDelete); err != nil {
			return err
		}
	}

	return nil
}
```

**Important:** Note the tmux window section now uses `if/else` instead of early-returning with `return nil` or `return s.tmux.KillWindow(...)`. This is required so execution always reaches the branch deletion step at the bottom. The existing test `TestService_Remove_RemovesWorktreeAndWindow` must be updated to pass the new parameters.

3c. Update the existing `TestService_Remove_RemovesWorktreeAndWindow` test. Change the call from:

```go
err := svc.Remove("/repo", "feat")
```

to:

```go
err := svc.Remove("/repo", "feat", false, false)
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/workspace/ -run 'TestService_Remove' -v -count=1`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```
feat(workspace): add branch deletion to Remove method
```

---

### Task 3: Add `-d` and `-D` flags to `cco rm` command

**Files:**
- Modify: `orchestrator/cmd/rm.go`

**Step 1: No unit test needed**

The cobra command layer is thin glue — the logic is tested in Task 1 and Task 2. This task wires the flags through.

**Step 2: Update `cmd/rm.go`**

Replace the full contents of `orchestrator/cmd/rm.go` with:

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
	Long: `Remove the workspace (worktree + window) for a branch.

Skips any steps which have already been completed.
Does NOT delete the branch itself unless -d or -D is passed.
Must be run from the main repository, not a worktree.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		deleteBranch, _ := cmd.Flags().GetBool("delete")
		forceDelete, _ := cmd.Flags().GetBool("force-delete")
		if deleteBranch && forceDelete {
			return fmt.Errorf("cannot use both -d and -D; use -D for force delete")
		}
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return newWorkspaceService().Remove(cwd, args[0], deleteBranch, forceDelete)
	},
}

func init() {
	rmCmd.Flags().BoolP("delete", "d", false, "Delete the branch (git branch -d)")
	rmCmd.Flags().BoolP("force-delete", "D", false, "Force delete the branch (git branch -D)")
	rootCmd.AddCommand(rmCmd)
}
```

**Step 3: Run all tests to verify nothing is broken**

Run: `cd orchestrator && go test ./... -count=1`
Expected: PASS

**Step 4: Commit**

```
feat(cli): add -d and -D flags to cco rm command
```

---

### Task 4: Update documentation

**Files:**
- Modify: `orchestrator/README.md` (if it documents `cco rm` usage)

**Step 1: Check if README documents `cco rm`**

Read `orchestrator/README.md` and search for `rm` usage documentation.

**Step 2: Update the `rm` section**

If the README has a `rm` section, update it to mention the new flags. Example:

```
cco rm <branch>           # Remove workspace (worktree + window)
cco rm -d <branch>        # Remove workspace and delete branch
cco rm -D <branch>        # Remove workspace and force-delete branch
```

If the README doesn't document individual commands, skip this step.

**Step 3: Commit**

```
docs: document -d and -D flags for cco rm
```
