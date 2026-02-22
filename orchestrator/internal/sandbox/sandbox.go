package sandbox

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
)

// limaClient defines the lima operations needed by the sandbox service.
type limaClient interface {
	Status() (string, error)
	Create(templatePath string) error
	Start() error
	Stop() error
	Delete() error
	Copy(src, dst string) error
	Shell(args ...string) error
}

// Service manages the sandbox VM lifecycle.
type Service struct {
	lima   limaClient
	logger logging.Logger
	runner exec.Runner
}

// NewService returns a sandbox Service.
func NewService(lima limaClient, logger logging.Logger, runner exec.Runner) *Service {
	return &Service{lima: lima, logger: logger, runner: runner}
}

// Create creates, starts, and provisions the sandbox VM.
func (s *Service) Create() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "Running":
		s.logger.Info("sandbox is already created and running")
		return s.Provision()
	case "Stopped":
		s.logger.Info("sandbox exists but is stopped, starting...")
		if err := s.lima.Start(); err != nil {
			return err
		}
		return s.Provision()
	}

	templatePath, err := writeTempFile("cco-lima-*.yaml", limaTemplate)
	if err != nil {
		return fmt.Errorf("failed to write lima template: %w", err)
	}
	defer os.Remove(templatePath)

	if err := s.lima.Create(templatePath); err != nil {
		return err
	}
	return s.Provision()
}

// Start starts a stopped sandbox VM.
func (s *Service) Start() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "":
		return fmt.Errorf("sandbox not created, run `cco box create`")
	case "Running":
		s.logger.Info("sandbox is already running")
		return nil
	}
	return s.lima.Start()
}

// Stop stops a running sandbox VM.
func (s *Service) Stop() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "":
		s.logger.Info("sandbox is not created")
		return nil
	case "Stopped":
		s.logger.Info("sandbox is already stopped")
		return nil
	}
	return s.lima.Stop()
}

// Destroy deletes the sandbox VM. Limactl prompts for confirmation.
func (s *Service) Destroy() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	if status == "" {
		s.logger.Info("sandbox is not created")
		return nil
	}
	return s.lima.Delete()
}

// StatusString returns the sandbox VM status as a display string.
func (s *Service) StatusString() (string, error) {
	status, err := s.lima.Status()
	if err != nil {
		return "", err
	}
	if status == "" {
		return "NotCreated", nil
	}
	return status, nil
}

// Status prints the sandbox VM status to stdout.
func (s *Service) Status() error {
	status, err := s.StatusString()
	if err != nil {
		return err
	}
	fmt.Println(status)
	return nil
}

// Provision copies Claude config files into the sandbox VM.
func (s *Service) Provision() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "":
		return fmt.Errorf("sandbox not created, run `cco box create`")
	case "Stopped":
		return fmt.Errorf("sandbox not running, run `cco box start`")
	}

	claudeMDPath, err := writeTempFile("cco-claude-md-*", claudeMD)
	if err != nil {
		return fmt.Errorf("failed to write CLAUDE.md: %w", err)
	}
	defer os.Remove(claudeMDPath)

	settingsPath, err := writeTempFile("cco-settings-*.json", settingsJSON)
	if err != nil {
		return fmt.Errorf("failed to write settings.json: %w", err)
	}
	defer os.Remove(settingsPath)

	skillPath, err := writeTempFile("cco-executing-plans-in-sandbox-*.md", executingPlansInSandboxSkill)
	if err != nil {
		return fmt.Errorf("failed to write executing-plans-in-sandbox.md: %w", err)
	}
	defer os.Remove(skillPath)

	if err := s.lima.Copy(claudeMDPath, "~/.claude/CLAUDE.md"); err != nil {
		return err
	}
	if err := s.lima.Copy(settingsPath, "~/.claude/settings.json"); err != nil {
		return err
	}

	// Ensure skill directory exists in VM (skills must be <name>/SKILL.md)
	if err := s.lima.Shell("--", "bash", "-c", "mkdir -p $HOME/.claude/skills/executing-plans-in-sandbox"); err != nil {
		return fmt.Errorf("failed to create skills directory: %w", err)
	}
	if err := s.lima.Copy(skillPath, "~/.claude/skills/executing-plans-in-sandbox/SKILL.md"); err != nil {
		return err
	}

	s.logger.Info("provisioned config into sandbox")
	return nil
}

// Shell opens an interactive shell or runs a command in the sandbox VM.
func (s *Service) Shell(args ...string) error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "":
		return fmt.Errorf("sandbox not created, run `cco box create`")
	case "Stopped":
		return fmt.Errorf("sandbox not running, run `cco box start`")
	}
	return s.lima.Shell(args...)
}

// Push bundles the current branch, clones it in the VM, and launches Claude.
func (s *Service) Push(repoRoot, planPath string) (string, error) {
	status, err := s.lima.Status()
	if err != nil {
		return "", err
	}
	switch status {
	case "":
		return "", fmt.Errorf("sandbox not created, run `cco box create`")
	case "Stopped":
		return "", fmt.Errorf("sandbox not running, run `cco box start`")
	}

	// Get current branch
	out, err := s.runner.RunDir(repoRoot, "git", "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", fmt.Errorf("failed to get current branch: %w", err)
	}
	branch := strings.TrimSpace(string(out))

	// Generate session ID and create exchange directory
	sessionID := NewSessionID()
	exchangeDir := paths.SessionExchangeDir(sessionID)
	if err := os.MkdirAll(exchangeDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create exchange directory: %w", err)
	}

	// Create git bundle
	bundlePath := filepath.Join(exchangeDir, "input.bundle")
	s.logger.Info("creating bundle for branch %s...", branch)
	if out, err := s.runner.RunDir(repoRoot, "git", "bundle", "create", bundlePath, branch); err != nil {
		return "", fmt.Errorf("git bundle create failed: %s", strings.TrimSpace(string(out)))
	}

	// Clone from bundle inside VM
	guestWorkspace := "/workspace/" + sessionID
	s.logger.Info("cloning into sandbox workspace %s...", guestWorkspace)
	if err := s.lima.Shell("--", "git", "clone", "/exchange/"+sessionID+"/input.bundle", guestWorkspace); err != nil {
		return "", fmt.Errorf("git clone in sandbox failed: %w", err)
	}

	// Launch Claude interactively
	s.logger.Info("launching claude in sandbox (session %s)...", sessionID)
	prompt := fmt.Sprintf("/executing-plans-in-sandbox %s", planPath)
	if err := s.lima.Shell("--", "bash", "-c",
		fmt.Sprintf("cd %s && claude --dangerously-skip-permissions %q", guestWorkspace, prompt)); err != nil {
		return sessionID, fmt.Errorf("claude exited with error: %w", err)
	}

	return sessionID, nil
}

// Pull polls for an output bundle and fast-forward merges it into the current branch.
func (s *Service) Pull(repoRoot, sessionID string, timeout, interval time.Duration) error {
	exchangeDir := paths.SessionExchangeDir(sessionID)
	bundlePath := filepath.Join(exchangeDir, "output.bundle")

	s.logger.Info("waiting for output bundle (session %s)...", sessionID)

	deadline := time.Now().Add(timeout)
	for {
		if _, err := os.Stat(bundlePath); err == nil {
			break
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out waiting for output bundle at %s", bundlePath)
		}
		time.Sleep(interval)
	}

	s.logger.Info("bundle found, verifying...")
	if out, err := s.runner.RunDir(repoRoot, "git", "bundle", "verify", bundlePath); err != nil {
		return fmt.Errorf("bundle verification failed: %s", strings.TrimSpace(string(out)))
	}

	s.logger.Info("fetching from bundle...")
	if out, err := s.runner.RunDir(repoRoot, "git", "fetch", bundlePath); err != nil {
		return fmt.Errorf("git fetch from bundle failed: %s", strings.TrimSpace(string(out)))
	}

	s.logger.Info("fast-forward merging...")
	if out, err := s.runner.RunDir(repoRoot, "git", "merge", "--ff-only", "FETCH_HEAD"); err != nil {
		return fmt.Errorf("fast-forward merge failed (branches may have diverged): %s", strings.TrimSpace(string(out)))
	}

	// Clean up exchange directory
	if err := os.RemoveAll(exchangeDir); err != nil {
		s.logger.Info("warning: failed to clean up exchange directory: %s", err)
	}

	s.logger.Info("pull complete for session %s", sessionID)
	return nil
}

func writeTempFile(pattern string, data []byte) (string, error) {
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", err
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}
