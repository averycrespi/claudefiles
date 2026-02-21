# cco box — Lima Sandbox Integration

## Context

The orchestrator (`cco`) and the Lima sandbox are currently independent tools. The sandbox VM is managed manually via `limactl` commands. This design integrates sandbox lifecycle management into the orchestrator as `cco box` with subcommands.

The VM is named `cco-sandbox`. Template and config files are embedded in the binary.

## Commands

| Command | Description |
|---------|-------------|
| `cco box create` | Create, start, and provision the sandbox VM |
| `cco box start` | Start a stopped sandbox VM |
| `cco box stop` | Stop a running sandbox VM |
| `cco box destroy` | Delete the sandbox VM (delegates confirmation to limactl) |
| `cco box status` | Print VM status: Running, Stopped, or NotCreated |
| `cco box provision` | Copy Claude configs into the VM (re-runnable) |

## Command Behaviors

All commands are idempotent.

### `cco box create`

1. Check if VM `cco-sandbox` exists via `limactl list --json`
2. If exists and running — log "already created and running", run provision, exit 0
3. If exists and stopped — start it, run provision, exit 0
4. If not exists — write embedded lima.yaml to temp file, run `limactl start --name=cco-sandbox <tempfile>`, run provision

### `cco box start`

1. If not exists — error: "sandbox not created, run `cco box create`"
2. If running — log "already running", exit 0
3. If stopped — `limactl start cco-sandbox`

### `cco box stop`

1. If not exists — log "sandbox not created", exit 0
2. If stopped — log "already stopped", exit 0
3. If running — `limactl stop cco-sandbox`

### `cco box destroy`

1. If not exists — log "sandbox not created", exit 0
2. Run `limactl delete cco-sandbox` (without `--force`; limactl prompts for confirmation interactively)

### `cco box status`

1. Query VM status via `limactl list --json cco-sandbox`
2. Print one of: `Running`, `Stopped`, `NotCreated`

### `cco box provision`

1. If not exists — error: "sandbox not created"
2. If stopped — error: "sandbox not running, run `cco box start`"
3. Write embedded CLAUDE.md and settings.json to temp files
4. Copy into VM via `limactl cp`:
   - `CLAUDE.md` → `cco-sandbox:~/.claude/CLAUDE.md`
   - `settings.json` → `cco-sandbox:~/.claude/settings.json`
5. Log success

## Package Structure

```
orchestrator/
├── cmd/
│   ├── box.go              # parent "cco box" command
│   ├── box_create.go
│   ├── box_start.go
│   ├── box_stop.go
│   ├── box_destroy.go
│   ├── box_status.go
│   └── box_provision.go
├── internal/
│   ├── lima/
│   │   └── lima.go         # limactl wrapper
│   ├── sandbox/
│   │   ├── sandbox.go      # coordinator
│   │   ├── embed.go        # go:embed directives
│   │   └── files/
│   │       ├── lima.yaml
│   │       ├── CLAUDE.md
│   │       └── settings.json
│   └── ...existing packages
```

## `internal/lima` Package

Thin wrapper around `limactl`, consistent with how `internal/git` wraps `git` and `internal/tmux` wraps `tmux`:

```go
package lima

const VMName = "cco-sandbox"

func Status() (string, error)              // "Running", "Stopped", or "" (not found)
func Create(templatePath string) error     // limactl start --name=cco-sandbox <path>
func Start() error                         // limactl start cco-sandbox
func Stop() error                          // limactl stop cco-sandbox
func Delete() error                        // limactl delete cco-sandbox (interactive)
func Copy(localPath, guestPath string) error // limactl cp <local> cco-sandbox:<guest>
```

- `Status()` runs `limactl list --json cco-sandbox` and parses the JSON array to extract the `status` field. Returns empty string if VM doesn't exist (empty JSON array).
- All commands connect stdout/stderr to `os.Stdout`/`os.Stderr` so the user sees Lima's output (critical for `create` which takes minutes and shows progress).

## `internal/sandbox` Package

Coordinator that composes `lima` operations with embedded file management:

```go
package sandbox

//go:embed files/lima.yaml
var limaTemplate []byte

//go:embed files/CLAUDE.md
var claudeMD []byte

//go:embed files/settings.json
var settingsJSON []byte

func Create() error    // check status → write template to temp → lima.Create → Provision
func Start() error     // check status → lima.Start
func Stop() error      // check status → lima.Stop
func Destroy() error   // check status → lima.Delete
func Status() error    // lima.Status → print
func Provision() error // check status → write configs to temp → lima.Copy each
```

## Embedded Files

Files move from `sandbox/` at the repo root into the Go module:

```
sandbox/lima.yaml           → orchestrator/internal/sandbox/files/lima.yaml
sandbox/claude/CLAUDE.md    → orchestrator/internal/sandbox/files/CLAUDE.md
sandbox/claude/settings.json → orchestrator/internal/sandbox/files/settings.json
```

The `sandbox/` directory at the repo root is removed after migration.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Lima API | Shell out to `limactl` | Consistent with git/tmux wrappers; simpler, fewer deps |
| Create behavior | Provisions + starts | Matches `limactl start` semantics; one command to get running |
| Idempotency | All commands idempotent | Consistent with existing `cco add`/`cco rm` |
| Destroy confirmation | Delegate to limactl | Less code, consistent UX with Lima |
| Status output | Single word | Clean, scriptable; verbose details via `--verbose` later |
| Template location | Embedded in binary | Self-contained binary; no external file dependencies |
| Config deployment | `limactl cp` via provision command | Re-runnable; standalone command for config refresh |
| Embed file location | `internal/sandbox/files/` | Go embed requirement: files must be in or below package dir |
