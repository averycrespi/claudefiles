# Clean Architecture Refactor — Orchestrator

## Context

The orchestrator's packages (`git`, `tmux`, `lima`) call `exec.Command` directly as package-level functions. This makes `workspace` and `sandbox` — the orchestration layers — impossible to unit test without running real external tools (git, tmux, limactl). The goal is to introduce interfaces and dependency injection to make the orchestrator testable without changing its behavior.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary goal | Testability | Make workspace/sandbox testable without real git/tmux/lima |
| Interface location | Consumer-side | Most idiomatic Go — "accept interfaces, return structs" |
| Implementation style | Structs with methods | Convert package funcs to `Client` structs taking a `Runner` |
| exec.Command abstraction | `Runner` interface | Small interface with `Run`, `RunDir`, `RunInteractive` |
| Interactive I/O | Separate `RunInteractive` method | Clean separation of batch vs interactive commands |
| Struct naming | `Client` | `git.Client`, `tmux.Client`, `lima.Client` — conventional Go |
| Pure packages (paths) | Leave as-is | No external deps, already trivially testable |
| Logging | Convert to interface | `Logger` interface enables suppressing/capturing output in tests |
| Service lifetime | Fresh per command | Each CLI command creates its own service — matches CLI lifecycle |
| Test doubles | testify/mock in `_test.go` files | `github.com/stretchr/testify` for mock, assert, require |
| Wiring | Manual in `cmd/wire.go` | Simple constructor-based DI, no frameworks |

## Architecture

### Layer 1: Runner (new `internal/exec` package)

```go
// internal/exec/exec.go
package exec

type Runner interface {
    // Run executes a command and returns its combined output.
    Run(name string, args ...string) ([]byte, error)
    // RunDir executes a command in a specific directory.
    RunDir(dir, name string, args ...string) ([]byte, error)
    // RunInteractive executes a command with stdin/stdout/stderr connected.
    RunInteractive(name string, args ...string) error
}

type OSRunner struct{}

func NewOSRunner() *OSRunner { return &OSRunner{} }

func (r *OSRunner) Run(name string, args ...string) ([]byte, error) {
    return exec.Command(name, args...).CombinedOutput()
}

func (r *OSRunner) RunDir(dir, name string, args ...string) ([]byte, error) {
    cmd := exec.Command(name, args...)
    cmd.Dir = dir
    return cmd.CombinedOutput()
}

func (r *OSRunner) RunInteractive(name string, args ...string) error {
    cmd := exec.Command(name, args...)
    cmd.Stdin = os.Stdin
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    return cmd.Run()
}
```

### Layer 2: Tool Clients (git, tmux, lima)

Each package converts from package-level functions to a `Client` struct:

```go
// internal/git/git.go
package git

import "github.com/.../internal/exec"

type Client struct {
    runner exec.Runner
}

func NewClient(runner exec.Runner) *Client {
    return &Client{runner: runner}
}

func (c *Client) RepoInfo(path string) (Info, error) {
    out, err := c.runner.RunDir(path, "git", "rev-parse", "--show-toplevel")
    // ... same logic as today
}

func (c *Client) AddWorktree(repoRoot, worktreeDir, branch string) error { ... }
func (c *Client) RemoveWorktree(repoRoot, worktreeDir string) error { ... }
func (c *Client) BranchExists(repoRoot, branch string) (bool, error) { ... }
func (c *Client) CommonDir(path string) (string, error) { ... } // NEW: extracted from workspace.Attach
```

Same pattern for `tmux.Client` and `lima.Client`.

Data types (`git.Info`, `lima.instance`) remain as package-level types.

### Layer 3: Services with Consumer-Side Interfaces (workspace, sandbox)

```go
// internal/workspace/workspace.go
package workspace

type gitClient interface {
    RepoInfo(path string) (git.Info, error)
    AddWorktree(repoRoot, worktreeDir, branch string) error
    RemoveWorktree(repoRoot, worktreeDir string) error
    CommonDir(path string) (string, error)
}

type tmuxClient interface {
    SessionExists(session string) bool
    CreateSession(session, window string) error
    CreateWindow(session, window, dir string) error
    KillWindow(session, window string) error
    WindowExists(session, window string) bool
    ListWindows(session string) ([]string, error)
    RenameWindow(session, oldName, newName string) error
    SendKeys(session, window, keys string) error
    ActualWindowName(session, window string) string
    IsActiveWindow(session, window string) bool
    Attach(session string) error
    AttachToWindow(session, window string) error
}

type Service struct {
    git    gitClient
    tmux   tmuxClient
    logger logging.Logger
}

func NewService(g gitClient, t tmuxClient, l logging.Logger) *Service {
    return &Service{git: g, tmux: t, logger: l}
}

// Init, Add, Remove, Attach, Notify become methods on Service.
```

```go
// internal/sandbox/sandbox.go
package sandbox

type limaClient interface {
    Status() (string, error)
    Create(templatePath string) error
    Start() error
    Stop() error
    Delete() error
    Copy(src, dst string) error
}

type Service struct {
    lima   limaClient
    logger logging.Logger
}

func NewService(l limaClient, log logging.Logger) *Service {
    return &Service{lima: l, logger: log}
}

// Create, Start, Stop, Destroy, Status, Provision become methods on Service.
```

### Layer 4: Logging Interface

```go
// internal/logging/logging.go
package logging

type Logger interface {
    Info(format string, args ...any)
    Debug(format string, args ...any)
}

type StdLogger struct {
    verbose bool
}

func NewStdLogger(verbose bool) *StdLogger {
    return &StdLogger{verbose: verbose}
}

// Info and Debug implementations same as today's package-level functions.

type NoopLogger struct{}

func (NoopLogger) Info(string, ...any)  {}
func (NoopLogger) Debug(string, ...any) {}
```

### Layer 5: Wiring (cmd/)

```go
// cmd/wire.go
package cmd

func newWorkspaceService() *workspace.Service {
    runner := exec.NewOSRunner()
    logger := logging.NewStdLogger(verbose)
    return workspace.NewService(
        git.NewClient(runner),
        tmux.NewClient(runner),
        logger,
    )
}

func newSandboxService() *sandbox.Service {
    runner := exec.NewOSRunner()
    logger := logging.NewStdLogger(verbose)
    return sandbox.NewService(
        lima.NewClient(runner),
        logger,
    )
}
```

Command handlers create services fresh per invocation:

```go
// cmd/add.go
func runAdd(cmd *cobra.Command, args []string) error {
    svc := newWorkspaceService()
    return svc.Add(repoRoot, args[0])
}
```

## Testing Strategy

### Three layers of tests

| Layer | What's tested | How | Fakes |
|---|---|---|---|
| Runner level | git/tmux/lima parse exec output correctly | Fake `Runner` returns canned `[]byte` | `exec.Runner` mock |
| Service level | workspace/sandbox orchestration logic | Fake git/tmux/lima clients | testify/mock of consumer interfaces |
| Integration | Full CLI end-to-end | Real git, tmux, filesystem | None (real tools) |

### Test doubles with testify/mock

```go
// internal/workspace/workspace_test.go
type mockGitClient struct {
    mock.Mock
}

func (m *mockGitClient) RepoInfo(path string) (git.Info, error) {
    args := m.Called(path)
    return args.Get(0).(git.Info), args.Error(1)
}

func TestAdd_CreatesWorktreeAndWindow(t *testing.T) {
    gitMock := new(mockGitClient)
    gitMock.On("RepoInfo", "/repo").Return(git.Info{Name: "myrepo", Root: "/repo"}, nil)
    gitMock.On("AddWorktree", "/repo", mock.Anything, "feature").Return(nil)

    tmuxMock := new(mockTmuxClient)
    tmuxMock.On("SessionExists", "myrepo").Return(true)
    tmuxMock.On("WindowExists", "myrepo", "feature").Return(false)
    tmuxMock.On("CreateWindow", "myrepo", "feature", mock.Anything).Return(nil)
    tmuxMock.On("SendKeys", mock.Anything, mock.Anything, mock.Anything).Return(nil)

    svc := workspace.NewService(gitMock, tmuxMock, logging.NoopLogger{})
    err := svc.Add("/repo", "feature")

    require.NoError(t, err)
    gitMock.AssertExpectations(t)
    tmuxMock.AssertExpectations(t)
}
```

### New dependency

```
go get github.com/stretchr/testify
```

## File Changes Summary

```
orchestrator/
├── cmd/
│   ├── wire.go                   # NEW: service constructors
│   ├── add.go                    # CHANGED: use service
│   ├── rm.go                     # CHANGED: use service
│   ├── attach.go                 # CHANGED: use service
│   ├── notify.go                 # CHANGED: use service
│   ├── box_*.go                  # CHANGED: use service
│   └── root.go                   # UNCHANGED
│
├── internal/
│   ├── exec/                     # NEW
│   │   └── exec.go               # Runner interface + OSRunner
│   │
│   ├── git/                      # CHANGED: funcs → Client methods
│   │   ├── git.go
│   │   └── git_test.go           # Rewritten with fake Runner
│   │
│   ├── tmux/                     # CHANGED: funcs → Client methods
│   │   ├── tmux.go
│   │   └── tmux_test.go          # Rewritten with fake Runner
│   │
│   ├── lima/                     # CHANGED: funcs → Client methods
│   │   ├── lima.go
│   │   └── lima_test.go          # Rewritten with fake Runner
│   │
│   ├── workspace/                # CHANGED: funcs → Service methods + interfaces
│   │   ├── workspace.go
│   │   └── workspace_test.go     # NEW unit tests with testify mocks
│   │
│   ├── sandbox/                  # CHANGED: funcs → Service methods + interfaces
│   │   ├── sandbox.go
│   │   └── sandbox_test.go       # NEW/expanded unit tests
│   │
│   ├── logging/                  # CHANGED: add Logger interface
│   │   ├── logging.go
│   │   └── logging_test.go
│   │
│   └── paths/                    # UNCHANGED
│       ├── paths.go
│       └── paths_test.go
│
└── cmd/cco/
    └── integration_test.go       # UNCHANGED (end-to-end stays as-is)
```

## What Stays the Same

- All business logic and behavior — same commands, same idempotency, same error messages
- `paths` package — pure string logic, no changes needed
- Integration tests — still test the real stack end-to-end
- Directory structure — no package moves, just conversions within existing packages
- Cobra CLI structure — same commands, flags, help text
