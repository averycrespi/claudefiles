# Lima Sandbox Architecture

## Context

This repository already has a structured development workflow (architect → brainstorm → plan → execute → complete) where a host Claude handles planning, context gathering, and external service integration. Today, plan execution happens in the same environment as planning, with the same permissions and access to secrets.

We want to separate execution into an isolated environment: a persistent Lima VM where a "guest Claude" can run with full permissions (dangerouslySkipPermissions) but no access to host secrets, API keys, or external services. The VM approach was chosen over lighter-weight sandboxing (process-level, container-based) because it provides strong isolation boundaries while allowing Docker to run inside the guest for integration testing.

## Goals & Non-Goals

**Goals:**
- Isolated execution environment for Claude Code plan execution
- Docker available inside the VM for integration tests
- Pre-installed dev tools and language runtimes (via asdf)
- Reproducible VM setup via version-controlled config
- Shared project files between host and guest via mount

**Non-Goals (for MVP):**
- Automated host→guest plan invocation (user invokes manually)
- Automated authentication (user logs in interactively)
- Multiple concurrent VMs or per-project isolation
- Network restriction/firewalling inside the VM

## System Overview

The system adds a `sandbox/` directory to this repository containing everything needed to create and configure a Lima VM for sandboxed Claude Code execution.

The host repo directory is mounted read-write into the VM so both host Claude and guest Claude see the same project files. The guest Claude config (`sandbox/claude/`) is maintained in the repo and copied (not mounted) into the VM at `~/.claude`, so VM runtime state doesn't pollute the repository.

The user workflow is: host Claude writes a plan, user starts or resumes the Lima VM, user runs Claude Code inside the VM to execute the plan.

## Components

### `sandbox/` Directory

**Responsibility:** Contains all configuration and scripts needed to create, provision, and manage the Lima VM. Serves as the source of truth for the guest Claude configuration.

**Structure:**
```
sandbox/
├── claude/              # Guest Claude config (copied into VM at ~/.claude)
│   ├── CLAUDE.md        # Instructions for sandboxed execution
│   └── settings.json    # Minimal settings (dangerouslySkipPermissions)
├── lima.yaml            # Lima VM template
└── provision.sh         # VM provisioning script
```

**Interface:** Users interact with this via Lima CLI commands (`limactl start sandbox/lima.yaml`, etc.) and the provision script runs automatically during VM creation.

### Lima VM

**Responsibility:** Provides an isolated Ubuntu 24.04 execution environment with Docker, language runtimes, and dev tools pre-installed.

**Configuration (lima.yaml):**
- Ubuntu 24.04 base image
- Resource allocation (CPU, memory, disk)
- Read-write mount of the repo directory into the VM
- Provisioning script execution on first boot

**Dependencies:**
- Lima installed on host (already available)
- Host repo directory for the mount

### Guest Claude Config (`sandbox/claude/`)

**Responsibility:** Provides Claude Code configuration optimized for sandboxed execution. Tells Claude it's in a sandbox with full permissions and no external service access.

**Contents:**
- `CLAUDE.md` — Same conventions as host (conventional commits, etc.) plus sandbox-specific instructions: full permissions available, can install/run anything, no external services
- `settings.json` — `dangerouslySkipPermissions: true`, no hooks, no MCP servers, no permission allowlists

**Interface:** Copied into VM at `~/.claude` during provisioning. To update, edit files in `sandbox/claude/` and re-provision or manually copy.

### Provisioning Script (`provision.sh`)

**Responsibility:** Runs inside the VM to install all dependencies and configure the environment. Designed to be idempotent (safe to re-run).

**Installs:**
- Docker Engine + Docker Compose plugin
- asdf version manager with plugins for Python, Go, Node.js
- Core dev tools: git, curl, wget, jq, ripgrep, build-essential, unzip
- Claude Code (via npm)

**Also:**
- Copies `sandbox/claude/` into `~/.claude` inside the VM

## Decisions

1. **Copy, not mount for `~/.claude`** — The VM's `~/.claude` directory accumulates runtime state (auth tokens, debug logs, session data). Mounting would pollute the repo with this state. One-way copy keeps the repo config clean.

2. **Single provision script** — One `provision.sh` rather than multiple scripts or Ansible/etc. Keeps it simple for MVP. The script is idempotent so it can be re-run to update the environment.

3. **lima.yaml in repo** — VM template is version-controlled and reproducible. Anyone with Lima installed can create an identical VM.

4. **asdf for language runtimes** — Single tool manages Python, Go, and Node.js. Consistent interface, avoids installing three separate version managers (nvm, pyenv, goenv).

5. **Persistent VM** — Created once, reused across sessions. Avoids the high overhead of spinning up a new VM for each execution. Acceptable trade-off: low risk of cross-project leakage since this is a personal dev tool.

6. **dangerouslySkipPermissions in guest** — The VM boundary provides the security. Inside the VM, Claude should have no friction executing plans. No hooks, no MCP, no permission prompts.

## Constraints & Limitations

- **Interactive auth only** — User must log into Claude Code inside the VM manually. API key is not persisted in config or injected automatically.
- **No automated invocation** — User manually starts Claude Code in the VM and points it at plan files. Future work may automate this.
- **Single VM** — One persistent VM shared across all projects. Per-project isolation is a non-goal for MVP.
- **First provision is slow** — Installing Docker, asdf, runtimes, and dev tools takes several minutes. Subsequent VM starts are fast.
- **Mount performance** — Lima's filesystem mounting (virtiofs/9p) may have performance implications for large repos. Acceptable for MVP.
