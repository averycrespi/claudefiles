package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// helper: create a temp git repo with an initial commit
func setupRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	// Resolve symlinks so paths match git's resolved output (needed on macOS
	// where /var is a symlink to /private/var).
	dir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatalf("EvalSymlinks: %v", err)
	}
	run(t, dir, "git", "init")
	run(t, dir, "git", "commit", "--allow-empty", "-m", "init")
	return dir
}

func run(t *testing.T, dir string, name string, args ...string) {
	t.Helper()
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s %v failed: %s\n%s", name, args, err, out)
	}
}

func TestRepoInfo_MainRepo(t *testing.T) {
	dir := setupRepo(t)
	info, err := RepoInfo(dir)
	if err != nil {
		t.Fatalf("RepoInfo() error: %v", err)
	}
	if info.Name != filepath.Base(dir) {
		t.Errorf("Name = %q, want %q", info.Name, filepath.Base(dir))
	}
	if info.Root != dir {
		t.Errorf("Root = %q, want %q", info.Root, dir)
	}
	if info.IsWorktree {
		t.Error("IsWorktree = true, want false")
	}
}

func TestRepoInfo_NotARepo(t *testing.T) {
	dir := t.TempDir()
	_, err := RepoInfo(dir)
	if err == nil {
		t.Error("RepoInfo() expected error for non-repo dir")
	}
}

func TestBranchExists(t *testing.T) {
	dir := setupRepo(t)
	run(t, dir, "git", "branch", "test-branch")
	if !BranchExists(dir, "test-branch") {
		t.Error("BranchExists(test-branch) = false, want true")
	}
	if BranchExists(dir, "nonexistent") {
		t.Error("BranchExists(nonexistent) = true, want false")
	}
}

func TestAddWorktree(t *testing.T) {
	dir := setupRepo(t)
	wtDir := filepath.Join(t.TempDir(), "wt")
	err := AddWorktree(dir, wtDir, "new-branch")
	if err != nil {
		t.Fatalf("AddWorktree() error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(wtDir, ".git")); os.IsNotExist(err) {
		t.Error("worktree .git file not created")
	}
	info, err := RepoInfo(wtDir)
	if err != nil {
		t.Fatalf("RepoInfo(worktree) error: %v", err)
	}
	if !info.IsWorktree {
		t.Error("IsWorktree = false, want true")
	}
}

func TestAddWorktree_ExistingBranch(t *testing.T) {
	dir := setupRepo(t)
	run(t, dir, "git", "branch", "existing")
	wtDir := filepath.Join(t.TempDir(), "wt")
	err := AddWorktree(dir, wtDir, "existing")
	if err != nil {
		t.Fatalf("AddWorktree() error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(wtDir, ".git")); os.IsNotExist(err) {
		t.Error("worktree .git file not created")
	}
}

func TestRemoveWorktree(t *testing.T) {
	dir := setupRepo(t)
	wtDir := filepath.Join(t.TempDir(), "wt")
	AddWorktree(dir, wtDir, "rm-branch")
	err := RemoveWorktree(dir, wtDir)
	if err != nil {
		t.Fatalf("RemoveWorktree() error: %v", err)
	}
	if _, err := os.Stat(wtDir); !os.IsNotExist(err) {
		t.Error("worktree directory still exists after removal")
	}
}
