# Agent Config

My configuration for working with AI coding agents — currently [Claude Code](https://www.anthropic.com/claude-code) and [Pi](https://pi.dev/).

## Requirements

- [Claude Code](https://github.com/anthropics/claude-code)
- [Pi agent](https://pi.dev/)
- [Homebrew](https://brew.sh/)
- [Node.js](https://nodejs.org/) 24+
- macOS is assumed, but can be adapted for Linux

## Quick Start

```sh
git clone git@github.com:averycrespi/agent-config.git
cd agent-config
brew bundle             # install system dependencies on macOS
make install-playwright # for /automating-browsers skill
make stow-claude        # symlink claude/ into ~/.claude/
make stow-pi            # symlink pi/agent/ into ~/.pi/agent/
```

## Structure

| Directory                         | Purpose                                       | Stow target    |
| --------------------------------- | --------------------------------------------- | -------------- |
| [`claude/`](claude/README.md)     | Claude Code skills, hooks, settings, agents   | `~/.claude/`   |
| [`pi/agent/`](pi/agent/README.md) | Pi agent extensions, agents, skills, settings | `~/.pi/agent/` |

## Development

```sh
make install-dev # install Pi dev dependencies
make typecheck   # type-check Pi extension TypeScript files
```

## Related

- [agent-tools](https://github.com/averycrespi/agent-tools) — A collection of tools that reduce the friction of working with AI coding agents

## Attribution

- Workflow skills adapted from [superpowers](https://github.com/obra/superpowers) by Jesse Vincent (MIT)
- `creating-skills` adapted from [Anthropic's skill-creator](https://github.com/anthropics/skills/tree/main/skill-creator) (Apache 2.0)
- `designing-frontends` adapted from [Anthropic's frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (Apache 2.0)
- `automating-browsers` derived from [playwright-cli](https://github.com/microsoft/playwright-cli) by Microsoft (Apache 2.0)
- Status line script adapted from [claude-code-tools](https://github.com/pchalasani/claude-code-tools) by Prasad Chalasani (MIT)

## License

- Repository licensed under [MIT](./LICENSE)
- Individual components may have their own licenses
