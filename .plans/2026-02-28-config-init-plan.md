# Config Init Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add a `cco config init` command that creates the config file with sensible defaults, and refactor `config edit` to use it instead of creating an empty `{}`.

**Architecture:** Add `Default()` and `Init()` functions to the `config` package. `Init()` accepts a `logging.Logger` for output. Add a new `config init` CLI subcommand and refactor `config edit` to delegate file creation to `Init()`.

**Tech Stack:** Go, cobra, testify

---

### Task 1: Add `Default()` and `Init()` to config package

**Files:**
- Modify: `orchestrator/internal/config/config.go`
- Test: `orchestrator/internal/config/config_test.go`

**Step 1: Write the failing tests**

Add these tests to `orchestrator/internal/config/config_test.go`:

```go
func TestDefault(t *testing.T) {
	cfg := Default()
	assert.NotNil(t, cfg)
	assert.Empty(t, cfg.GoProxy.Patterns)
}

func TestInit_CreatesFileWhenMissing(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)

	logger := logging.NoopLogger{}
	err := Init(logger)
	require.NoError(t, err)

	data, err := os.ReadFile(filepath.Join(dir, "cco", "config.json"))
	require.NoError(t, err)

	var cfg Config
	require.NoError(t, json.Unmarshal(data, &cfg))
	assert.Empty(t, cfg.GoProxy.Patterns)
}

func TestInit_NoopWhenFileExists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "cco"), 0o755))

	existing := []byte(`{"go_proxy": {"patterns": ["github.com/myorg/*"]}}`)
	configPath := filepath.Join(dir, "cco", "config.json")
	require.NoError(t, os.WriteFile(configPath, existing, 0o644))

	logger := logging.NoopLogger{}
	err := Init(logger)
	require.NoError(t, err)

	data, err := os.ReadFile(configPath)
	require.NoError(t, err)
	assert.Equal(t, existing, data)
}

func TestInit_CreatesDirectory(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(dir, "nested", "path"))

	logger := logging.NoopLogger{}
	err := Init(logger)
	require.NoError(t, err)

	_, err = os.Stat(filepath.Join(dir, "nested", "path", "cco", "config.json"))
	assert.NoError(t, err)
}
```

Note: Add `"encoding/json"` and `"github.com/averycrespi/claudefiles/orchestrator/internal/logging"` to the test file imports.

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/config/ -count=1 -run "TestDefault|TestInit"  -v`
Expected: FAIL — `Default` and `Init` are undefined.

**Step 3: Write minimal implementation**

Add to `orchestrator/internal/config/config.go`:

```go
import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
)

// Default returns a Config populated with default values.
func Default() *Config {
	return &Config{
		GoProxy: GoProxyConfig{
			Patterns: []string{},
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
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/config/ -count=1 -run "TestDefault|TestInit" -v`
Expected: PASS

**Step 5: Commit**

```bash
git add orchestrator/internal/config/config.go orchestrator/internal/config/config_test.go
git commit -m "feat(config): add Default() and Init() functions"
```

---

### Task 2: Add `config init` subcommand and refactor `config edit`

**Files:**
- Modify: `orchestrator/cmd/config.go`

**Step 1: Add `config init` subcommand and refactor `config edit`**

Replace the full contents of `orchestrator/cmd/config.go`. The key changes:

1. Add import for `config` package
2. Add `configInitCmd` cobra command that calls `config.Init(logger)`
3. Replace inline file-creation in `configEditCmd` with `config.Init(logger)`
4. Register `configInitCmd` in `init()`

```go
package cmd

import (
	"fmt"
	"os"
	osexec "os/exec"

	"github.com/averycrespi/claudefiles/orchestrator/internal/config"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
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
		logger := logging.NewStdLogger(verbose)
		path := paths.ConfigFilePath()
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				logger.Info("no config file found at %s", path)
				return nil
			}
			return err
		}
		fmt.Print(string(data))
		return nil
	},
}

var configInitCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize config file with defaults",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		logger := logging.NewStdLogger(verbose)
		return config.Init(logger)
	},
}

var configEditCmd = &cobra.Command{
	Use:   "edit",
	Short: "Open config file in $EDITOR",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		logger := logging.NewStdLogger(verbose)
		if err := config.Init(logger); err != nil {
			return err
		}

		editor := os.Getenv("EDITOR")
		if editor == "" {
			editor = "vi"
		}
		path := paths.ConfigFilePath()
		c := osexec.Command(editor, path)
		c.Stdin = os.Stdin
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr
		return c.Run()
	},
}

func init() {
	configCmd.AddCommand(configPathCmd, configShowCmd, configInitCmd, configEditCmd)
	rootCmd.AddCommand(configCmd)
}
```

**Step 2: Verify it compiles**

Run: `cd orchestrator && go build ./...`
Expected: Success, no errors.

**Step 3: Run all tests**

Run: `cd orchestrator && go test ./... -count=1`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add orchestrator/cmd/config.go
git commit -m "feat(config): add init subcommand and refactor edit to use it"
```

---

### Task 3: Update documentation

**Files:**
- Modify: `orchestrator/README.md`

**Step 1: Update the Commands table**

In `orchestrator/README.md`, update the `cco config <cmd>` row in the Commands table from:

```
| `cco config <cmd>`    | Manage configuration (path, show, edit)                                                 |
```

to:

```
| `cco config <cmd>`    | Manage configuration (path, show, init, edit)                                           |
```

**Step 2: Update the Configuration section**

In `orchestrator/README.md`, update the "Manage the config file" block from:

```sh
cco config path              # print config file location
cco config show              # print config contents
cco config edit              # open in $EDITOR (creates file if needed)
```

to:

```sh
cco config path              # print config file location
cco config show              # print config contents
cco config init              # create config with defaults (if not exists)
cco config edit              # open in $EDITOR (runs init first)
```

**Step 3: Commit**

```bash
git add orchestrator/README.md
git commit -m "docs: add config init command to orchestrator README"
```
