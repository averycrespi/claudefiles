# Design: `cco box shell`

## Purpose

Add a `cco box shell` command that opens an interactive shell into the sandbox VM, or runs a command inside it.

## Usage

```
cco box shell              # interactive shell
cco box shell -- ls -la    # run a command inside the VM
```

## Changes

### 1. Lima Client (`internal/lima/lima.go`)

Add a `Shell(args ...string) error` method:

```go
func (c *Client) Shell(args ...string) error {
    cmdArgs := []string{"shell", VMName}
    cmdArgs = append(cmdArgs, args...)
    if err := c.runner.RunInteractive("limactl", cmdArgs...); err != nil {
        return fmt.Errorf("limactl shell failed: %s", err)
    }
    return nil
}
```

### 2. Sandbox Service (`internal/sandbox/sandbox.go`)

Add `Shell` to the `limaClient` interface:

```go
type limaClient interface {
    // ... existing methods ...
    Shell(args ...string) error
}
```

Add `Shell(args ...string) error` method to `Service`:

```go
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

### 3. Cobra Command (`cmd/box_shell.go`)

New file following existing box subcommand pattern:

```go
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

## Design Decisions

- **Pre-check VM status**: Consistent with other box commands (Start, Stop, Provision). Gives friendly error messages instead of raw limactl errors.
- **ArbitraryArgs + passthrough**: Allows both `cco box shell` (interactive) and `cco box shell -- cmd` (run command). The `--` separator is handled by Cobra automatically.
- **No new packages or interfaces**: Extends existing `limaClient` interface and follows the same DI pattern.
