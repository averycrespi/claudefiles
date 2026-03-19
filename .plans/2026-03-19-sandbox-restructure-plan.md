# Sandbox Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Restructure the sandbox from a git-bundle push/pull model to a live-mounted development environment where Claude Code runs directly inside the VM.

**Architecture:** Replace the exchange-based workflow with live mounts at matching host paths. The VM user matches the host user (username, UID, GID, home dir). Config drives which directories get mounted and which files get provisioned. All push/pull, goproxy, and exchange code is removed.

**Tech Stack:** Go, Lima, Cobra, testify

---

### Task 1: Update Config Package (GoProxy → Sandbox)

**Files:**
- Modify: `cco/internal/config/config.go`
- Modify: `cco/internal/config/config_test.go`

**Step 1: Write the failing tests**

Replace the test file contents. The new config has a `Sandbox` field with `Mounts` and `ProvisionPaths` instead of `GoProxy`.

In `cco/internal/config/config_test.go`, replace the entire file:

```go
package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/averycrespi/claudefiles/cco/internal/logging"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_FileNotFound(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	cfg, err := Load()

	require.NoError(t, err)
	assert.Empty(t, cfg.Sandbox.Mounts)
	assert.Empty(t, cfg.Sandbox.ProvisionPaths)
}

func TestLoad_EmptyJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	ccoDir := filepath.Join(dir, "cco")
	require.NoError(t, os.MkdirAll(ccoDir, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(ccoDir, "config.json"), []byte("{}"), 0o644))

	cfg, err := Load()

	require.NoError(t, err)
	assert.Empty(t, cfg.Sandbox.Mounts)
	assert.Empty(t, cfg.Sandbox.ProvisionPaths)
}

func TestLoad_WithSandboxConfig(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	ccoDir := filepath.Join(dir, "cco")
	require.NoError(t, os.MkdirAll(ccoDir, 0o755))
	data := []byte(`{
		"sandbox": {
			"mounts": ["/Users/me/src/work"],
			"provision_paths": ["/Users/me/.claude", "/Users/me/.claude/sandbox/settings.json:/Users/me/.claude/settings.json"]
		}
	}`)
	require.NoError(t, os.WriteFile(filepath.Join(ccoDir, "config.json"), data, 0o644))

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, []string{"/Users/me/src/work"}, cfg.Sandbox.Mounts)
	assert.Equal(t, []string{
		"/Users/me/.claude",
		"/Users/me/.claude/sandbox/settings.json:/Users/me/.claude/settings.json",
	}, cfg.Sandbox.ProvisionPaths)
}

func TestLoad_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	ccoDir := filepath.Join(dir, "cco")
	require.NoError(t, os.MkdirAll(ccoDir, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(ccoDir, "config.json"), []byte("not json"), 0o644))

	_, err := Load()

	assert.Error(t, err)
}

func TestDefault(t *testing.T) {
	cfg := Default()

	assert.Empty(t, cfg.Sandbox.Mounts)
	assert.Empty(t, cfg.Sandbox.ProvisionPaths)
}

func TestInit_CreatesFile(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)

	err := Init(logging.NoopLogger{})

	require.NoError(t, err)
	path := filepath.Join(dir, "cco", "config.json")
	assert.FileExists(t, path)

	cfg, err := Load()
	require.NoError(t, err)
	assert.Empty(t, cfg.Sandbox.Mounts)
}

func TestInit_NoopWhenExists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)

	require.NoError(t, Init(logging.NoopLogger{}))
	require.NoError(t, Init(logging.NoopLogger{}))
}

func TestParseProvisionPath_Plain(t *testing.T) {
	src, dst := ParseProvisionPath("/Users/me/.claude")

	assert.Equal(t, "/Users/me/.claude", src)
	assert.Equal(t, "/Users/me/.claude", dst)
}

func TestParseProvisionPath_Mapped(t *testing.T) {
	src, dst := ParseProvisionPath("/Users/me/.claude/sandbox/settings.json:/Users/me/.claude/settings.json")

	assert.Equal(t, "/Users/me/.claude/sandbox/settings.json", src)
	assert.Equal(t, "/Users/me/.claude/settings.json", dst)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd cco && go test ./internal/config/ -count=1`
Expected: FAIL — `GoProxyConfig` exists but `SandboxConfig`, `ParseProvisionPath` don't

**Step 3: Write minimal implementation**

Replace `cco/internal/config/config.go` entirely:

```go
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"

	"github.com/averycrespi/claudefiles/cco/internal/logging"
	"github.com/averycrespi/claudefiles/cco/internal/paths"
)

// Config represents the cco configuration file.
type Config struct {
	Sandbox SandboxConfig `json:"sandbox"`
}

// SandboxConfig configures the sandbox VM.
type SandboxConfig struct {
	Mounts         []string `json:"mounts"`
	ProvisionPaths []string `json:"provision_paths"`
}

// Default returns a Config populated with default values.
func Default() *Config {
	return &Config{
		Sandbox: SandboxConfig{
			Mounts:         []string{},
			ProvisionPaths: []string{},
		},
	}
}

// Init creates the config file with defaults if it doesn't exist.
// If the file already exists, it does nothing.
func Init(logger logging.Logger) error {
	path := paths.ConfigFilePath()

	if _, err := os.Stat(path); err == nil {
		logger.Info("config file already exists at %s", path)
		return nil
	}

	if err := os.MkdirAll(paths.ConfigDir(), 0o755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(Default(), "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal default config: %w", err)
	}
	data = append(data, '\n')

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	logger.Info("created config file at %s", path)
	return nil
}

// Load reads and parses the config file. Returns a zero-value Config if the file doesn't exist.
func Load() (*Config, error) {
	data, err := os.ReadFile(paths.ConfigFilePath())
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return &Config{}, nil
		}
		return nil, fmt.Errorf("failed to read config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}
	return &cfg, nil
}

// ParseProvisionPath parses a provision path entry.
// Plain paths return (path, path). Mapped paths "src:dst" return (src, dst).
func ParseProvisionPath(entry string) (src, dst string) {
	parts := strings.SplitN(entry, ":", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return entry, entry
}
```

**Step 4: Run tests to verify they pass**

Run: `cd cco && go test ./internal/config/ -count=1`
Expected: PASS

**Step 5: Commit**

```bash
git add cco/internal/config/
git commit -m "refactor(config): replace GoProxy with Sandbox config"
```

---

### Task 2: Delete goproxy Package and Remove golang.org/x/mod

**Files:**
- Delete: `cco/internal/goproxy/goproxy.go`
- Delete: `cco/internal/goproxy/goproxy_test.go`
- Modify: `cco/go.mod`
- Modify: `cco/go.sum`

**Step 1: Delete the goproxy package**

```bash
cd cco && rm -rf internal/goproxy/
```

**Step 2: Remove the golang.org/x/mod dependency**

```bash
cd cco && go mod tidy
```

**Step 3: Verify the build compiles**

Run: `cd cco && go build ./...`
Expected: FAIL — `box_push.go` imports `goproxy` and `config`. This is expected; we'll fix it in Task 6 when we delete `box_push.go`.

Note: The build will fail at this point because `box_push.go` still imports `goproxy`. That's OK — we'll delete `box_push.go` in Task 6. For now, just delete the package files.

**Step 4: Commit**

```bash
git add -A cco/internal/goproxy/ cco/go.mod cco/go.sum
git commit -m "chore: delete goproxy package"
```

---

### Task 3: Remove Exchange Paths and Job ID

**Files:**
- Modify: `cco/internal/paths/paths.go`
- Delete: `cco/internal/sandbox/job.go`
- Delete: `cco/internal/sandbox/job_test.go`

**Step 1: Remove ExchangeDir and JobExchangeDir from paths.go**

In `cco/internal/paths/paths.go`, delete lines 57-66 (the `ExchangeDir` and `JobExchangeDir` functions):

Remove:
```go
// ExchangeDir returns the directory for sandbox bundle exchange.
func ExchangeDir() string {
	return filepath.Join(DataDir(), "exchange")
}

// JobExchangeDir returns the exchange directory for a specific job.
func JobExchangeDir(jobID string) string {
	return filepath.Join(ExchangeDir(), jobID)
}
```

Add a new function for the worktrees base directory:

```go
// WorktreeBaseDir returns the base directory for all worktrees.
func WorktreeBaseDir() string {
	return filepath.Join(DataDir(), "worktrees")
}
```

**Step 2: Delete job.go and job_test.go**

```bash
cd cco && rm internal/sandbox/job.go internal/sandbox/job_test.go
```

**Step 3: Verify paths tests still pass**

Run: `cd cco && go test ./internal/paths/ -count=1`
Expected: PASS

**Step 4: Commit**

```bash
git add cco/internal/paths/paths.go cco/internal/sandbox/job.go cco/internal/sandbox/job_test.go
git commit -m "refactor: remove exchange paths and job ID"
```

---

### Task 4: Convert lima.yaml to Go Template with Dynamic User and Mounts

**Files:**
- Modify: `cco/internal/sandbox/files/lima.yaml`
- Modify: `cco/internal/sandbox/embed.go`
- Create: `cco/internal/sandbox/template.go`
- Create: `cco/internal/sandbox/template_test.go`

**Step 1: Write the failing tests**

Create `cco/internal/sandbox/template_test.go`:

```go
package sandbox

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRenderTemplate_BasicFields(t *testing.T) {
	params := TemplateParams{
		Username: "testuser",
		UID:      1000,
		GID:      1000,
		HomeDir:  "/home/testuser",
		Mounts:   []string{"/home/testuser/src"},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	assert.Contains(t, result, "testuser")
	assert.Contains(t, result, "ubuntu-24.04")
	assert.Contains(t, result, "minimumLimaVersion")
}

func TestRenderTemplate_MountPaths(t *testing.T) {
	params := TemplateParams{
		Username: "testuser",
		UID:      501,
		GID:      20,
		HomeDir:  "/Users/testuser",
		Mounts: []string{
			"/Users/testuser/src/work",
			"/Users/testuser/src/personal",
		},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	assert.Contains(t, result, "/Users/testuser/src/work")
	assert.Contains(t, result, "/Users/testuser/src/personal")
	// Each mount should appear as both location and mountPoint
	assert.Contains(t, result, "location:")
	assert.Contains(t, result, "mountPoint:")
	assert.Contains(t, result, "writable: true")
}

func TestRenderTemplate_UserConfig(t *testing.T) {
	params := TemplateParams{
		Username: "myuser",
		UID:      501,
		GID:      20,
		HomeDir:  "/Users/myuser",
		Mounts:   []string{},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	assert.Contains(t, result, "user: myuser")
	// UID and GID should be in the user section
	assert.Contains(t, result, "uid: 501")
	assert.Contains(t, result, "gid: 20")
	assert.Contains(t, result, "home: /Users/myuser")
}

func TestRenderTemplate_NoWorkspaceDir(t *testing.T) {
	params := TemplateParams{
		Username: "testuser",
		UID:      1000,
		GID:      1000,
		HomeDir:  "/home/testuser",
		Mounts:   []string{},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	// Should NOT contain /workspace references
	assert.NotContains(t, result, "/workspace")
}

func TestRenderTemplate_DockerProvisioning(t *testing.T) {
	params := TemplateParams{
		Username: "testuser",
		UID:      1000,
		GID:      1000,
		HomeDir:  "/home/testuser",
		Mounts:   []string{},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	assert.Contains(t, result, "docker")
	assert.Contains(t, result, "claude")
	// Username should be used in docker group add
	assert.True(t, strings.Contains(result, "usermod -aG docker"))
}
```

**Step 2: Run tests to verify they fail**

Run: `cd cco && go test ./internal/sandbox/ -run TestRenderTemplate -count=1`
Expected: FAIL — `RenderTemplate`, `TemplateParams` don't exist

**Step 3: Update lima.yaml to use Go template syntax**

Replace `cco/internal/sandbox/files/lima.yaml` entirely:

```yaml
minimumLimaVersion: 2.0.0

base:
- template:_images/ubuntu-24.04

cpus: 4
memory: "4GiB"
disk: "100GiB"

user:
  name: {{.Username}}
  uid: {{.UID}}
  gid: {{.GID}}
  home: {{.HomeDir}}

containerd:
  system: false
  user: false

provision:
# Install Docker Engine
- mode: system
  script: |
    #!/bin/bash
    set -eux -o pipefail
    command -v docker >/dev/null 2>&1 && exit 0
    export DEBIAN_FRONTEND=noninteractive
    curl -fsSL https://get.docker.com | sh

# Add user to docker group
- mode: system
  script: |
    #!/bin/bash
    set -eux -o pipefail
    usermod -aG docker "{{.Username}}"

# Install dev tools, Go, asdf, and Claude Code
- mode: user
  script: |
    #!/bin/bash
    set -eux -o pipefail

    export DEBIAN_FRONTEND=noninteractive

    # --- Core dev tools ---
    sudo apt-get update
    sudo apt-get install -y \
      build-essential \
      curl \
      git \
      jq \
      ripgrep \
      unzip \
      wget

    # --- Go ---
    if ! command -v go >/dev/null 2>&1; then
      GO_VERSION="1.24.1"
      curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-arm64.tar.gz" | sudo tar -C /usr/local -xz
    fi
    export PATH="/usr/local/go/bin:$HOME/go/bin:$PATH"

    # --- asdf version manager ---
    go install github.com/asdf-vm/asdf/cmd/asdf@v0.18.0
    export ASDF_DATA_DIR="$HOME/.asdf"
    export PATH="$HOME/go/bin:$ASDF_DATA_DIR/shims:$PATH"

    # Add Go and asdf to shell profile (.profile for login shells, .bashrc for interactive)
    if ! grep -q 'ASDF_DATA_DIR' "$HOME/.profile"; then
      echo 'export PATH="/usr/local/go/bin:$HOME/go/bin:$PATH"' >> "$HOME/.profile"
      echo 'export ASDF_DATA_DIR="$HOME/.asdf"' >> "$HOME/.profile"
      echo 'export PATH="$HOME/.local/bin:$ASDF_DATA_DIR/shims:$PATH"' >> "$HOME/.profile"
    fi

    # --- gopls (Go language server) ---
    go install golang.org/x/tools/gopls@latest

    # --- Claude Code (native install) ---
    curl -fsSL https://claude.ai/install.sh | bash

probes:
- script: |
    #!/bin/bash
    set -eux -o pipefail
    if ! timeout 30s bash -c "until command -v docker >/dev/null 2>&1; do sleep 3; done"; then
      echo >&2 "docker is not installed yet"
      exit 1
    fi
    if ! timeout 30s bash -c "until pgrep dockerd; do sleep 3; done"; then
      echo >&2 "dockerd is not running"
      exit 1
    fi
  hint: See "/var/log/cloud-init-output.log" in the guest

hostResolver:
  enabled: false

mounts:
{{- range .Mounts}}
- location: "{{.}}"
  mountPoint: "{{.}}"
  writable: true
{{- end}}

message: |
  Claude Code sandbox VM is ready.
  Run `limactl shell cco-sandbox` to enter the VM.
```

**Step 4: Write the template rendering code**

Create `cco/internal/sandbox/template.go`:

```go
package sandbox

import (
	"bytes"
	"text/template"
)

// TemplateParams contains the values used to render the lima.yaml template.
type TemplateParams struct {
	Username string
	UID      int
	GID      int
	HomeDir  string
	Mounts   []string
}

// RenderTemplate renders the embedded lima.yaml template with the given parameters.
func RenderTemplate(params TemplateParams) (string, error) {
	tmpl, err := template.New("lima").Parse(string(limaTemplate))
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, params); err != nil {
		return "", err
	}
	return buf.String(), nil
}
```

**Step 5: Update embed.go**

Replace `cco/internal/sandbox/embed.go` — remove the embedded CLAUDE.md, settings.json, and executing-plans skill. Only keep the lima template:

```go
package sandbox

import _ "embed"

//go:embed files/lima.yaml
var limaTemplate []byte
```

**Step 6: Run tests to verify they pass**

Run: `cd cco && go test ./internal/sandbox/ -run TestRenderTemplate -count=1`
Expected: PASS

**Step 7: Commit**

```bash
git add cco/internal/sandbox/
git commit -m "feat: convert lima.yaml to Go template with dynamic user and mounts"
```

---

### Task 5: Rewrite Sandbox Service

**Files:**
- Modify: `cco/internal/sandbox/sandbox.go`
- Modify: `cco/internal/sandbox/sandbox_test.go`
- Delete: `cco/internal/sandbox/files/CLAUDE.md`
- Delete: `cco/internal/sandbox/files/settings.json`
- Delete: `cco/internal/sandbox/files/skills/executing-plans/SKILL.md`

**Step 1: Delete embedded files that are no longer needed**

```bash
rm cco/internal/sandbox/files/CLAUDE.md
rm cco/internal/sandbox/files/settings.json
rm -rf cco/internal/sandbox/files/skills/
```

**Step 2: Write the failing tests**

Replace `cco/internal/sandbox/sandbox_test.go` entirely:

```go
package sandbox

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/averycrespi/claudefiles/cco/internal/logging"
)

// mockLimaClient implements limaClient for tests.
type mockLimaClient struct {
	mock.Mock
}

func (m *mockLimaClient) Status() (string, error) {
	args := m.Called()
	return args.String(0), args.Error(1)
}

func (m *mockLimaClient) Create(templatePath string) error {
	args := m.Called(templatePath)
	return args.Error(0)
}

func (m *mockLimaClient) Start() error {
	args := m.Called()
	return args.Error(0)
}

func (m *mockLimaClient) Stop() error {
	args := m.Called()
	return args.Error(0)
}

func (m *mockLimaClient) Delete() error {
	args := m.Called()
	return args.Error(0)
}

func (m *mockLimaClient) Copy(src, dst string) error {
	args := m.Called(src, dst)
	return args.Error(0)
}

func (m *mockLimaClient) Shell(args ...string) error {
	callArgs := []interface{}{}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	return m.Called(callArgs...).Error(0)
}

// --- Embedded file tests ---

func TestEmbeddedLimaTemplate_NotEmpty(t *testing.T) {
	assert.NotEmpty(t, limaTemplate)
}

func TestEmbeddedLimaTemplate_ContainsExpectedContent(t *testing.T) {
	content := string(limaTemplate)
	assert.Contains(t, content, "minimumLimaVersion")
	assert.Contains(t, content, "ubuntu-24.04")
}

func TestEmbeddedLimaTemplate_ContainsTemplateVars(t *testing.T) {
	content := string(limaTemplate)
	assert.Contains(t, content, "{{.Username}}")
	assert.Contains(t, content, "{{.UID}}")
	assert.Contains(t, content, "{{.GID}}")
	assert.Contains(t, content, "{{.HomeDir}}")
	assert.Contains(t, content, "{{.Mounts}}")
}

// --- Service lifecycle tests ---

func TestService_Start_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Start()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Start_AlreadyRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Start()

	require.NoError(t, err)
}

func TestService_Start_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	lima.On("Start").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Start()

	require.NoError(t, err)
	lima.AssertCalled(t, "Start")
}

func TestService_Stop_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Stop")
}

func TestService_Stop_AlreadyStopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Stop")
}

func TestService_Stop_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Stop").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Stop()

	require.NoError(t, err)
	lima.AssertCalled(t, "Stop")
}

func TestService_Destroy_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Destroy()

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Delete")
}

func TestService_Destroy_Exists(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Delete").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Destroy()

	require.NoError(t, err)
	lima.AssertCalled(t, "Delete")
}

func TestService_Status_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	status, err := svc.StatusString()

	require.NoError(t, err)
	assert.Equal(t, "NotCreated", status)
}

func TestService_Status_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	status, err := svc.StatusString()

	require.NoError(t, err)
	assert.Equal(t, "Running", status)
}

func TestService_Shell_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Shell()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Shell_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Shell()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Shell_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Shell()

	require.NoError(t, err)
	lima.AssertCalled(t, "Shell")
}

func TestService_Shell_WithArgs(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", "ls", "-la").Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Shell("ls", "-la")

	require.NoError(t, err)
	lima.AssertCalled(t, "Shell", "ls", "-la")
}

// --- Provision tests ---

func TestService_Provision_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Provision(config.SandboxConfig{})

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Provision_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Provision(config.SandboxConfig{})

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Provision_Running_NoPaths(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Provision(config.SandboxConfig{})

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Copy", mock.Anything, mock.Anything)
}

func TestService_Provision_Running_WithPaths(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	cfg := config.SandboxConfig{
		ProvisionPaths: []string{
			"/Users/me/.claude",
			"/Users/me/.zshrc",
		},
	}
	err := svc.Provision(cfg)

	require.NoError(t, err)
	// Each provision path triggers a copy
	lima.AssertCalled(t, "Copy", "/Users/me/.claude", "/Users/me/.claude")
	lima.AssertCalled(t, "Copy", "/Users/me/.zshrc", "/Users/me/.zshrc")
}

func TestService_Provision_Running_WithMappedPaths(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)
	lima.On("Copy", mock.Anything, mock.Anything).Return(nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	cfg := config.SandboxConfig{
		ProvisionPaths: []string{
			"/Users/me/.claude/sandbox/settings.json:/Users/me/.claude/settings.json",
		},
	}
	err := svc.Provision(cfg)

	require.NoError(t, err)
	lima.AssertCalled(t, "Copy", "/Users/me/.claude/sandbox/settings.json", "/Users/me/.claude/settings.json")
}

// --- Create tests ---

func TestService_Create_AlreadyRunning(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Create(TemplateParams{Username: "test", UID: 1000, GID: 1000, HomeDir: "/home/test"}, config.SandboxConfig{})

	require.NoError(t, err)
	lima.AssertNotCalled(t, "Create", mock.Anything)
}

func TestService_Create_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil).Once()
	lima.On("Start").Return(nil)
	lima.On("Status").Return("Running", nil)
	svc := NewService(lima, logging.NoopLogger{}, nil)

	err := svc.Create(TemplateParams{Username: "test", UID: 1000, GID: 1000, HomeDir: "/home/test"}, config.SandboxConfig{})

	require.NoError(t, err)
	lima.AssertCalled(t, "Start")
}

// --- Template rendering test ---

func TestService_Template_RendersWithParams(t *testing.T) {
	svc := NewService(nil, logging.NoopLogger{}, nil)

	result, err := svc.Template(TemplateParams{
		Username: "myuser",
		UID:      501,
		GID:      20,
		HomeDir:  "/Users/myuser",
		Mounts:   []string{"/Users/myuser/src"},
	})

	require.NoError(t, err)
	assert.Contains(t, result, "myuser")
	assert.Contains(t, result, "/Users/myuser/src")
	assert.True(t, strings.Contains(result, "writable: true"))
}
```

**Step 3: Run tests to verify they fail**

Run: `cd cco && go test ./internal/sandbox/ -count=1`
Expected: FAIL — Service methods have wrong signatures

**Step 4: Write minimal implementation**

Replace `cco/internal/sandbox/sandbox.go` entirely:

```go
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
```

**Step 5: Run tests to verify they pass**

Run: `cd cco && go test ./internal/sandbox/ -count=1`
Expected: PASS

**Step 6: Commit**

```bash
git add cco/internal/sandbox/
git commit -m "refactor(sandbox): rewrite service for live-mount model"
```

---

### Task 6: Remove Push/Pull CLI Commands, Add Template Command

**Files:**
- Delete: `cco/cmd/box_push.go`
- Delete: `cco/cmd/box_pull.go`
- Modify: `cco/cmd/box_create.go`
- Modify: `cco/cmd/box_provision.go`
- Create: `cco/cmd/box_template.go`
- Modify: `cco/cmd/wire.go`

**Step 1: Delete push and pull commands**

```bash
rm cco/cmd/box_push.go cco/cmd/box_pull.go
```

**Step 2: Update box_create.go to pass params and config**

Replace `cco/cmd/box_create.go`:

```go
package cmd

import (
	"fmt"
	"os/user"
	"strconv"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/averycrespi/claudefiles/cco/internal/paths"
	"github.com/averycrespi/claudefiles/cco/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create, start, and provision the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		params, err := hostTemplateParams()
		if err != nil {
			return err
		}

		cfg, err := config.Load()
		if err != nil {
			return fmt.Errorf("failed to load config: %w", err)
		}

		// Add configured mounts + automatic worktree mount
		params.Mounts = append(cfg.Sandbox.Mounts, paths.WorktreeBaseDir())

		return newSandboxService().Create(params, cfg.Sandbox)
	},
}

func init() { boxCmd.AddCommand(boxCreateCmd) }

// hostTemplateParams returns TemplateParams populated from the current host user.
func hostTemplateParams() (sandbox.TemplateParams, error) {
	u, err := user.Current()
	if err != nil {
		return sandbox.TemplateParams{}, fmt.Errorf("failed to get current user: %w", err)
	}

	uid, err := strconv.Atoi(u.Uid)
	if err != nil {
		return sandbox.TemplateParams{}, fmt.Errorf("failed to parse UID: %w", err)
	}

	gid, err := strconv.Atoi(u.Gid)
	if err != nil {
		return sandbox.TemplateParams{}, fmt.Errorf("failed to parse GID: %w", err)
	}

	return sandbox.TemplateParams{
		Username: u.Username,
		UID:      uid,
		GID:      gid,
		HomeDir:  u.HomeDir,
	}, nil
}
```

**Step 3: Update box_provision.go to load config**

Replace `cco/cmd/box_provision.go`:

```go
package cmd

import (
	"fmt"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/spf13/cobra"
)

var boxProvisionCmd = &cobra.Command{
	Use:   "provision",
	Short: "Provision the sandbox with config and dotfiles",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return fmt.Errorf("failed to load config: %w", err)
		}
		return newSandboxService().Provision(cfg.Sandbox)
	},
}

func init() { boxCmd.AddCommand(boxProvisionCmd) }
```

**Step 4: Create box_template.go**

Create `cco/cmd/box_template.go`:

```go
package cmd

import (
	"fmt"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/averycrespi/claudefiles/cco/internal/paths"
	"github.com/spf13/cobra"
)

var boxTemplateCmd = &cobra.Command{
	Use:   "template",
	Short: "Print the rendered lima.yaml template",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		params, err := hostTemplateParams()
		if err != nil {
			return err
		}

		cfg, err := config.Load()
		if err != nil {
			return fmt.Errorf("failed to load config: %w", err)
		}

		params.Mounts = append(cfg.Sandbox.Mounts, paths.WorktreeBaseDir())

		result, err := newSandboxService().Template(params)
		if err != nil {
			return err
		}
		fmt.Print(result)
		return nil
	},
}

func init() { boxCmd.AddCommand(boxTemplateCmd) }
```

**Step 5: Update wire.go — remove unused imports**

Replace `cco/cmd/wire.go`:

```go
package cmd

import (
	"os"

	ccoexec "github.com/averycrespi/claudefiles/cco/internal/exec"
	"github.com/averycrespi/claudefiles/cco/internal/git"
	"github.com/averycrespi/claudefiles/cco/internal/lima"
	"github.com/averycrespi/claudefiles/cco/internal/logging"
	"github.com/averycrespi/claudefiles/cco/internal/sandbox"
	"github.com/averycrespi/claudefiles/cco/internal/tmux"
	"github.com/averycrespi/claudefiles/cco/internal/workspace"
)

func newWorkspaceService() *workspace.Service {
	runner := ccoexec.NewOSRunner()
	logger := logging.NewStdLogger(verbose)
	tc := tmux.NewClient(runner)
	tc.TmuxEnv = os.Getenv("TMUX")
	return workspace.NewService(
		git.NewClient(runner),
		tc,
		logger,
		runner,
	)
}

func newTmuxClient() *tmux.Client {
	runner := ccoexec.NewOSRunner()
	tc := tmux.NewClient(runner)
	tc.TmuxEnv = os.Getenv("TMUX")
	return tc
}

func newGitClient() *git.Client {
	runner := ccoexec.NewOSRunner()
	return git.NewClient(runner)
}

func newSandboxService() *sandbox.Service {
	runner := ccoexec.NewOSRunner()
	logger := logging.NewStdLogger(verbose)
	return sandbox.NewService(
		lima.NewClient(runner),
		logger,
		runner,
	)
}
```

**Step 6: Run go mod tidy and verify build**

```bash
cd cco && go mod tidy && go build ./...
```

Expected: PASS — all imports resolved, no compilation errors

**Step 7: Run all tests**

Run: `cd cco && go test ./... -count=1`
Expected: PASS

**Step 8: Commit**

```bash
git add cco/cmd/ cco/go.mod cco/go.sum
git commit -m "feat: remove push/pull commands, add template command"
```

---

### Task 7: Create Sandbox Override Files

**Files:**
- Create: `claude/sandbox/settings.json`
- Create: `claude/sandbox/CLAUDE.md`
- Create: `claude/sandbox/scripts/statusline.sh`

**Step 1: Create sandbox settings.json**

Create `claude/sandbox/settings.json`:

```json
{
  "permissions": {
    "allow": [],
    "deny": []
  },
  "hooks": {},
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/scripts/statusline.sh"
  },
  "enabledPlugins": {
    "gopls-lsp@claude-plugins-official": true
  }
}
```

**Step 2: Create sandbox CLAUDE.md**

Create `claude/sandbox/CLAUDE.md`:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when running inside the sandbox VM.

## Sandbox Environment

You are running inside an isolated Linux VM (Ubuntu 24.04). You have full
permissions — install packages, run any commands, use Docker freely. There
are no permission prompts or hooks.

## Conventional Commits

Always use conventional commits when writing commit messages:

**Format:**
```
<type>: <description>

[optional body]
```

**Common Types:**
- `feat` - New feature
- `fix` - Bug fix
- `chore` - Maintenance tasks, dependencies
- `docs` - Documentation changes
- `refactor` - Code restructuring without behavior change
- `test` - Adding/updating tests

**Best Practices:**
- Keep subject line under 50 characters
- Use imperative mood ("add" not "added")
- No period at end of subject
- Separate subject and body with blank line
```

**Step 3: Create sandbox status line script**

Copy the existing `claude/scripts/statusline.sh` and add a sandbox prefix. The only change is in the final output section (around line 153). Create `claude/sandbox/scripts/statusline.sh` — this should be the same as `claude/scripts/statusline.sh` but with a sandbox prefix added to the output.

At the bottom of the script, change the output section (the last ~7 lines) from:

```bash
echo -n "${model_bg}${FG_BLACK}${BOLD} $model ${RESET}"
```

to:

```bash
# Sandbox prefix
BG_PURPLE=$'\033[48;5;141m'
FG_PURPLE=$'\033[38;5;141m'
echo -n "${BG_PURPLE}${FG_BLACK}${BOLD} sandbox ${RESET}"
echo -n "${FG_PURPLE}${model_bg}${SEP}${FG_BLACK}${BOLD} $model ${RESET}"
```

And update the model→blue separator to use `model_fg` (no change needed, this line stays the same):

```bash
echo -n "${model_fg}${BG_BLUE}${SEP}${FG_BLACK}  $dir_name ${RESET}"
```

Create the full file by copying `claude/scripts/statusline.sh` and making the modifications described above to the output section at the bottom.

**Step 4: Run setup.sh to stow the new files**

```bash
./setup.sh
```

Verify the symlinks exist:
```bash
ls -la ~/.claude/sandbox/settings.json
ls -la ~/.claude/sandbox/CLAUDE.md
ls -la ~/.claude/sandbox/scripts/statusline.sh
```

**Step 5: Commit**

```bash
git add claude/sandbox/
git commit -m "feat: add sandbox override files for settings, CLAUDE.md, and status line"
```

---

### Task 8: Remove Sandbox Skill and Update References

**Files:**
- Delete: `claude/skills/executing-plans-in-sandbox/SKILL.md`
- Modify: `claude/settings.json`
- Modify: `claude/skills/writing-plans/SKILL.md`
- Modify: `claude/skills/verifying-work/SKILL.md`

**Step 1: Delete the executing-plans-in-sandbox skill**

```bash
rm -rf claude/skills/executing-plans-in-sandbox/
```

**Step 2: Update settings.json**

In `claude/settings.json`, remove the `Skill(executing-plans-in-sandbox)` permission (line 100) and remove `cco box pull:*` and `cco box push:*` from excluded commands (lines 205-206):

Remove from permissions.allow:
```
"Skill(executing-plans-in-sandbox)",
```

Remove from sandbox.excludedCommands:
```
"cco box pull:*",
"cco box push:*",
```

**Step 3: Update writing-plans skill**

In `claude/skills/writing-plans/SKILL.md`, remove the "Execute in sandbox" option from the AskUserQuestion (line 120) and remove the corresponding handler section (lines 139-142).

Remove from the options array:
```
      { label: "Execute in sandbox", description: "Runs autonomously in a sandbox VM - doesn't block the host" },
```

Remove the handler section:
```
**Execute in sandbox:**
- **REQUIRED SUB-SKILL:** Use Skill(executing-plans-in-sandbox)
- Pushes plan to sandbox VM, waits for results, reintegrates
- Best for autonomous work where you don't want to block the host
```

**Step 4: Update verifying-work skill**

In `claude/skills/verifying-work/SKILL.md`, remove the line referencing executing-plans-in-sandbox (line 230):

Remove:
```
- **executing-plans-in-sandbox** — Calls this skill after sandbox results are pulled
```

**Step 5: Run setup.sh to apply stow changes**

```bash
./setup.sh
```

**Step 6: Commit**

```bash
git add claude/skills/ claude/settings.json
git commit -m "chore: remove executing-plans-in-sandbox skill and references"
```

---

### Task 9: Update Documentation

**Files:**
- Modify: `docs/skills.md`
- Modify: `docs/claude-code-config.md`
- Modify: `cco/CLAUDE.md`

**Step 1: Update docs/skills.md**

Remove the `executing-plans-in-sandbox` row from the Structured Development Workflow table (line 11):

Remove:
```
| `executing-plans-in-sandbox` | Execute plans autonomously in a sandbox VM                                  |
```

**Step 2: Update docs/claude-code-config.md**

Add the `sandbox/` directory to the directory structure:

Change the directory tree to include `sandbox/`:

```
claude/
├── CLAUDE.md           # Global instructions for all projects
├── settings.json       # Permissions and hooks
├── agents/             # Custom agent definitions
├── commands/           # Slash command definitions
├── hooks/              # PreToolUse hooks (e.g., gitleaks)
├── sandbox/            # Sandbox VM overrides (settings, CLAUDE.md, scripts)
├── scripts/            # Status line and other scripts
└── skills/             # Custom skill definitions
```

**Step 3: Update cco/CLAUDE.md**

Update the `internal/sandbox` package description and remove `internal/goproxy` from the packages table.

In the Packages table:

Change:
```
| `internal/sandbox` | Lima VM lifecycle and push/pull |
```
To:
```
| `internal/sandbox` | Lima VM lifecycle and provisioning |
```

Remove:
```
| `internal/goproxy` | Go module caching for sandbox |
```

**Step 4: Commit**

```bash
git add docs/ cco/CLAUDE.md
git commit -m "docs: update documentation for sandbox restructure"
```
