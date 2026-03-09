# Future Plans

This document outlines areas we want to explore and improve in this repository.

## Tools and Integrations

### Slack MCP Server

A Slack integration would allow Claude to interact with team communication directly - reading channel context, posting updates, or pulling relevant discussions into the workflow.

## Autonomous Execution

Exploring how to run the execute step of the structured development workflow in the background, safely, without manual permission approvals each time.

The goal is to spin off a plan into an isolated Claude Code session with file system and network isolation, let it work in the background with a way to check in on progress, then safely extract the completed work and fold it back into the completing workflow.

Projects being evaluated:
- [Fence](https://github.com/Use-Tusk/fence)
- [Anthropics Sandbox Runtime](https://github.com/anthropic-experimental/sandbox-runtime)
- [Devcontainers](https://containers.dev/)
- [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/)
- [macOS sandbox-exec](https://igorstechnoclub.com/sandbox-exec/)
- [macOS Containerization](https://github.com/apple/containerization)
- [nono](https://github.com/lukehinds/nono)
- [Claude Code built-in sandbox](https://code.claude.com/docs/en/sandboxing)

### Comparison

| | Claude Code sandbox | Fence | Anthropic SRT | Devcontainers | Docker Sandboxes | macOS sandbox-exec | macOS Containerization | nono |
|---|---|---|---|---|---|---|---|---|
| **Isolation type** | Process (OS-level) | Process (OS-level) | Process (OS-level) | Container | MicroVM | Process (OS-level) | Lightweight VM | Process (kernel-level) |
| **FS isolation** | Write to cwd only by default, reads allowed | Writes denied by default, reads allowed | Writes denied by default, reads allowed with denylist | Full (only mounted paths visible) | Full (bidirectional file sync) | Profile-based allow/deny | Full (per-VM ext4 filesystem) | Kernel-enforced allow/deny per path |
| **Network isolation** | Domain allowlist via proxy | Blocked by default, domain allowlist via proxy | Blocked by default, domain allowlist via proxy | Container networking (configurable) | Outbound via host proxy, no inter-sandbox or localhost access | Profile-based allow/deny | Per-VM network stack, dedicated IPs | `--net-block` flag; Linux requires kernel 6.7+ |
| **macOS support** | Yes (via Seatbelt) | Yes (via sandbox-exec) | Yes (via sandbox-exec) | Yes (via Docker Desktop) | Yes (via virtualization.framework) | Native | Apple Silicon + macOS 26 only | Yes (via Seatbelt) |
| **Maturity** | Production (built into Claude Code) | Active, 455 stars | Active, 2.9k stars, v0.0.35 | Mature, industry standard | Production-ready for Claude Code (Docker Desktop 4.58+) | Deprecated by Apple, undocumented | v0.1.0, 8.3k stars, macOS 26 required | Early alpha, 266 stars, created Jan 2026 |
| **Overhead** | Negligible (built-in) | Very light (just a binary) | Very light (Node.js process) | Medium (container + Docker runtime) | Medium-heavy (microVM per sandbox) | Negligible (native OS) | Medium (lightweight VM per container) | Negligible (kernel enforcement) |
| **Claude Code integration** | Native (built-in `/sandbox` command) | Excellent (designed for AI agents) | Excellent (built by Anthropic for this) | Good (via `devcontainer exec`) | Excellent (native `docker sandbox run claude`) | Poor (deprecated, complex profiles) | Possible but impractical (macOS 26) | Excellent (pre-built Claude Code profiles) |
| **Security ceiling** | Semi-trusted (proxy bypass, `dangerouslyDisableSandbox` escape hatch) | Semi-trusted (proxy bypass possible) | Semi-trusted (proxy bypass possible) | Container escape possible | Strong (hypervisor boundary) | Kernel-enforced but escape research exists | Strong (VM boundary) | Kernel-enforced but early/unaudited |
| **Key limitation** | Same process as Claude Code; escape hatch exists; no full session isolation | Tools must respect proxy env vars | Tools must respect proxy env vars | Docker Desktop dependency, disk I/O overhead on macOS | Linux unsupported for microVM; file sync latency | Deprecated, undocumented, profiles may break across macOS versions | Requires unreleased macOS 26 + Apple Silicon | Early alpha, not security-audited, no resource limits |
