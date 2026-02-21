package lima

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/averycrespi/claudefiles/orchestrator/internal/exec"
)

const VMName = "cco-sandbox"

type instance struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

func parseStatus(data []byte) (string, error) {
	var instances []instance
	if err := json.Unmarshal(data, &instances); err != nil {
		return "", fmt.Errorf("failed to parse limactl output: %s", err)
	}
	if len(instances) == 0 {
		return "", nil
	}
	return instances[0].Status, nil
}

// Client wraps limactl operations with an injectable command runner.
type Client struct {
	runner exec.Runner
}

// NewClient returns a lima Client using the given command runner.
func NewClient(runner exec.Runner) *Client {
	return &Client{runner: runner}
}

// Status returns the VM status: "Running", "Stopped", or "" if not found.
func (c *Client) Status() (string, error) {
	out, err := c.runner.Run("limactl", "list", "--json", VMName)
	if err != nil {
		return "", fmt.Errorf("limactl list failed: %s", strings.TrimSpace(string(out)))
	}
	return parseStatus(out)
}

// Create starts a new VM from a template file path.
func (c *Client) Create(templatePath string) error {
	if err := c.runner.RunInteractive("limactl", "start", "--name="+VMName, templatePath); err != nil {
		return fmt.Errorf("limactl start failed: %s", err)
	}
	return nil
}

// Start boots a stopped VM.
func (c *Client) Start() error {
	if err := c.runner.RunInteractive("limactl", "start", VMName); err != nil {
		return fmt.Errorf("limactl start failed: %s", err)
	}
	return nil
}

// Stop halts a running VM.
func (c *Client) Stop() error {
	if err := c.runner.RunInteractive("limactl", "stop", VMName); err != nil {
		return fmt.Errorf("limactl stop failed: %s", err)
	}
	return nil
}

// Delete removes the VM. Limactl prompts for confirmation interactively.
func (c *Client) Delete() error {
	if err := c.runner.RunInteractive("limactl", "delete", VMName); err != nil {
		return fmt.Errorf("limactl delete failed: %s", err)
	}
	return nil
}

// Copy copies a local file into the VM at the given guest path.
func (c *Client) Copy(localPath, guestPath string) error {
	dest := VMName + ":" + guestPath
	out, err := c.runner.Run("limactl", "cp", localPath, dest)
	if err != nil {
		return fmt.Errorf("limactl cp failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
