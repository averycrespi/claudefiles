# cco box Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add `cco box` subcommands to manage the Lima sandbox VM lifecycle from the orchestrator CLI.

**Architecture:** New `internal/lima` package wraps `limactl` (same pattern as `internal/git` and `internal/tmux`). New `internal/sandbox` package coordinates lima operations and manages embedded template/config files. Cobra subcommands in `cmd/box_*.go` delegate to `internal/sandbox`.

**Tech Stack:** Go 1.23, Cobra, `go:embed`, `limactl` CLI

---

### Task 1: Move sandbox files into orchestrator for embedding

**Files:**
- Create: `orchestrator/internal/sandbox/files/lima.yaml`
- Create: `orchestrator/internal/sandbox/files/CLAUDE.md`
- Create: `orchestrator/internal/sandbox/files/settings.json`
- Delete: `sandbox/lima.yaml`
- Delete: `sandbox/claude/CLAUDE.md`
- Delete: `sandbox/claude/settings.json`
- Delete: `sandbox/` directory

**Step 1: Create the files directory and copy files**

```bash
mkdir -p orchestrator/internal/sandbox/files
cp sandbox/lima.yaml orchestrator/internal/sandbox/files/lima.yaml
cp sandbox/claude/CLAUDE.md orchestrator/internal/sandbox/files/CLAUDE.md
cp sandbox/claude/settings.json orchestrator/internal/sandbox/files/settings.json
```

**Step 2: Update the lima.yaml message to reference the new VM name**

In `orchestrator/internal/sandbox/files/lima.yaml`, change the `message:` section at the bottom:

```yaml
message: |
  Claude Code sandbox VM is ready.
  Run `limactl shell cco-sandbox` to enter the VM.
```

(Changed `claude-sandbox` to `cco-sandbox` to match the new VM name constant.)

**Step 3: Remove the old sandbox directory**

```bash
rm -rf sandbox/
```

**Step 4: Commit**

```bash
git add orchestrator/internal/sandbox/files/ sandbox/
git commit -m "refactor: move sandbox files into orchestrator for embedding"
```

---

### Task 2: Create `internal/lima` package — limactl wrapper

**Files:**
- Create: `orchestrator/internal/lima/lima.go`

**Step 1: Write the failing test**

Create `orchestrator/internal/lima/lima_test.go`:

```go
package lima

import (
	"testing"
)

func TestParseStatus_Running(t *testing.T) {
	status, err := parseStatus([]byte(`[{"name":"cco-sandbox","status":"Running"}]`))
	if err != nil {
		t.Fatalf("parseStatus() error: %v", err)
	}
	if status != "Running" {
		t.Errorf("status = %q, want %q", status, "Running")
	}
}

func TestParseStatus_Stopped(t *testing.T) {
	status, err := parseStatus([]byte(`[{"name":"cco-sandbox","status":"Stopped"}]`))
	if err != nil {
		t.Fatalf("parseStatus() error: %v", err)
	}
	if status != "Stopped" {
		t.Errorf("status = %q, want %q", status, "Stopped")
	}
}

func TestParseStatus_NotFound(t *testing.T) {
	status, err := parseStatus([]byte(`[]`))
	if err != nil {
		t.Fatalf("parseStatus() error: %v", err)
	}
	if status != "" {
		t.Errorf("status = %q, want empty string", status)
	}
}

func TestParseStatus_InvalidJSON(t *testing.T) {
	_, err := parseStatus([]byte(`not json`))
	if err == nil {
		t.Fatal("parseStatus() expected error for invalid JSON")
	}
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/lima/ -count=1 -v`
Expected: FAIL — `parseStatus` not defined

**Step 3: Write the implementation**

Create `orchestrator/internal/lima/lima.go`:

```go
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
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("limactl cp failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/lima/ -count=1 -v`
Expected: PASS — all 4 tests pass

**Step 5: Commit**

```bash
git add orchestrator/internal/lima/
git commit -m "feat: add internal/lima package wrapping limactl"
```

---

### Task 3: Create `internal/sandbox` package — embed and coordinator

**Files:**
- Create: `orchestrator/internal/sandbox/embed.go`
- Create: `orchestrator/internal/sandbox/sandbox.go`

**Step 1: Write the failing test**

Create `orchestrator/internal/sandbox/sandbox_test.go`:

```go
package sandbox

import (
	"testing"
)

func TestEmbeddedFiles_NotEmpty(t *testing.T) {
	if len(limaTemplate) == 0 {
		t.Error("limaTemplate is empty")
	}
	if len(claudeMD) == 0 {
		t.Error("claudeMD is empty")
	}
	if len(settingsJSON) == 0 {
		t.Error("settingsJSON is empty")
	}
}

func TestEmbeddedLimaTemplate_ContainsExpectedContent(t *testing.T) {
	content := string(limaTemplate)
	if !contains(content, "minimumLimaVersion") {
		t.Error("limaTemplate missing minimumLimaVersion")
	}
	if !contains(content, "ubuntu-24.04") {
		t.Error("limaTemplate missing ubuntu-24.04")
	}
}

func TestEmbeddedSettingsJSON_ValidJSON(t *testing.T) {
	content := string(settingsJSON)
	if !contains(content, "permissions") {
		t.Error("settingsJSON missing permissions key")
	}
}

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && stringContains(s, substr)
}

func stringContains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
```

**Step 2: Run test to verify it fails**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -v`
Expected: FAIL — `limaTemplate` not defined

**Step 3: Write embed.go**

Create `orchestrator/internal/sandbox/embed.go`:

```go
package sandbox

import _ "embed"

//go:embed files/lima.yaml
var limaTemplate []byte

//go:embed files/CLAUDE.md
var claudeMD []byte

//go:embed files/settings.json
var settingsJSON []byte
```

**Step 4: Run embed tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -v -run TestEmbedded`
Expected: PASS

**Step 5: Write sandbox.go — the coordinator**

Create `orchestrator/internal/sandbox/sandbox.go`:

```go
package sandbox

import (
	"fmt"
	"os"
	"path/filepath"

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
	dir := os.TempDir()
	path := filepath.Join(dir, pattern)
	f, err := os.CreateTemp(dir, pattern)
	if err != nil {
		return "", err
	}
	_ = path // unused, just for clarity
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
```

**Step 6: Run all sandbox tests**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -v`
Expected: PASS

**Step 7: Commit**

```bash
git add orchestrator/internal/sandbox/
git commit -m "feat: add internal/sandbox package with embed and coordinator"
```

---

### Task 4: Create `cco box` Cobra commands

**Files:**
- Create: `orchestrator/cmd/box.go`
- Create: `orchestrator/cmd/box_create.go`
- Create: `orchestrator/cmd/box_start.go`
- Create: `orchestrator/cmd/box_stop.go`
- Create: `orchestrator/cmd/box_destroy.go`
- Create: `orchestrator/cmd/box_status.go`
- Create: `orchestrator/cmd/box_provision.go`

**Step 1: Create the parent command**

Create `orchestrator/cmd/box.go`:

```go
package cmd

import (
	"github.com/spf13/cobra"
)

var boxCmd = &cobra.Command{
	Use:   "box",
	Short: "Manage the Lima sandbox VM",
}

func init() {
	rootCmd.AddCommand(boxCmd)
}
```

**Step 2: Create each subcommand**

Create `orchestrator/cmd/box_create.go`:

```go
package cmd

import (
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create, start, and provision the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return sandbox.Create()
	},
}

func init() {
	boxCmd.AddCommand(boxCreateCmd)
}
```

Create `orchestrator/cmd/box_start.go`:

```go
package cmd

import (
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return sandbox.Start()
	},
}

func init() {
	boxCmd.AddCommand(boxStartCmd)
}
```

Create `orchestrator/cmd/box_stop.go`:

```go
package cmd

import (
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return sandbox.Stop()
	},
}

func init() {
	boxCmd.AddCommand(boxStopCmd)
}
```

Create `orchestrator/cmd/box_destroy.go`:

```go
package cmd

import (
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxDestroyCmd = &cobra.Command{
	Use:   "destroy",
	Short: "Delete the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return sandbox.Destroy()
	},
}

func init() {
	boxCmd.AddCommand(boxDestroyCmd)
}
```

Create `orchestrator/cmd/box_status.go`:

```go
package cmd

import (
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show the sandbox VM status",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return sandbox.Status()
	},
}

func init() {
	boxCmd.AddCommand(boxStatusCmd)
}
```

Create `orchestrator/cmd/box_provision.go`:

```go
package cmd

import (
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxProvisionCmd = &cobra.Command{
	Use:   "provision",
	Short: "Copy Claude config files into the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return sandbox.Provision()
	},
}

func init() {
	boxCmd.AddCommand(boxProvisionCmd)
}
```

**Step 3: Verify the project compiles**

Run: `cd orchestrator && go build ./...`
Expected: Build succeeds with no errors

**Step 4: Verify the commands appear in help**

Run: `cd orchestrator && go run ./cmd/cco box --help`
Expected: Shows all 6 subcommands (create, start, stop, destroy, status, provision)

**Step 5: Commit**

```bash
git add orchestrator/cmd/box*.go
git commit -m "feat: add cco box commands for sandbox lifecycle"
```

---

### Task 5: Run all tests and verify

**Files:**
- No new files

**Step 1: Run all unit tests**

Run: `cd orchestrator && go test ./... -count=1 -v`
Expected: All tests pass, including existing git/tmux/paths/workspace tests and new lima/sandbox tests

**Step 2: Run vet and build**

Run: `cd orchestrator && go vet ./... && go build ./cmd/cco`
Expected: No issues

**Step 3: Commit (if any fixes needed)**

Only commit if test failures required fixes.

---

### Task 6: Update documentation

**Files:**
- Modify: `README.md:98-116` (Repository Structure section)
- Modify: `README.md:164-195` (Lima Sandbox section)
- Modify: `CLAUDE.md:98-116` (Repository Structure section)
- Modify: `orchestrator/README.md:7-13` (Commands table)
- Modify: `orchestrator/README.md:46-58` (Architecture section)

**Step 1: Update the root README.md — Repository Structure**

In `README.md`, replace the Repository Structure in `CLAUDE.md` lines 98-116. The `sandbox/` directory is gone; note it moved into the orchestrator:

```
orchestrator/            # cco - Claude Code orchestrator (Go)
├── internal/
│   ├── sandbox/         # Lima sandbox lifecycle + embedded VM template
│   │   └── files/       # Embedded: lima.yaml, CLAUDE.md, settings.json
│   └── ...
```

Remove the old `sandbox/` entry.

**Step 2: Update the root README.md — Lima Sandbox section**

Replace the Lima Sandbox section (lines 164-195) with commands using `cco box`:

```markdown
## Lima Sandbox

Run Claude Code inside an isolated Linux VM for safe plan execution.

**Requirements:**
- [Lima](https://github.com/lima-vm/lima) (`brew install lima`)

**Create the VM (first time only):**

```sh
cco box create
```

**Check status:**

```sh
cco box status
```

**Enter the VM:**

```sh
limactl shell cco-sandbox
```

**Authenticate Claude Code (first time only):**

```sh
claude --dangerously-skip-permissions
```

**Stop / start the VM:**

```sh
cco box stop
cco box start
```

**Re-provision configs after updating:**

```sh
cco box provision
```

**Delete the VM:**

```sh
cco box destroy
```

The VM is persistent — data and installed packages survive restarts. The first boot takes several minutes to install Docker, language runtimes, and dev tools. Subsequent starts are fast.
```

**Step 3: Update CLAUDE.md — Repository Structure**

In `CLAUDE.md`, update the Repository Structure section (lines 98-116) to remove the `sandbox/` entry and note the new location inside `orchestrator/`.

**Step 4: Update orchestrator/README.md — Commands table**

Add a new row to the commands table:

```markdown
| `cco box <cmd>`       | Manage the Lima sandbox VM (create, start, stop, destroy, status, provision) |
```

**Step 5: Update orchestrator/README.md — Architecture section**

Add the new packages to the architecture tree:

```
internal/
├── lima/              # limactl wrapper: VM lifecycle operations
├── sandbox/           # Sandbox coordinator (composes lima + embedded files)
│   └── files/         # Embedded VM template and Claude configs
├── git/               # Git operations: repo detection, worktree add/remove
├── tmux/              # tmux operations: sessions, windows, send-keys
├── workspace/         # High-level workspace lifecycle (composes git + tmux)
├── paths/             # Storage paths and naming conventions
└── logging/           # Verbose/debug logging
```

**Step 6: Commit**

```bash
git add README.md CLAUDE.md orchestrator/README.md
git commit -m "docs: update documentation for cco box commands"
```
