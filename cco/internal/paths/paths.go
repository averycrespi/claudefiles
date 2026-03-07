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
	return filepath.Join(DataDir(), "worktrees", repo, repo+"-"+SanitizeBranch(branch))
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

// ConfigDir returns the cco config directory.
// Uses $XDG_CONFIG_HOME/cco or defaults to ~/.config/cco.
func ConfigDir() string {
	base := os.Getenv("XDG_CONFIG_HOME")
	if base == "" {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "cco")
}

// ConfigFilePath returns the path to the cco config file.
func ConfigFilePath() string {
	return filepath.Join(ConfigDir(), "config.json")
}

// ExchangeDir returns the directory for sandbox bundle exchange.
func ExchangeDir() string {
	return filepath.Join(DataDir(), "exchange")
}

// JobExchangeDir returns the exchange directory for a specific job.
func JobExchangeDir(jobID string) string {
	return filepath.Join(ExchangeDir(), jobID)
}
