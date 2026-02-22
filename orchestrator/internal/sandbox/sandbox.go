package sandbox

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
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
}

// NewService returns a sandbox Service.
func NewService(lima limaClient, logger logging.Logger) *Service {
	return &Service{lima: lima, logger: logger}
}

// Create creates, starts, and provisions the sandbox VM.
func (s *Service) Create() error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "Running":
		s.logger.Info("Sandbox is already created and running")
		return s.Provision()
	case "Stopped":
		s.logger.Info("Sandbox exists but is stopped, starting...")
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
		s.logger.Info("Sandbox is already running")
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
		s.logger.Info("Sandbox is not created")
		return nil
	case "Stopped":
		s.logger.Info("Sandbox is already stopped")
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
		s.logger.Info("Sandbox is not created")
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

	if err := s.lima.Copy(claudeMDPath, "~/.claude/CLAUDE.md"); err != nil {
		return err
	}
	if err := s.lima.Copy(settingsPath, "~/.claude/settings.json"); err != nil {
		return err
	}

	s.logger.Info("Provisioned Claude config into sandbox")
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
