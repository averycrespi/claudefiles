# Sandbox Claude Config Design

## Context

The Lima sandbox architecture calls for a `sandbox/claude/` directory containing Claude Code configuration optimized for sandboxed execution. This config is copied (not mounted) into the VM at `~/.claude` during provisioning. The host Claude config has extensive permissions, hooks, MCP servers, and plugins — the sandbox config is the inverse: maximum freedom, minimum guardrails.

## Design

### `sandbox/claude/CLAUDE.md`

Keeps conventions that affect output quality (conventional commits, PR descriptions) but adds sandbox-specific context. Does not include role framing or workflow instructions.

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
\`\`\`
<type>: <description>

[optional body]
\`\`\`

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

\`\`\`
## Context
- Why this change exists and what was wrong/missing before

## Changes
- What changed, grouped by concept (not file-by-file)

## Test Plan
- [ ] Steps to verify the changes work
\`\`\`
```

### `sandbox/claude/settings.json`

Minimal empty settings to ensure Claude Code doesn't inherit unexpected defaults:

```json
{
  "permissions": {
    "allow": [],
    "deny": []
  }
}
```

No hooks, no MCP servers, no plugins, no sandbox config, no status line. The VM boundary provides security; `--dangerously-skip-permissions` removes all permission friction.

## What's Excluded (vs Host Config)

| Host Config | Sandbox | Why |
|---|---|---|
| Permission allowlists (112 rules) | Empty | `--dangerously-skip-permissions` makes them unnecessary |
| Permission denylists (~/.aws, ~/.ssh, etc.) | Empty | No secrets exist in the VM |
| gitleaks pre-commit hook | None | VM is disposable, no secrets to leak |
| Notification hooks | None | No terminal-notifier or tmux in VM |
| Atlassian MCP server | None | No external service access |
| gopls LSP plugin | None | Can be added later if needed |
| Sandbox/proxy config | None | VM boundary replaces process-level sandboxing |
| Status line | None | Not needed in sandbox |
| Asking Questions section | None | No interactive question workflow in sandbox |

## Decisions

1. **Keep conventional commits and PR format** — These affect the quality of Claude's git output regardless of environment. Worth the few extra lines.
2. **Simplified PR template** — Removed "Review Notes" section and ticket references since sandbox Claude won't have Jira access.
3. **Empty settings.json** — Belt and suspenders. Ensures Claude Code doesn't inherit unexpected defaults even though `--dangerously-skip-permissions` is used.
4. **No role framing** — The CLAUDE.md describes the environment, not Claude's role. Role context can be added later if needed.
