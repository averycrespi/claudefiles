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
			s.logger.Warn("setup script %s failed: %v", name, err)
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
		logger.Warn("could not create .claude dir: %v", err)
		return
	}
	dstFile, err := os.Create(dst)
	if err != nil {
		logger.Warn("could not create settings file: %v", err)
		return
	}
	defer dstFile.Close()
	io.Copy(dstFile, srcFile)
}
