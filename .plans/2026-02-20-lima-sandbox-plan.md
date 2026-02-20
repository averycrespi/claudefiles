# Lima Sandbox Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Create a Lima VM-based sandbox environment for running Claude Code in isolation, with Docker, dev tools, and language runtimes pre-installed.

**Architecture:** A `sandbox/` directory in the repo contains a Lima VM template (`lima.yaml`) with inlined provisioning and a Claude Code config (`claude/`) that gets copied into the VM. The VM runs Ubuntu 24.04 with full host network isolation via iptables.

**Tech Stack:** Lima 2.0+, Ubuntu 24.04, Docker, asdf, iptables

---

### Task 1: Create sandbox Claude config

**Files:**
- Create: `sandbox/claude/CLAUDE.md`
- Create: `sandbox/claude/settings.json`

**Step 1: Create the CLAUDE.md**

Create `sandbox/claude/CLAUDE.md` with the following content. This is the global instruction file for Claude Code running inside the sandbox VM:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when running inside the sandbox VM.

## Sandbox Environment

You are running inside an isolated Linux VM (Ubuntu 24.04). You have full
permissions — install packages, run any commands, use Docker freely. There
are no permission prompts or hooks.

This VM has no access to host services, secrets, or API keys beyond what
is needed to run Claude Code itself. Do not attempt to access external
services that require authentication.

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

## Pull Request Descriptions

**Title:** Conventional commit format. Under 70 characters.

**Body:**

```
## Context
- Why this change exists and what was wrong/missing before

## Changes
- What changed, grouped by concept (not file-by-file)

## Test Plan
- [ ] Steps to verify the changes work
```
```

**Step 2: Create the settings.json**

Create `sandbox/claude/settings.json` with minimal empty settings:

```json
{
  "permissions": {
    "allow": [],
    "deny": []
  }
}
```

**Step 3: Commit**

```bash
git add sandbox/claude/CLAUDE.md sandbox/claude/settings.json
git commit -m "feat(sandbox): add Claude Code config for sandbox VM"
```

---

### Task 2: Create lima.yaml

**Files:**
- Create: `sandbox/lima.yaml`

**Step 1: Create the Lima VM template**

Create `sandbox/lima.yaml` with the full VM configuration. This defines an Ubuntu 24.04 VM with Docker, host network isolation, dev tools, asdf runtimes, and Claude Code:

```yaml
minimumLimaVersion: 2.0.0

base:
- template:_images/ubuntu-24.04

cpus: 4
memory: "4GiB"
disk: "100GiB"

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
    usermod -aG docker "{{.User}}"

# Block all traffic to the host gateway to prevent accessing host services.
# Lima SSH uses a vsock or serial connection, not the network gateway,
# so limactl shell continues to work.
- mode: system
  script: |
    #!/bin/bash
    set -eux -o pipefail
    GATEWAY=$(ip route | awk '/default/ {print $3}')
    if [ -n "$GATEWAY" ]; then
      iptables -C OUTPUT -d "$GATEWAY" -j DROP 2>/dev/null || \
        iptables -A OUTPUT -d "$GATEWAY" -j DROP
    fi

# Install dev tools, asdf runtimes, and Claude Code
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

    # --- asdf version manager ---
    if [ ! -d "$HOME/.asdf" ]; then
      git clone https://github.com/asdf-vm/asdf.git "$HOME/.asdf" --branch v0.16.7
    fi
    # shellcheck disable=SC1091
    . "$HOME/.asdf/asdf.sh"

    # asdf plugins and runtimes
    asdf plugin add nodejs || true
    asdf plugin add python || true
    asdf plugin add golang || true

    asdf install nodejs latest
    asdf install python latest
    asdf install golang latest

    asdf set --home nodejs latest
    asdf set --home python latest
    asdf set --home golang latest

    # Add asdf to shell profile
    if ! grep -q 'asdf.sh' "$HOME/.bashrc"; then
      echo '. "$HOME/.asdf/asdf.sh"' >> "$HOME/.bashrc"
    fi

    # --- Claude Code ---
    npm install -g @anthropic-ai/claude-code

    # --- Copy sandbox Claude config ---
    # The sandbox claude/ directory is accessible via the Lima mount.
    # This will be wired up when mounts are configured.

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

message: |
  Claude Code sandbox VM is ready.
  Run `limactl shell claude-sandbox` to enter the VM.
```

**Step 2: Validate the template**

Run Lima's template validation:

```bash
limactl template validate sandbox/lima.yaml
```

Expected: No errors. If validation fails, fix any issues before continuing.

**Step 3: Commit**

```bash
git add sandbox/lima.yaml
git commit -m "feat(sandbox): add Lima VM template with Docker and dev tools"
```

---

### Task 3: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md` (project root)

**Step 1: Add sandbox section to README.md**

Add a new section after the "Integrations" section (before "Attribution") in `README.md`:

```markdown
---

## Lima Sandbox

Run Claude Code inside an isolated Linux VM for safe plan execution.

**Requirements:**
- [Lima](https://github.com/lima-vm/lima) (`brew install lima`)

**Create the VM (first time only):**

```sh
limactl start --name=claude-sandbox sandbox/lima.yaml
```

**Enter the VM:**

```sh
limactl shell claude-sandbox
```

**Authenticate Claude Code (first time only):**

```sh
claude --dangerously-skip-permissions
```

**Stop the VM:**

```sh
limactl stop claude-sandbox
```

The VM is persistent — data and installed packages survive restarts. The first boot takes several minutes to install Docker, language runtimes, and dev tools. Subsequent starts are fast.
```

**Step 2: Add sandbox to CLAUDE.md repository structure**

In the project root `CLAUDE.md`, update the "Repository Structure" section to include the sandbox directory:

```
sandbox/                 # Lima VM sandbox for isolated execution
├── claude/             # Guest Claude Code config (copied into VM)
│   ├── CLAUDE.md       # Sandbox-specific instructions
│   └── settings.json   # Minimal settings
└── lima.yaml           # Lima VM template
```

**Step 3: Add Lima to requirements in CLAUDE.md**

In the project root `CLAUDE.md`, in the "Setup" section, add a note that Lima is optional and only needed for the sandbox.

**Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: add sandbox setup instructions to README and CLAUDE.md"
```
