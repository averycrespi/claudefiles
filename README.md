# claudefiles

My opinionated resources for working with [Claude Code](https://www.anthropic.com/claude-code).

## Features

- **[Structured Development Workflow](docs/workflow.md)** — Reliably turn ideas into pull requests
- **[Claude Code Orchestrator](cco/README.md)** — Develop in parallel using Git worktrees and tmux
- **[Integrations](docs/integrations.md)** — Connect to Jira, Confluence, Datadog, and browsers

## Requirements

- [Claude Code](https://github.com/anthropics/claude-code)
- [Homebrew](https://brew.sh/) for macOS dependency management
- [Go](https://go.dev/) 1.23 for building `cco`
- [Node.js](https://nodejs.org/) 18+ for `automating-browsers`
- macOS is assumed, but can be adapted for Linux

## Quick Start

```sh
git clone git@github.com:averycrespi/claudefiles.git
cd claudefiles
./setup.sh
```

The setup script will install dependencies, symlink configuration files to `~/.claude/`, and install `cco`.

## Documentation

| Doc | Purpose |
|-----|---------|
| [Workflow](docs/workflow.md) | How the structured development workflow works |
| [Skills Catalog](docs/skills.md) | All available skills and agents |
| [Integrations](docs/integrations.md) | Setup guides for external services |
| [Claude Code Config](docs/claude-code-config.md) | How the `~/.claude/` symlinks work |
| [Design Decisions](docs/design-decisions.md) | Why things are built this way |
| [Future](docs/future.md) | Planned improvements and explorations |

## Attribution

- Workflow skills adapted from [superpowers](https://github.com/obra/superpowers) by Jesse Vincent (MIT)
- `creating-skills` adapted from [Anthropic's skill-creator](https://github.com/anthropics/skills/tree/main/skill-creator) (Apache 2.0)
- `designing-frontends` adapted from [Anthropic's frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (Apache 2.0)
- `automating-browsers` derived from [playwright-cli](https://github.com/microsoft/playwright-cli) by Microsoft (Apache 2.0)
- Status line script adapted from [claude-code-tools](https://github.com/pchalasani/claude-code-tools) by Prasad Chalasani (MIT)

## License

- Repository licensed under [MIT](./LICENSE)
- Individual skills and agents may have their own licenses
