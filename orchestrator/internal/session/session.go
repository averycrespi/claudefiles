package session

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/git"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
	"github.com/averycrespi/claudefiles/orchestrator/internal/tmux"
)

// Init ensures a tmux session exists for the repository.
func Init(repoRoot string) error {
	info, err := git.RepoInfo(repoRoot)
	if err != nil {
		return err
	}
	if info.IsWorktree {
		return fmt.Errorf("this command must be run from the main git repository, not a worktree")
	}

	sessionName := paths.TmuxSessionName(info.Name)
	if tmux.SessionExists(sessionName) {
		logging.Debug("tmux session already exists: %s", sessionName)
		return nil
	}

	logging.Info("creating tmux session: %s with main window", sessionName)
	return tmux.CreateSession(sessionName, "main")
}

// Add creates a new session: worktree, tmux window, setup, and Claude launch.
func Add(repoRoot, branch string) error {
	info, err := git.RepoInfo(repoRoot)
	if err != nil {
		return err
	}
	if info.IsWorktree {
		return fmt.Errorf("this command must be run from the main git repository, not a worktree")
	}

	// Ensure tmux session exists
	if err := Init(repoRoot); err != nil {
		return err
	}

	sessionName := paths.TmuxSessionName(info.Name)
	windowName := paths.TmuxWindowName(branch)
	sessionDir := paths.SessionDir(info.Name, branch)

	// Create worktree if it doesn't exist
	if _, err := os.Stat(sessionDir); os.IsNotExist(err) {
		logging.Info("creating worktree at: %s", sessionDir)
		if err := os.MkdirAll(filepath.Dir(sessionDir), 0o755); err != nil {
			return fmt.Errorf("could not create worktree directory: %w", err)
		}
		if err := git.AddWorktree(info.Root, sessionDir, branch); err != nil {
			return err
		}
		runSetupScripts(sessionDir)
		copyLocalSettings(info.Root, sessionDir)
	} else {
		logging.Debug("worktree already exists at: %s", sessionDir)
	}

	// Create tmux window if it doesn't exist
	if tmux.WindowExists(sessionName, windowName) {
		logging.Debug("tmux window already exists: %s", windowName)
	} else {
		logging.Info("creating tmux window: %s", windowName)
		if err := tmux.CreateWindow(sessionName, windowName, sessionDir); err != nil {
			return err
		}
		logging.Info("launching Claude Code in tmux window")
		if err := tmux.SendKeys(sessionName, windowName, "claude --permission-mode acceptEdits"); err != nil {
			return err
		}
	}

	return nil
}

// Remove removes a session: worktree and tmux window.
func Remove(repoRoot, branch string) error {
	info, err := git.RepoInfo(repoRoot)
	if err != nil {
		return err
	}
	if info.IsWorktree {
		return fmt.Errorf("this command must be run from the main git repository, not a worktree")
	}

	sessionName := paths.TmuxSessionName(info.Name)
	windowName := paths.TmuxWindowName(branch)
	sessionDir := paths.SessionDir(info.Name, branch)

	// Remove worktree if it exists
	if _, err := os.Stat(sessionDir); os.IsNotExist(err) {
		logging.Debug("worktree does not exist at: %s", sessionDir)
	} else {
		logging.Info("removing worktree at: %s", sessionDir)
		if err := git.RemoveWorktree(info.Root, sessionDir); err != nil {
			return err
		}
	}

	// Close tmux window if it exists
	if !tmux.SessionExists(sessionName) {
		logging.Debug("tmux session does not exist: %s", sessionName)
		return nil
	}

	actualName := tmux.ActualWindowName(sessionName, windowName)
	if actualName != "" {
		logging.Info("closing tmux window: %s", windowName)
		return tmux.KillWindow(sessionName, actualName)
	}
	logging.Debug("tmux window does not exist: %s", windowName)
	return nil
}

// Attach attaches to the tmux session for the repository at the given path.
// Works from both the main repo and worktrees.
func Attach(path string) error {
	info, err := git.RepoInfo(path)
	if err != nil {
		return err
	}

	var repoName string
	if info.IsWorktree {
		cmd := exec.Command("git", "rev-parse", "--git-common-dir")
		cmd.Dir = path
		out, err := cmd.Output()
		if err != nil {
			return fmt.Errorf("could not determine main repo: %w", err)
		}
		commonDir := filepath.Clean(filepath.Join(path, strings.TrimSpace(string(out))))
		mainRoot := filepath.Dir(commonDir)
		repoName = filepath.Base(mainRoot)
	} else {
		repoName = info.Name
	}

	sessionName := paths.TmuxSessionName(repoName)

	if !tmux.SessionExists(sessionName) {
		if info.IsWorktree {
			return fmt.Errorf("tmux session does not exist: %s. Run 'cco add <branch>' from the main repository first", sessionName)
		}
		if err := Init(path); err != nil {
			return err
		}
	}

	logging.Info("attaching to tmux session: %s", sessionName)
	return tmux.Attach(sessionName)
}

// Notify adds a bell emoji to the tmux window for the current session.
// Designed to be called from hooks — prints skip reason to stderr and always returns nil.
func Notify(path string) error {
	info, err := git.RepoInfo(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "skipped: %v\n", err)
		return nil
	}

	if !info.IsWorktree {
		fmt.Fprintln(os.Stderr, "skipped: this command must be run from a worktree, not the main repository")
		return nil
	}

	// Derive session info from the worktree path.
	// For cco-managed worktrees, the path is:
	//   ~/.local/share/cco/sessions/{repo}/{branch}/
	sessionsDir := filepath.Join(paths.DataDir(), "sessions")
	relPath, err := filepath.Rel(sessionsDir, info.Root)
	if err != nil || relPath == "." || strings.HasPrefix(relPath, "..") {
		fmt.Fprintf(os.Stderr, "skipped: worktree path '%s' is not under cco sessions directory\n", info.Root)
		return nil
	}

	dir, branch := filepath.Split(relPath)
	repoName := filepath.Clean(dir)
	if repoName == "" || repoName == "." || branch == "" {
		fmt.Fprintf(os.Stderr, "skipped: could not parse repo/branch from path '%s'\n", info.Root)
		return nil
	}

	sessionName := paths.TmuxSessionName(repoName)

	if !tmux.SessionExists(sessionName) {
		fmt.Fprintf(os.Stderr, "skipped: tmux session '%s' does not exist\n", sessionName)
		return nil
	}

	windowName := branch
	windows, err := tmux.ListWindows(sessionName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "skipped: could not list windows for session '%s'\n", sessionName)
		return nil
	}

	bellName := "🔔 " + windowName
	for _, w := range windows {
		if w == bellName {
			logging.Debug("tmux window '%s' already has a notification", windowName)
			return nil
		}
	}

	for _, w := range windows {
		if w == windowName {
			logging.Info("adding notification to tmux window: %s", windowName)
			if err := tmux.RenameWindow(sessionName, windowName, bellName); err != nil {
				fmt.Fprintf(os.Stderr, "skipped: could not rename tmux window '%s'\n", windowName)
			}
			return nil
		}
	}

	fmt.Fprintf(os.Stderr, "skipped: tmux window '%s' does not exist\n", windowName)
	return nil
}

// runSetupScripts looks for and runs setup scripts in the session directory.
func runSetupScripts(sessionDir string) {
	scriptsDir := filepath.Join(sessionDir, "scripts")
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
		logging.Info("running setup script: %s", scriptPath)
		cmd := exec.Command(scriptPath)
		cmd.Dir = sessionDir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "warning: setup script %s failed: %v\n", name, err)
		}
		return
	}
	logging.Debug("no setup scripts found")
}

// copyLocalSettings copies .claude/settings.local.json from the main repo to the session dir.
func copyLocalSettings(repoRoot, sessionDir string) {
	src := filepath.Join(repoRoot, ".claude", "settings.local.json")
	dst := filepath.Join(sessionDir, ".claude", "settings.local.json")

	srcFile, err := os.Open(src)
	if err != nil {
		logging.Debug("no local Claude settings found in repo")
		return
	}
	defer srcFile.Close()

	if _, err := os.Stat(dst); err == nil {
		logging.Debug("local Claude settings already exist in worktree")
		return
	}

	logging.Info("copying local Claude settings to: %s", dst)
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
