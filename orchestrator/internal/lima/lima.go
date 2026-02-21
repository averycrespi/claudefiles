package lima

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
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

// Status returns the VM status: "Running", "Stopped", or "" if not found.
func Status() (string, error) {
	cmd := exec.Command("limactl", "list", "--json", VMName)
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("limactl list failed: %s", strings.TrimSpace(string(out)))
	}
	return parseStatus(out)
}

// Create starts a new VM from a template file path.
func Create(templatePath string) error {
	cmd := exec.Command("limactl", "start", "--name="+VMName, templatePath)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("limactl start failed: %s", err)
	}
	return nil
}

// Start boots a stopped VM.
func Start() error {
	cmd := exec.Command("limactl", "start", VMName)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("limactl start failed: %s", err)
	}
	return nil
}

// Stop halts a running VM.
func Stop() error {
	cmd := exec.Command("limactl", "stop", VMName)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("limactl stop failed: %s", err)
	}
	return nil
}

// Delete removes the VM. Limactl prompts for confirmation interactively.
func Delete() error {
	cmd := exec.Command("limactl", "delete", VMName)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("limactl delete failed: %s", err)
	}
	return nil
}

// Copy copies a local file into the VM at the given guest path.
func Copy(localPath, guestPath string) error {
	dest := VMName + ":" + guestPath
	cmd := exec.Command("limactl", "cp", localPath, dest)
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("limactl cp failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
