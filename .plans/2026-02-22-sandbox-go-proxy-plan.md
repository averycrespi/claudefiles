# Sandbox Go Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Enable Go projects in the sandbox VM to resolve dependencies that match configured patterns by pre-caching them on the host via a file-system based Go module proxy.

**Architecture:** A `config` package handles loading `~/.config/cco/config.json`. A `goproxy` package scans worktrees for matching Go dependencies and downloads them to the exchange directory. The sandbox `Prepare()` method injects `GOPROXY` and `GONOSUMCHECK` env vars into the launch command. Three new `cco config` CLI commands manage the config file.

**Tech Stack:** Go stdlib (`encoding/json`, `os`, `path/filepath`, `os/exec`), cobra for CLI, `golang.org/x/mod/modfile` for parsing go.mod files.

---

### Task 1: Config Package — Path Helpers

**Files:**
- Modify: `orchestrator/internal/paths/paths.go:42-50`
- Modify: `orchestrator/internal/paths/paths_test.go:71-81`

**Step 1: Write the failing tests**

Add to `orchestrator/internal/paths/paths_test.go`:

```go
func TestConfigDir_Default(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "")
	dir := ConfigDir()
	home, _ := os.UserHomeDir()
	expected := filepath.Join(home, ".config", "cco")
	assert.Equal(t, expected, dir)
}

func TestConfigDir_XDG(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "/custom/config")
	dir := ConfigDir()
	assert.Equal(t, "/custom/config/cco", dir)
}

func TestConfigFilePath(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "/custom/config")
	path := ConfigFilePath()
	assert.Equal(t, "/custom/config/cco/config.json", path)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/paths/ -run "TestConfigDir|TestConfigFilePath" -v -count=1`
Expected: FAIL — `ConfigDir` and `ConfigFilePath` are undefined.

**Step 3: Write minimal implementation**

Add to `orchestrator/internal/paths/paths.go`:

```go
// ConfigDir returns the cco config directory.
// Uses $XDG_CONFIG_HOME/cco or defaults to ~/.config/cco.
func ConfigDir() string {
	base := os.Getenv("XDG_CONFIG_HOME")
	if base == "" {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "cco")
}

// ConfigFilePath returns the path to the cco config file.
func ConfigFilePath() string {
	return filepath.Join(ConfigDir(), "config.json")
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/paths/ -v -count=1`
Expected: All PASS.

**Step 5: Commit**

```bash
git add orchestrator/internal/paths/paths.go orchestrator/internal/paths/paths_test.go
git commit -m "feat: add config path helpers"
```

---

### Task 2: Config Package — Loading and Parsing

**Files:**
- Create: `orchestrator/internal/config/config.go`
- Create: `orchestrator/internal/config/config_test.go`

**Step 1: Write the failing tests**

Create `orchestrator/internal/config/config_test.go`:

```go
package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_FileNotFound(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	cfg, err := Load()
	require.NoError(t, err)
	assert.Empty(t, cfg.GoProxy.Patterns)
}

func TestLoad_EmptyJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "cco"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "cco", "config.json"), []byte("{}"), 0o644))

	cfg, err := Load()
	require.NoError(t, err)
	assert.Empty(t, cfg.GoProxy.Patterns)
}

func TestLoad_WithPatterns(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "cco"), 0o755))
	data := []byte(`{"go_proxy": {"patterns": ["github.com/myorg/*", "github.com/other/*"]}}`)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "cco", "config.json"), data, 0o644))

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, []string{"github.com/myorg/*", "github.com/other/*"}, cfg.GoProxy.Patterns)
}

func TestLoad_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "cco"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "cco", "config.json"), []byte("not json"), 0o644))

	_, err := Load()
	assert.Error(t, err)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/config/ -v -count=1`
Expected: FAIL — package doesn't exist.

**Step 3: Write minimal implementation**

Create `orchestrator/internal/config/config.go`:

```go
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
)

// Config represents the cco configuration file.
type Config struct {
	GoProxy GoProxyConfig `json:"go_proxy"`
}

// GoProxyConfig configures the file-system Go module proxy for sandbox jobs.
type GoProxyConfig struct {
	Patterns []string `json:"patterns"`
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
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/config/ -v -count=1`
Expected: All PASS.

**Step 5: Commit**

```bash
git add orchestrator/internal/config/config.go orchestrator/internal/config/config_test.go
git commit -m "feat: add config loading and parsing"
```

---

### Task 3: Config CLI Commands

**Files:**
- Create: `orchestrator/cmd/config.go`

This task has no tests because the commands are thin wrappers around `fmt.Println`, `os.ReadFile`, and `os/exec` — testing would just be testing stdlib.

**Step 1: Write implementation**

Create `orchestrator/cmd/config.go`:

```go
package cmd

import (
	"fmt"
	"os"
	osexec "os/exec"

	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage cco configuration",
}

var configPathCmd = &cobra.Command{
	Use:   "path",
	Short: "Print config file path",
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println(paths.ConfigFilePath())
	},
}

var configShowCmd = &cobra.Command{
	Use:   "show",
	Short: "Print config file contents",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		path := paths.ConfigFilePath()
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				fmt.Printf("No config file found at %s\n", path)
				return nil
			}
			return err
		}
		fmt.Print(string(data))
		return nil
	},
}

var configEditCmd = &cobra.Command{
	Use:   "edit",
	Short: "Open config file in $EDITOR",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		path := paths.ConfigFilePath()

		// Create file with empty JSON object if it doesn't exist
		if _, err := os.Stat(path); os.IsNotExist(err) {
			if err := os.MkdirAll(paths.ConfigDir(), 0o755); err != nil {
				return fmt.Errorf("failed to create config directory: %w", err)
			}
			if err := os.WriteFile(path, []byte("{}\n"), 0o644); err != nil {
				return fmt.Errorf("failed to create config file: %w", err)
			}
		}

		editor := os.Getenv("EDITOR")
		if editor == "" {
			editor = "vi"
		}
		c := osexec.Command(editor, path)
		c.Stdin = os.Stdin
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr
		return c.Run()
	},
}

func init() {
	configCmd.AddCommand(configPathCmd, configShowCmd, configEditCmd)
	rootCmd.AddCommand(configCmd)
}
```

**Step 2: Verify it compiles**

Run: `cd orchestrator && go build ./...`
Expected: Success, no errors.

**Step 3: Commit**

```bash
git add orchestrator/cmd/config.go
git commit -m "feat: add cco config path/show/edit commands"
```

---

### Task 4: Go Proxy Package — Scan and Download

**Files:**
- Create: `orchestrator/internal/goproxy/goproxy.go`
- Create: `orchestrator/internal/goproxy/goproxy_test.go`

This is the core logic: scan worktree for `go.mod` files, filter dependencies by patterns, and download matching ones to the exchange directory.

**Step 1: Write the failing tests**

Create `orchestrator/internal/goproxy/goproxy_test.go`:

```go
package goproxy

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPrefixFromPattern(t *testing.T) {
	tests := []struct {
		pattern string
		want    string
	}{
		{"github.com/myorg/*", "github.com/myorg/"},
		{"github.com/other/*", "github.com/other/"},
		{"example.com/*", "example.com/"},
		{"no-glob", "no-glob"},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.want, prefixFromPattern(tt.pattern), "pattern: %s", tt.pattern)
	}
}

func TestFindMatchingDeps_NoGoMod(t *testing.T) {
	dir := t.TempDir()
	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	assert.Empty(t, deps)
}

func TestFindMatchingDeps_RootGoMod(t *testing.T) {
	dir := t.TempDir()
	gomod := `module example.com/myapp

go 1.23

require (
	github.com/myorg/foo v1.2.3
	github.com/myorg/bar v0.4.0
	github.com/public/lib v1.0.0
)
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"github.com/myorg/foo@v1.2.3", "github.com/myorg/bar@v0.4.0"}, deps)
}

func TestFindMatchingDeps_NestedGoMod(t *testing.T) {
	dir := t.TempDir()

	// Root go.mod
	rootMod := `module example.com/myapp

go 1.23

require github.com/myorg/foo v1.0.0
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(rootMod), 0o644))

	// Nested go.mod
	subDir := filepath.Join(dir, "tools")
	require.NoError(t, os.MkdirAll(subDir, 0o755))
	subMod := `module example.com/myapp/tools

go 1.23

require github.com/myorg/bar v2.0.0
`
	require.NoError(t, os.WriteFile(filepath.Join(subDir, "go.mod"), []byte(subMod), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"github.com/myorg/foo@v1.0.0", "github.com/myorg/bar@v2.0.0"}, deps)
}

func TestFindMatchingDeps_Deduplication(t *testing.T) {
	dir := t.TempDir()

	// Two go.mod files requiring the same dependency at the same version
	mod1 := `module example.com/a

go 1.23

require github.com/myorg/foo v1.0.0
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(mod1), 0o644))

	subDir := filepath.Join(dir, "sub")
	require.NoError(t, os.MkdirAll(subDir, 0o755))
	mod2 := `module example.com/b

go 1.23

require github.com/myorg/foo v1.0.0
`
	require.NoError(t, os.WriteFile(filepath.Join(subDir, "go.mod"), []byte(mod2), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	assert.Equal(t, []string{"github.com/myorg/foo@v1.0.0"}, deps)
}

func TestFindMatchingDeps_MultiplePatterns(t *testing.T) {
	dir := t.TempDir()
	gomod := `module example.com/myapp

go 1.23

require (
	github.com/orgA/foo v1.0.0
	github.com/orgB/bar v2.0.0
	github.com/public/lib v3.0.0
)
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/orgA/*", "github.com/orgB/*"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"github.com/orgA/foo@v1.0.0", "github.com/orgB/bar@v2.0.0"}, deps)
}

func TestFindMatchingDeps_EmptyPatterns(t *testing.T) {
	dir := t.TempDir()
	gomod := `module example.com/myapp

go 1.23

require github.com/myorg/foo v1.0.0
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0o644))

	deps, err := FindMatchingDeps(dir, nil)
	require.NoError(t, err)
	assert.Empty(t, deps)
}

func TestFindMatchingDeps_IndirectDeps(t *testing.T) {
	dir := t.TempDir()
	gomod := `module example.com/myapp

go 1.23

require (
	github.com/myorg/direct v1.0.0
	github.com/myorg/indirect v2.0.0 // indirect
)
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	// Should include both direct and indirect — the sandbox needs them all
	assert.ElementsMatch(t, []string{"github.com/myorg/direct@v1.0.0", "github.com/myorg/indirect@v2.0.0"}, deps)
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/goproxy/ -v -count=1`
Expected: FAIL — package doesn't exist.

**Step 3: Add golang.org/x/mod dependency**

We need `golang.org/x/mod/modfile` for robust `go.mod` parsing.

Run: `cd orchestrator && go get golang.org/x/mod`

**Step 4: Write minimal implementation**

Create `orchestrator/internal/goproxy/goproxy.go`:

```go
package goproxy

import (
	"fmt"
	"os"
	osexec "os/exec"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/mod/modfile"
)

// prefixFromPattern strips the trailing /* from a Go-style glob pattern
// to produce a prefix for matching module paths.
func prefixFromPattern(pattern string) string {
	return strings.TrimSuffix(pattern, "*")
}

// FindMatchingDeps scans all go.mod files in the worktree and returns
// deduplicated module@version strings for dependencies matching any pattern.
func FindMatchingDeps(worktreeDir string, patterns []string) ([]string, error) {
	if len(patterns) == 0 {
		return nil, nil
	}

	prefixes := make([]string, len(patterns))
	for i, p := range patterns {
		prefixes[i] = prefixFromPattern(p)
	}

	seen := make(map[string]bool)
	err := filepath.Walk(worktreeDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip unreadable directories
		}
		if info.IsDir() {
			return nil
		}
		if info.Name() != "go.mod" {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil // skip unreadable files
		}

		f, err := modfile.ParseLax(path, data, nil)
		if err != nil {
			return nil // skip unparseable go.mod files
		}

		for _, req := range f.Require {
			for _, prefix := range prefixes {
				if strings.HasPrefix(req.Mod.Path, prefix) {
					key := req.Mod.Path + "@" + req.Mod.Version
					seen[key] = true
					break
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to walk worktree: %w", err)
	}

	deps := make([]string, 0, len(seen))
	for dep := range seen {
		deps = append(deps, dep)
	}
	sort.Strings(deps)
	return deps, nil
}

// DownloadDeps downloads the given module@version strings into the exchange
// directory using `go mod download` with a custom GOMODCACHE.
// Returns the GOMODCACHE path that was used.
func DownloadDeps(deps []string, exchangeDir string) (string, error) {
	gomodcache := filepath.Join(exchangeDir, "gomodcache")

	args := append([]string{"mod", "download"}, deps...)
	cmd := osexec.Command("go", args...)
	cmd.Env = append(os.Environ(),
		"GOMODCACHE="+gomodcache,
		"GOPROXY=direct",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("go mod download failed: %s\n%s", err, strings.TrimSpace(string(out)))
	}
	return gomodcache, nil
}
```

**Step 5: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/goproxy/ -v -count=1`
Expected: All PASS.

**Step 6: Commit**

```bash
git add orchestrator/internal/goproxy/ orchestrator/go.mod orchestrator/go.sum
git commit -m "feat: add goproxy package for scanning deps and downloading"
```

---

### Task 5: Integrate Go Proxy into Sandbox Prepare

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox.go:202-261`
- Modify: `orchestrator/internal/sandbox/sandbox_test.go:354-390`

The `Prepare()` method needs to accept config patterns, call the goproxy package, and inject env vars into the launch command.

**Step 1: Write the failing test**

Add to `orchestrator/internal/sandbox/sandbox_test.go`:

```go
func TestService_Prepare_WithGoProxyPatterns(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil)

	runner := new(mockRunner)
	runner.On("RunDir", "/repo", "git", "rev-parse", "--abbrev-ref", "HEAD").Return([]byte("main\n"), nil)
	runner.On("RunDir", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return([]byte(""), nil)

	svc := NewService(lima, logging.NoopLogger{}, runner)

	// Create a fake gomodcache/cache/download in the exchange dir to simulate
	// what goproxy.DownloadDeps would create
	result, err := svc.Prepare("/repo", ".plans/test-plan.md")
	require.NoError(t, err)

	// Create the gomodcache path to test env var injection
	exchangeDir := paths.JobExchangeDir(result.JobID)
	downloadDir := filepath.Join(exchangeDir, "gomodcache", "cache", "download")
	require.NoError(t, os.MkdirAll(downloadDir, 0o755))
	defer os.RemoveAll(exchangeDir)

	// Now call BuildCommand with patterns to test env var injection
	patterns := []string{"github.com/myorg/*", "github.com/other/*"}
	cmd := BuildLaunchCommand(result.JobID, ".plans/test-plan.md", patterns)
	assert.Contains(t, cmd, "GOPROXY=file:///exchange/"+result.JobID+"/gomodcache/cache/download")
	assert.Contains(t, cmd, "GONOSUMCHECK=github.com/myorg/*,github.com/other/*")
	assert.Contains(t, cmd, "claude")
}

func TestBuildLaunchCommand_NoPatterns(t *testing.T) {
	cmd := BuildLaunchCommand("abc123", ".plans/test.md", nil)
	assert.NotContains(t, cmd, "GOPROXY")
	assert.NotContains(t, cmd, "GONOSUMCHECK")
	assert.Contains(t, cmd, "claude")
}

func TestBuildLaunchCommand_WithPatterns(t *testing.T) {
	cmd := BuildLaunchCommand("abc123", ".plans/test.md", []string{"github.com/myorg/*"})
	assert.Contains(t, cmd, "GOPROXY=file:///exchange/abc123/gomodcache/cache/download,https://proxy.golang.org,direct")
	assert.Contains(t, cmd, "GONOSUMCHECK=github.com/myorg/*")
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/sandbox/ -run "TestService_Prepare_WithGoProxy|TestBuildLaunchCommand" -v -count=1`
Expected: FAIL — `BuildLaunchCommand` is undefined.

**Step 3: Write implementation**

Extract the command-building logic from `Prepare()` into a `BuildLaunchCommand` function that accepts optional patterns. Modify `orchestrator/internal/sandbox/sandbox.go`:

Add the `BuildLaunchCommand` function:

```go
// BuildLaunchCommand constructs the limactl command to launch Claude in the sandbox.
// If patterns are provided and a gomodcache exists, GOPROXY and GONOSUMCHECK env vars are injected.
func BuildLaunchCommand(jobID, planPath string, patterns []string) string {
	guestWorkspace := "/workspace/" + jobID
	prompt := fmt.Sprintf("/executing-plans %s", planPath)

	var envPrefix string
	if len(patterns) > 0 {
		proxyPath := fmt.Sprintf("file:///exchange/%s/gomodcache/cache/download,https://proxy.golang.org,direct", jobID)
		nosumcheck := strings.Join(patterns, ",")
		envPrefix = fmt.Sprintf("GOPROXY=%s GONOSUMCHECK=%s ", proxyPath, nosumcheck)
	}

	return fmt.Sprintf("limactl shell --workdir / %s -- bash -l -c '%scd %s && claude --dangerously-skip-permissions %q'",
		lima.VMName, envPrefix, guestWorkspace, prompt)
}
```

Update `Prepare()` to use `BuildLaunchCommand` (keeping the existing signature unchanged for now — the patterns will be passed at the call site in box_push.go):

Replace the command-building section at the end of `Prepare()`:

```go
	command := BuildLaunchCommand(jobID, planPath, nil)

	return &PreparedJob{
		JobID:   jobID,
		Branch:  branch,
		Command: command,
	}, nil
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -v -count=1`
Expected: All PASS (existing tests still pass, new tests pass).

**Step 5: Commit**

```bash
git add orchestrator/internal/sandbox/sandbox.go orchestrator/internal/sandbox/sandbox_test.go
git commit -m "feat: add BuildLaunchCommand with GOPROXY env var injection"
```

---

### Task 6: Wire Go Proxy into Box Push Command

**Files:**
- Modify: `orchestrator/cmd/box_push.go:79-84`

This task wires everything together: load config, scan for deps, download, and pass patterns into the launch command.

**Step 1: Write implementation**

Modify `orchestrator/cmd/box_push.go`. After the `svc.Prepare()` call and before the tmux split, add the goproxy logic:

```go
		// Prepare sandbox job (bundle, clone, build command)
		svc := newSandboxService()
		prepared, err := svc.Prepare(cwd, planPath)
		if err != nil {
			return err
		}

		// Cache matching Go dependencies for the sandbox
		cfg, err := config.Load()
		if err != nil {
			logger.Warn("failed to load config: %s", err)
		}
		if cfg != nil && len(cfg.GoProxy.Patterns) > 0 {
			deps, err := goproxy.FindMatchingDeps(cwd, cfg.GoProxy.Patterns)
			if err != nil {
				logger.Warn("failed to scan Go dependencies: %s", err)
			} else if len(deps) > 0 {
				logger.Info("caching %d Go dependencies for sandbox...", len(deps))
				exchangeDir := paths.JobExchangeDir(prepared.JobID)
				if _, err := goproxy.DownloadDeps(deps, exchangeDir); err != nil {
					logger.Warn("failed to cache Go dependencies: %s", err)
				} else {
					// Rebuild the command with proxy env vars
					prepared.Command = sandbox.BuildLaunchCommand(prepared.JobID, planPath, cfg.GoProxy.Patterns)
				}
			}
		}
```

Add the necessary imports:

```go
import (
	// ... existing imports ...
	"github.com/averycrespi/claudefiles/orchestrator/internal/config"
	"github.com/averycrespi/claudefiles/orchestrator/internal/goproxy"
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
)
```

Note: The `sandbox` import is needed for `sandbox.BuildLaunchCommand`. The existing `newSandboxService()` in wire.go returns `*sandbox.Service` so the `sandbox` package may already be indirectly available, but the import is needed for the function call.

**Step 2: Verify it compiles**

Run: `cd orchestrator && go build ./...`
Expected: Success.

**Step 3: Commit**

```bash
git add orchestrator/cmd/box_push.go
git commit -m "feat: wire Go proxy caching into box push"
```

---

### Task 7: Update README Documentation

**Files:**
- Modify: `orchestrator/README.md:52-53` (Commands table)
- Modify: `orchestrator/README.md:108-110` (after Push/Pull section)

**Step 1: Write the documentation**

Add `cco config` to the Commands table in `orchestrator/README.md`:

```markdown
| `cco config <cmd>` | Manage configuration (path, show, edit)                                         |
```

Add a new "Configuration" section after the "Sandbox" section and before "Development":

```markdown
## Configuration

cco uses a JSON config file for optional settings. The file location respects `$XDG_CONFIG_HOME`:

```
~/.config/cco/config.json
```

**Manage the config file:**

```sh
cco config path              # print config file location
cco config show              # print config contents
cco config edit              # open in $EDITOR (creates file if needed)
```

### Go Module Proxy

When pushing Go projects to the sandbox, private module dependencies can't be resolved because the sandbox has no access to private repositories. The `go_proxy` setting caches matching dependencies on the host before push, making them available inside the sandbox via a file-system based Go module proxy.

```json
{
  "go_proxy": {
    "patterns": [
      "github.com/myorg/*"
    ]
  }
}
```

**How it works:**

1. At push time, cco scans all `go.mod` files in the worktree
2. Dependencies matching any pattern are downloaded to the job's exchange directory
3. Inside the sandbox, `GOPROXY` is set to check the local cache first, then fall back to `proxy.golang.org`

Patterns use the same glob format as Go's `GOPRIVATE` environment variable. If `go_proxy` is absent or `patterns` is empty, push behaves as before.
```

**Step 2: Commit**

```bash
git add orchestrator/README.md
git commit -m "docs: add configuration section with Go proxy documentation"
```

---

### Task 8: Run Full Test Suite

**Files:** None (verification only).

**Step 1: Run all tests**

Run: `cd orchestrator && go test ./... -count=1`
Expected: All PASS.

**Step 2: Run build**

Run: `cd orchestrator && go build ./...`
Expected: Success.

**Step 3: Verify `go vet`**

Run: `cd orchestrator && go vet ./...`
Expected: No issues.
