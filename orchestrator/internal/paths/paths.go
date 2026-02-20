package paths

import (
	"os"
	"path/filepath"
	"regexp"
)

var nonAlphanumericDash = regexp.MustCompile(`[^a-zA-Z0-9-]`)

// DataDir returns the base CCO data directory.
// Uses $XDG_DATA_HOME/cco or defaults to ~/.local/share/cco.
func DataDir() string {
	base := os.Getenv("XDG_DATA_HOME")
	if base == "" {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, ".local", "share")
	}
	return filepath.Join(base, "cco")
}

// WorktreeDir returns the full path to a workspace's worktree directory.
func WorktreeDir(repo, branch string) string {
	return filepath.Join(DataDir(), "worktrees", repo, SanitizeBranch(branch))
}

// SanitizeBranch replaces non-alphanumeric characters (except hyphens) with hyphens.
func SanitizeBranch(branch string) string {
	return nonAlphanumericDash.ReplaceAllString(branch, "-")
}

// TmuxSessionName returns the tmux session name for a repository.
func TmuxSessionName(repo string) string {
	return "cco-" + repo
}

// TmuxWindowName returns the tmux window name for a branch.
func TmuxWindowName(branch string) string {
	return SanitizeBranch(branch)
}
