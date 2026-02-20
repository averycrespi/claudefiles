package git

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// Info contains information about a git repository.
type Info struct {
	Name       string // Repository directory name
	Root       string // Absolute path to repository root
	IsWorktree bool   // True if path is inside a worktree (not the main repo)
}

// RepoInfo returns information about the git repository at the given path.
func RepoInfo(path string) (Info, error) {
	cmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
	cmd.Dir = path
	if out, err := cmd.CombinedOutput(); err != nil {
		return Info{}, fmt.Errorf("not a git repository: %s", strings.TrimSpace(string(out)))
	}

	cmd = exec.Command("git", "rev-parse", "--show-toplevel")
	cmd.Dir = path
	out, err := cmd.Output()
	if err != nil {
		return Info{}, fmt.Errorf("could not determine repo root: %w", err)
	}
	root := strings.TrimSpace(string(out))

	cmd = exec.Command("git", "rev-parse", "--git-common-dir")
	cmd.Dir = path
	out, err = cmd.Output()
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
func BranchExists(repoRoot, branch string) bool {
	cmd := exec.Command("git", "show-ref", "--verify", "--quiet", "refs/heads/"+branch)
	cmd.Dir = repoRoot
	return cmd.Run() == nil
}

// AddWorktree creates a git worktree at the given path.
// If the branch exists locally, it checks it out. Otherwise, it creates a new branch.
func AddWorktree(repoRoot, path, branch string) error {
	if BranchExists(repoRoot, branch) {
		cmd := exec.Command("git", "worktree", "add", "--quiet", path, branch)
		cmd.Dir = repoRoot
		out, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("git worktree add failed: %s", strings.TrimSpace(string(out)))
		}
	} else {
		cmd := exec.Command("git", "worktree", "add", "--quiet", "-b", branch, path)
		cmd.Dir = repoRoot
		out, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("git worktree add -b failed: %s", strings.TrimSpace(string(out)))
		}
	}
	return nil
}

// RemoveWorktree removes a git worktree at the given path.
func RemoveWorktree(repoRoot, path string) error {
	cmd := exec.Command("git", "worktree", "remove", path)
	cmd.Dir = repoRoot
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git worktree remove failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
