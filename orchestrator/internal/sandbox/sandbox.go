package sandbox

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/lima"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
)

// Create creates, starts, and provisions the sandbox VM.
func Create() error {
	status, err := lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "Running":
		logging.Info("Sandbox is already created and running")
		return Provision()
	case "Stopped":
		logging.Info("Sandbox exists but is stopped, starting...")
		if err := lima.Start(); err != nil {
			return err
		}
		return Provision()
	}

	templatePath, err := writeTempFile("cco-lima-*.yaml", limaTemplate)
	if err != nil {
		return fmt.Errorf("failed to write lima template: %w", err)
	}
	defer os.Remove(templatePath)

	if err := lima.Create(templatePath); err != nil {
		return err
	}
	return Provision()
}

// Start starts a stopped sandbox VM.
func Start() error {
	status, err := lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "":
		return fmt.Errorf("sandbox not created, run `cco box create`")
	case "Running":
		logging.Info("Sandbox is already running")
		return nil
	}
	return lima.Start()
}

// Stop stops a running sandbox VM.
func Stop() error {
	status, err := lima.Status()
	if err != nil {
		return err
	}
	switch status {
	case "":
		logging.Info("Sandbox is not created")
		return nil
	case "Stopped":
		logging.Info("Sandbox is already stopped")
		return nil
	}
	return lima.Stop()
}

// Destroy deletes the sandbox VM. Limactl prompts for confirmation.
func Destroy() error {
	status, err := lima.Status()
	if err != nil {
		return err
	}
	if status == "" {
		logging.Info("Sandbox is not created")
		return nil
	}
	return lima.Delete()
}

// Status prints the sandbox VM status.
func Status() error {
	status, err := lima.Status()
	if err != nil {
		return err
	}
	if status == "" {
		fmt.Println("NotCreated")
	} else {
		fmt.Println(status)
	}
	return nil
}

// Provision copies Claude config files into the sandbox VM.
func Provision() error {
	status, err := lima.Status()
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

	if err := lima.Copy(claudeMDPath, "~/.claude/CLAUDE.md"); err != nil {
		return err
	}
	if err := lima.Copy(settingsPath, "~/.claude/settings.json"); err != nil {
		return err
	}

	logging.Info("Provisioned Claude config into sandbox")
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
