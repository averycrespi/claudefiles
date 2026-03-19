# Sandbox Restructure Design

## Context

The current sandbox model uses git bundles to transfer work between the host and a Lima VM (`cco box push` / `cco box pull`). This creates friction and limits what you can do inside the VM.

The new model turns the sandbox into a primary development environment: repos are live-mounted, paths match the host, and Claude Code runs directly inside the VM with `--dangerously-skip-permissions`. The VM provides the isolation boundary instead of Claude Code's permission system.

## Architecture

### Core Changes

- **Live mounts**: Repos and CCO worktrees are mounted read-write into the VM at their host paths
- **Path/user parity**: VM username, UID, GID, and home directory match the host
- **Config overlay**: Host Claude Code config is copied in, then sandbox-specific overrides are applied on top via ordered provision paths
- **Simplified CLI**: Remove push/pull/exchange; keep lifecycle commands (create, start, stop, destroy, provision, status, shell); add `template` command

### What Gets Removed

- `cco box push` and `cco box pull` commands
- `cco/internal/sandbox/` — `Prepare()`, `Pull()` methods, job ID generation
- `cco/internal/config/` — `GoProxyConfig` and related loading
- `cco/internal/goproxy/` — entire package
- Exchange directory path utilities in `cco/internal/paths/`
- All embedded sandbox files (`cco/internal/sandbox/files/CLAUDE.md`, `settings.json`, `skills/`)
- `cco/internal/sandbox/embed.go` (or strip down)
- `claude/skills/executing-plans-in-sandbox/` skill
- References to `executing-plans-in-sandbox` in settings and other skills
- `cco box push`/`cco box pull` from sandbox excluded commands in settings

## Configuration

`~/.config/cco/config.json` structure:

```json
{
  "sandbox": {
    "mounts": [
      "/Users/username/src/work",
      "/Users/username/src/personal"
    ],
    "provision_paths": [
      "/Users/username/.claude",
      "/Users/username/.claude/sandbox/settings.json:/Users/username/.claude/settings.json",
      "/Users/username/.claude/sandbox/CLAUDE.md:/Users/username/.claude/CLAUDE.md",
      "/Users/username/.claude/sandbox/scripts/statusline.sh:/Users/username/.claude/scripts/statusline.sh",
      "/Users/username/.zshrc",
      "/Users/username/.config/git"
    ]
  }
}
```

### Mounts

- Directories mounted read-write into the VM at their host paths
- The CCO worktree path (`~/.local/share/cco/worktrees`) is always included automatically
- Configured in `sandbox.mounts`

### Provision Paths

- Ordered list of files/directories copied into the VM during `cco box provision`
- Plain path (e.g. `/Users/username/.claude`) — copied to the same path in the VM
- Mapped path using Docker Compose volume syntax (e.g. `source:dest`) — source on host copied to dest in VM
- **Order matters** — later entries overwrite earlier ones, enabling the overlay pattern

## VM Template

The static embedded `lima.yaml` becomes a Go template rendered at `cco box create` time.

### Template Inputs

- **Username** — from host
- **UID/GID** — from host
- **Home directory** — from host
- **Mounts** — from config `sandbox.mounts` + automatic worktree path

Each mount becomes a lima mount block with `location` and `mountPoint` set to the same host path, `writable: true`.

### `cco box template`

New command that renders the lima.yaml template with current config/host values and prints to stdout. For debugging — no VM creation.

### Base Provisioning

Unchanged from current: Ubuntu 24.04, apt packages, Go, asdf, Claude Code installation.

## Provisioning Flow (`cco box provision`)

Processes `sandbox.provision_paths` in order:

1. For each entry, parse as either `path` or `source:dest`
2. Copy from host into VM at the resolved destination path
3. Later entries overwrite earlier ones

Example flow with the config above:
1. Copy `~/.claude/` → `~/.claude/` in VM (all skills, agents, scripts, sandbox dir)
2. Copy `~/.claude/sandbox/settings.json` → `~/.claude/settings.json` in VM (overrides host settings)
3. Copy `~/.claude/sandbox/CLAUDE.md` → `~/.claude/CLAUDE.md` in VM (overrides host CLAUDE.md)
4. Copy `~/.claude/sandbox/scripts/statusline.sh` → `~/.claude/scripts/statusline.sh` in VM (overrides host status line)
5. Copy `~/.zshrc` → `~/.zshrc` in VM
6. Copy `~/.config/git` → `~/.config/git` in VM

## Sandbox Override Files

Live in `claude/sandbox/` in this repo, stowed to `~/.claude/sandbox/` on the host.

### `claude/sandbox/settings.json`

Sandbox-specific Claude Code settings (e.g. different hooks, `--dangerously-skip-permissions` behavior).

### `claude/sandbox/CLAUDE.md`

Sandbox-specific instructions for Claude Code running inside the VM.

### `claude/sandbox/scripts/statusline.sh`

Copy of the host status line script with a `sandbox` prefix added to make it visually obvious when running inside the VM.

## CLI Changes

### Commands After Restructure

```
cco box
├── create        Create, start, and provision the sandbox VM
├── start         Start a stopped sandbox VM
├── stop          Stop a running sandbox VM
├── destroy       Remove the sandbox VM
├── provision     Copy config/dotfiles into the VM (re-runnable)
├── status        Display sandbox VM status
├── shell [-- cmd]  Open shell or run command in VM
└── template      Print the rendered lima.yaml template
```

### Removed Commands

- `cco box push`
- `cco box pull`

## Documentation Updates

- `docs/skills.md` — remove `executing-plans-in-sandbox` row
- `docs/workflow.md` — no changes needed (doesn't reference sandbox)
- `docs/claude-code-config.md` — update if it references sandbox skills or exchange dirs
