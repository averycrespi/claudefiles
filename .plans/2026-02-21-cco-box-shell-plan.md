# `cco box shell` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add a `cco box shell` command that opens an interactive shell into the sandbox VM, or runs a command inside it.

**Architecture:** Extend the existing lima client with a `Shell` method, add status pre-checks in the sandbox service, and wire it up as a new Cobra subcommand under `box`. Follows the same DI and error-handling patterns as every other box command.

**Tech Stack:** Go, Cobra, Lima (limactl), testify/mock

---

### Task 1: Add `Shell` to Lima Client

**Files:**
- Modify: `orchestrator/internal/lima/lima.go:78-88`

**Step 1: Add the `Shell` method to `Client`**

Append after the `Copy` method in `orchestrator/internal/lima/lima.go`:

```go
// Shell opens an interactive shell or runs a command in the VM.
func (c *Client) Shell(args ...string) error {
	cmdArgs := []string{"shell", VMName}
	cmdArgs = append(cmdArgs, args...)
	if err := c.runner.RunInteractive("limactl", cmdArgs...); err != nil {
		return fmt.Errorf("limactl shell failed: %s", err)
	}
	return nil
}
```

No new imports needed — `fmt` is already imported.

**Step 2: Run tests to verify nothing broke**

Run: `cd orchestrator && go test ./... -count=1`
Expected: All existing tests pass (no tests for lima client directly, but compilation must succeed).

**Step 3: Commit**

```
feat(lima): add Shell method to lima client
```

---

### Task 2: Add `Shell` to Sandbox Service with Tests

**Files:**
- Modify: `orchestrator/internal/sandbox/sandbox.go:11-18` (add `Shell` to `limaClient` interface)
- Modify: `orchestrator/internal/sandbox/sandbox.go` (add `Shell` method to `Service`)
- Modify: `orchestrator/internal/sandbox/sandbox_test.go` (add mock method + tests)

**Step 1: Write the failing tests**

Add the `Shell` mock method to `mockLimaClient` in `orchestrator/internal/sandbox/sandbox_test.go`:

```go
func (m *mockLimaClient) Shell(args ...string) error {
	// Convert variadic to interface slice for testify mock
	callArgs := []interface{}{}
	for _, a := range args {
		callArgs = append(callArgs, a)
	}
	return m.Called(callArgs...).Error(0)
}
```

Then add these test functions at the end of the file:

```go
func TestService_Shell_NotCreated(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Shell()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not created")
}

func TestService_Shell_Stopped(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Stopped", nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Shell()

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sandbox not running")
}

func TestService_Shell_Running(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Shell()

	require.NoError(t, err)
	lima.AssertCalled(t, "Shell")
}

func TestService_Shell_WithArgs(t *testing.T) {
	lima := new(mockLimaClient)
	lima.On("Status").Return("Running", nil)
	lima.On("Shell", "ls", "-la").Return(nil)
	svc := NewService(lima, logging.NoopLogger{})

	err := svc.Shell("ls", "-la")

	require.NoError(t, err)
	lima.AssertCalled(t, "Shell", "ls", "-la")
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -v -run TestService_Shell`
Expected: Compilation error — `Shell` not yet on `limaClient` interface or `Service`.

**Step 3: Add `Shell` to `limaClient` interface and `Service`**

In `orchestrator/internal/sandbox/sandbox.go`, add `Shell(args ...string) error` to the `limaClient` interface:

```go
type limaClient interface {
	Status() (string, error)
	Create(templatePath string) error
	Start() error
	Stop() error
	Delete() error
	Copy(src, dst string) error
	Shell(args ...string) error
}
```

Add the `Shell` method to `Service` (after the `Provision` method, before `writeTempFile`):

```go
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
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/sandbox/ -count=1 -v -run TestService_Shell`
Expected: All 4 Shell tests pass.

**Step 5: Run full test suite**

Run: `cd orchestrator && go test ./... -count=1`
Expected: All tests pass.

**Step 6: Commit**

```
feat(sandbox): add Shell method with status pre-checks
```

---

### Task 3: Add Cobra Command

**Files:**
- Create: `orchestrator/cmd/box_shell.go`

**Step 1: Create the command file**

Create `orchestrator/cmd/box_shell.go`:

```go
package cmd

import "github.com/spf13/cobra"

var boxShellCmd = &cobra.Command{
	Use:   "shell [-- command]",
	Short: "Open a shell in the sandbox",
	Args:  cobra.ArbitraryArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Shell(args...)
	},
}

func init() { boxCmd.AddCommand(boxShellCmd) }
```

**Step 2: Build to verify compilation**

Run: `cd orchestrator && go build ./cmd/cco`
Expected: Compiles without errors.

**Step 3: Run full test suite**

Run: `cd orchestrator && go test ./... -count=1`
Expected: All tests pass.

**Step 4: Commit**

```
feat: add cco box shell command
```

---

### Task 4: Update Documentation

**Files:**
- Modify: `orchestrator/README.md:13` (add `shell` to box command list)
- Modify: `orchestrator/README.md:87-91` (replace `limactl shell` with `cco box shell`)

**Step 1: Update the command table**

In `orchestrator/README.md`, change line 13 from:

```
| `cco box <cmd>`       | Manage the sandbox (create, start, stop, destroy, status, provision) |
```

to:

```
| `cco box <cmd>`       | Manage the sandbox (create, start, stop, destroy, status, provision, shell) |
```

**Step 2: Update the "Enter the sandbox" section**

In `orchestrator/README.md`, change the "Enter the sandbox" section from:

```sh
limactl shell cco-sandbox
```

to:

```sh
cco box shell
```

**Step 3: Commit**

```
docs: add cco box shell to README
```
