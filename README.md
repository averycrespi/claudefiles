# Agent Config

My configuration for working with AI coding agents — currently [Claude Code](https://www.anthropic.com/claude-code) and [Pi](https://pi.dev/). Pairs well with my [agent-tools](https://github.com/averycrespi/agent-tools).

This repo is opinionated. It provides a structured development workflow, security-first hooks, and reusable skills that turn a general-purpose coding agent into a reliable development partner. Use it as-is, fork it, or cherry-pick the parts that fit your setup.

## What's Included

### [Claude Code](claude/README.md) → `~/.claude/`

- **Structured development workflow** — `/brainstorming → /writing-plans → /executing-plans → /verifying-work → /completing-work`, a pipeline of skills (adapted from [superpowers](https://github.com/obra/superpowers)) that turns ideas into pull requests with subagent-isolated implementation and parallel reviewers
- **Reference skills** — TDD discipline, PR review, browser automation (Playwright), Jira ticket creation, frontend design, incident troubleshooting, agent engineering, and more
- **Security and quality hooks** — Pre-commit secret scanning with [gitleaks](https://github.com/gitleaks/gitleaks); auto-formatting on every write via Prettier, gofmt, rustfmt, or shfmt
- **Sandbox mode** — Locked-down config for headless or remote environments that redirects `gh` and remote git to MCP tools
- **Custom status line** — Powerline-style display showing model, branch, context window usage, and session rate-limit usage

### [Pi](pi/README.md) → `~/.pi/agent/`

- **Extensions** — TypeScript modules that add capabilities to the Pi agent: subagent dispatch, structured-workflow primitives, MCP brokering, web access, formatting, and more
- **Skills** — Reusable workflows and reference guides, tuned for Pi platform conventions and GPT-5.x prose
- **Custom subagents and prompts** — Definitions for delegated exploration, fast research, deep research, and review

## Companion: [agent-tools](https://github.com/averycrespi/agent-tools)

`agent-config` configures the agent; [`agent-tools`](https://github.com/averycrespi/agent-tools) provides tools for working with AI agents. Two of its tools are explicit integration points for this repo:

- **MCP broker** — credentials-holding proxy that lets sandboxed agents use external tools without ever holding the secrets themselves. Pairs with the `mcp-broker` Pi extension and Claude's sandbox-mode `gh`/git redirection hooks
- **Sandbox manager (`sb`)** — provisions and manages a Lima-based Linux VM for isolated agent runs. Pairs with the overrides in `claude/sandbox/`

## Quick Start

### Requirements

- [Claude Code](https://github.com/anthropics/claude-code) and/or [Pi agent](https://pi.dev/)
- [Homebrew](https://brew.sh/)
- [Node.js](https://nodejs.org/) 24+
- macOS assumed, adaptable for Linux

### Setup

```sh
git clone git@github.com:averycrespi/agent-config.git
cd agent-config
brew bundle             # install system dependencies on macOS
make install-playwright # for /playwright-cli skill
make stow-claude        # symlink claude/ into ~/.claude/
make stow-pi            # symlink pi/agent/ into ~/.pi/agent/
```

### Development

```sh
make install-dev # install Pi dev dependencies
make typecheck   # type-check Pi extension TypeScript files
make test        # run Pi extension unit tests
```

## License

- Repository licensed under [MIT](./LICENSE)
- Individual components may have their own licenses
