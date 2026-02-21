package workspace

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

	tmuxSession := paths.TmuxSessionName(info.Name)
	if tmux.SessionExists(tmuxSession) {
		logging.Debug("tmux session already exists: %s", tmuxSession)
		return nil
	}

	logging.Info("creating tmux session: %s with main window", tmuxSession)
	return tmux.CreateSession(tmuxSession, "main")
}

// Add creates a new workspace: worktree, tmux window, setup, and Claude launch.
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

	tmuxSession := paths.TmuxSessionName(info.Name)
	windowName := paths.TmuxWindowName(branch)
	worktreeDir := paths.WorktreeDir(info.Name, branch)

	// Create worktree if it doesn't exist
	if _, err := os.Stat(worktreeDir); os.IsNotExist(err) {
		logging.Info("creating worktree at: %s", worktreeDir)
		if err := os.MkdirAll(filepath.Dir(worktreeDir), 0o755); err != nil {
			return fmt.Errorf("could not create worktree directory: %w", err)
		}
		if err := git.AddWorktree(info.Root, worktreeDir, branch); err != nil {
			return err
		}
		runSetupScripts(worktreeDir)
		copyLocalSettings(info.Root, worktreeDir)
	} else {
		logging.Debug("worktree already exists at: %s", worktreeDir)
	}

	// Create tmux window if it doesn't exist
	if tmux.WindowExists(tmuxSession, windowName) {
		logging.Debug("tmux window already exists: %s", windowName)
	} else {
		logging.Info("creating tmux window: %s", windowName)
		if err := tmux.CreateWindow(tmuxSession, windowName, worktreeDir); err != nil {
			return err
		}
		logging.Info("launching Claude Code in tmux window")
		if err := tmux.SendKeys(tmuxSession, windowName, "claude --permission-mode acceptEdits"); err != nil {
			return err
		}
	}

	return nil
}

// Remove removes a workspace: worktree and tmux window.
func Remove(repoRoot, branch string) error {
	info, err := git.RepoInfo(repoRoot)
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
		logging.Debug("worktree does not exist at: %s", worktreeDir)
	} else {
		logging.Info("removing worktree at: %s", worktreeDir)
		if err := git.RemoveWorktree(info.Root, worktreeDir); err != nil {
			return err
		}
	}

	// Close tmux window if it exists
	if !tmux.SessionExists(tmuxSession) {
		logging.Debug("tmux session does not exist: %s", tmuxSession)
		return nil
	}

	actualName := tmux.ActualWindowName(tmuxSession, windowName)
	if actualName != "" {
		logging.Info("closing tmux window: %s", windowName)
		return tmux.KillWindow(tmuxSession, actualName)
	}
	logging.Debug("tmux window does not exist: %s", windowName)
	return nil
}

// Attach attaches to the tmux session for the repository at the given path.
// If branch is non-empty, attaches to the specific window for that branch.
// Works from both the main repo and worktrees.
func Attach(path, branch string) error {
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

	tmuxSession := paths.TmuxSessionName(repoName)

	if !tmux.SessionExists(tmuxSession) {
		if info.IsWorktree {
			return fmt.Errorf("tmux session does not exist: %s. Run 'cco add <branch>' from the main repository first", tmuxSession)
		}
		if err := Init(path); err != nil {
			return err
		}
	}

	if branch != "" {
		windowName := paths.TmuxWindowName(branch)
		if !tmux.WindowExists(tmuxSession, windowName) {
			return fmt.Errorf("tmux window does not exist for branch: %s", branch)
		}
		actualName := tmux.ActualWindowName(tmuxSession, windowName)
		logging.Info("attaching to tmux window: %s:%s", tmuxSession, windowName)
		return tmux.AttachToWindow(tmuxSession, actualName)
	}

	logging.Info("attaching to tmux session: %s", tmuxSession)
	return tmux.Attach(tmuxSession)
}

// Notify adds a bell emoji to the tmux window for the current workspace.
// Designed to be called from hooks -- prints skip reason to stderr and always returns nil.
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
	//   ~/.local/share/cco/worktrees/{repo}/{branch}/
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

	if !tmux.SessionExists(tmuxSession) {
		fmt.Fprintf(os.Stderr, "skipped: tmux session '%s' does not exist\n", tmuxSession)
		return nil
	}

	// The leaf directory is "{repo}-{sanitized_branch}", strip the repo prefix
	windowName := strings.TrimPrefix(leaf, repoName+"-")
	windows, err := tmux.ListWindows(tmuxSession)
	if err != nil {
		fmt.Fprintf(os.Stderr, "skipped: could not list windows for session '%s'\n", tmuxSession)
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
			if tmux.IsActiveWindow(tmuxSession, windowName) {
				fmt.Fprintf(os.Stderr, "skipped: window '%s' is currently active\n", windowName)
				return nil
			}
			logging.Info("adding notification to tmux window: %s", windowName)
			if err := tmux.RenameWindow(tmuxSession, windowName, bellName); err != nil {
				fmt.Fprintf(os.Stderr, "skipped: could not rename tmux window '%s'\n", windowName)
			}
			return nil
		}
	}

	fmt.Fprintf(os.Stderr, "skipped: tmux window '%s' does not exist\n", windowName)
	return nil
}

// runSetupScripts looks for and runs setup scripts in the workspace directory.
func runSetupScripts(worktreeDir string) {
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
		logging.Info("running setup script: %s", scriptPath)
		cmd := exec.Command(scriptPath)
		cmd.Dir = worktreeDir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "warning: setup script %s failed: %v\n", name, err)
		}
		return
	}
	logging.Debug("no setup scripts found")
}

// copyLocalSettings copies .claude/settings.local.json from the main repo to the worktree dir.
func copyLocalSettings(repoRoot, worktreeDir string) {
	src := filepath.Join(repoRoot, ".claude", "settings.local.json")
	dst := filepath.Join(worktreeDir, ".claude", "settings.local.json")

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
