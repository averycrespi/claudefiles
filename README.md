# Agent Config

My configuration for working with AI coding agents — currently [Claude Code](https://www.anthropic.com/claude-code) and [Pi](https://pi.dev/).

This repo is opinionated. It provides a structured development workflow, security-first hooks, and reusable skills that turn a general-purpose coding agent into a reliable development partner. Use it as-is, fork it, or cherry-pick the parts that fit your setup.

## Highlights

**Structured development workflow** — A pipeline for turning ideas into pull requests, adapted from [superpowers](https://github.com/obra/superpowers):

```
/brainstorming → /writing-plans → /executing-plans → /verifying-work → /completing-work
```

Each stage is a skill that can be used independently. Plans are executed via subagent dispatch to keep context clean. Verification runs parallel reviewers across correctness, security, design, code quality, and performance.

**Security hooks** — Pre-commit secret scanning with [gitleaks](https://github.com/gitleaks/gitleaks). Sandbox mode locks down remote operations and redirects to MCP tools.

**Auto-formatting on write** — A PostToolUse hook that formats files after every edit using Prettier, gofmt, rustfmt, or shfmt based on file extension. No manual formatting steps.

**Reusable skills** — From PR review to browser automation (Playwright) to incident response to Jira ticket creation. See the full list below.

**Pi extensions** — TypeScript modules adding web search, subagent dispatch, auto-formatting, broker-backed auth, and more to the Pi agent.

## Structure

| Directory                     | Purpose                                      | Stow target    |
| ----------------------------- | -------------------------------------------- | -------------- |
| [`claude/`](claude/README.md) | Skills, hooks, settings, agents, status line | `~/.claude/`   |
| [`pi/agent/`](pi/README.md)   | Extensions, agents, skills, settings         | `~/.pi/agent/` |

See each directory's README for the full list of skills, hooks, and extensions.

## Design Decisions

- **Subagent isolation** — Long-running tasks (plan execution, PR review) dispatch subagents so the main context window stays clean and responsive
- **TDD-first plans** — Implementation plans are structured around test-driven development: write the test, make it pass, then refactor
- **Security by default** — Secret scanning runs on every commit, not as an opt-in. Sandbox mode restricts remote operations to MCP tools
- **Stow for symlinks** — Config lives in a git repo, gets symlinked to `~/.claude/` and `~/.pi/agent/`. Edit once, take effect everywhere

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
```

## Related

- [agent-tools](https://github.com/averycrespi/agent-tools) — Tools that reduce the friction of working with AI coding agents

## License

- Repository licensed under [MIT](./LICENSE)
- Individual components may have their own licenses
