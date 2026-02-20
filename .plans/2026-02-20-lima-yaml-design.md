# lima.yaml Design

## Context

The Lima sandbox architecture calls for a `sandbox/lima.yaml` that defines a persistent Ubuntu 24.04 VM for sandboxed Claude Code execution. The VM needs Docker, dev tools, asdf-managed language runtimes, and Claude Code pre-installed. Mounts are deferred — they'll be designed separately.

## Design

### Base Configuration

```yaml
minimumLimaVersion: 2.0.0

base:
- template:_images/ubuntu-24.04

cpus: 4
memory: "4GiB"
disk: "100GiB"
```

Uses Lima's built-in Ubuntu 24.04 image template rather than hardcoded URLs. Does not include `template:_default/mounts` — mount configuration is deferred. Resources match Lima defaults.

### Docker Setup

Follows Lima's `docker-rootful` template pattern:

```yaml
containerd:
  system: false
  user: false
```

Containerd is managed by Docker, not Lima, to avoid conflicts. Docker is installed via the official `get.docker.com` script in a system-mode provision step. A probe waits for Docker to be running before the VM is considered ready.

### Provisioning

System-mode provision steps run as root, followed by a user-mode step:

1. **Docker install** (system) — Installs Docker Engine via `get.docker.com`, idempotent (skips if docker already present)
2. **Add user to docker group** (system) — Lets the user run docker without sudo
3. **Host network isolation** (system) — Uses iptables to block all traffic to the host gateway IP, preventing the VM from accessing host services (SSH from Lima is excluded so `limactl shell` continues to work)
4. **Dev tools + asdf + Claude Code** (user) — Inlined script that installs:
   - Core dev tools: git, curl, wget, jq, ripgrep, build-essential, unzip
   - asdf version manager with plugins for Python, Go, Node.js (latest stable versions)
   - Claude Code via npm

All provision scripts are inlined in the yaml for simplicity.

### Probes

A single probe validates Docker is installed and running before the VM is considered started.

### Host Network Isolation

The VM is firewalled from the host using iptables. A system-mode provision step detects the default gateway (which is the host) and blocks all outbound traffic to it. The Lima SSH connection is excluded so `limactl shell` continues to work. The `hostResolver` is disabled so the VM uses standard network DNS rather than the host's resolver.

```yaml
hostResolver:
  enabled: false
```

### Security Summary

- **No host network access** — iptables blocks traffic to host gateway
- **No host DNS** — hostResolver disabled, VM uses network DNS
- No `portForwards` for Docker socket — VM's Docker stays isolated from host
- No `ssh.forwardAgent` — no SSH keys leak into sandbox
- No `ssh.loadDotSSHPubKeys` — defaults to false

### Startup Message

Displays instructions for entering the VM after startup:

```yaml
message: |
  Claude Code sandbox VM is ready.
  Run `limactl shell claude-sandbox` to enter the VM.
```

## Full lima.yaml

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
- mode: system
  script: |
    #!/bin/bash
    set -eux -o pipefail
    command -v docker >/dev/null 2>&1 && exit 0
    export DEBIAN_FRONTEND=noninteractive
    curl -fsSL https://get.docker.com | sh

- mode: system
  script: |
    #!/bin/bash
    set -eux -o pipefail
    usermod -aG docker "{{.User}}"

- mode: system
  script: |
    #!/bin/bash
    set -eux -o pipefail
    # Block all traffic to the host gateway to prevent accessing host services.
    # Lima SSH uses a vsock or serial connection, not the network gateway,
    # so limactl shell continues to work.
    GATEWAY=$(ip route | awk '/default/ {print $3}')
    if [ -n "$GATEWAY" ]; then
      iptables -C OUTPUT -d "$GATEWAY" -j DROP 2>/dev/null || \
        iptables -A OUTPUT -d "$GATEWAY" -j DROP
    fi

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

## Decisions

1. **Inline provisioning** — All scripts are inlined in the yaml rather than referencing external files. Simpler for MVP, single file to manage.
2. **User-mode for dev tools** — asdf, Node.js, and Claude Code are installed as the user, not root. This matches how they'll be used at runtime.
3. **No mount configuration** — Deferred to a separate design. The yaml is functional without mounts; they can be added later.
4. **Docker group membership** — User is added to the docker group so `docker` commands work without sudo.
5. **asdf latest versions** — Installs latest stable versions of Node.js, Python, and Go. Specific version pinning can be added later if needed.
6. **Full host network isolation** — iptables blocks all traffic to the host gateway. Lima SSH uses vsock/serial (not the network gateway), so `limactl shell` is unaffected. hostResolver is disabled so the VM doesn't use the host's DNS resolver.
7. **Removed host.docker.internal** — No hostname mapping to the host since the VM shouldn't access host services at all.
