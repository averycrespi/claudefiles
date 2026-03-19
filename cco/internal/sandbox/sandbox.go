package sandbox

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/averycrespi/claudefiles/cco/internal/exec"
	"github.com/averycrespi/claudefiles/cco/internal/logging"
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
func (s *Service) Create(params TemplateParams, cfg config.SandboxConfig) error {
	status, err := s.lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "Running":
		s.logger.Info("sandbox is already created and running")
		return s.Provision(cfg)
	case "Stopped":
		s.logger.Info("sandbox exists but is stopped, starting...")
		if err := s.lima.Start(); err != nil {
			return err
		}
		return s.Provision(cfg)
	}

	rendered, err := RenderTemplate(params)
	if err != nil {
		return fmt.Errorf("failed to render lima template: %w", err)
	}

	templatePath, err := writeTempFile("cco-lima-*.yaml", []byte(rendered))
	if err != nil {
		return fmt.Errorf("failed to write lima template: %w", err)
	}
	defer os.Remove(templatePath)

	if err := s.lima.Create(templatePath); err != nil {
		return err
	}
	return s.Provision(cfg)
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

// Provision copies config files into the sandbox VM based on provision paths.
func (s *Service) Provision(cfg config.SandboxConfig) error {
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

	for _, entry := range cfg.ProvisionPaths {
		src, dst := config.ParseProvisionPath(entry)

		// Ensure parent directory exists in VM
		dstDir := filepath.Dir(dst)
		if err := s.lima.Shell("--", "bash", "-c", fmt.Sprintf("mkdir -p %s", dstDir)); err != nil {
			return fmt.Errorf("failed to create directory %s in VM: %w", dstDir, err)
		}

		if err := s.lima.Copy(src, dst); err != nil {
			return fmt.Errorf("failed to copy %s to %s: %w", src, dst, err)
		}
		s.logger.Info("provisioned %s → %s", src, dst)
	}

	s.logger.Info("provisioning complete")
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

// Template renders the lima.yaml template with the given parameters and returns it.
func (s *Service) Template(params TemplateParams) (string, error) {
	return RenderTemplate(params)
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
