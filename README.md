# claudefiles

My opinionated resources for working with AI coding agents — currently [Claude Code](https://www.anthropic.com/claude-code) and [Pi](https://pi.dev/).

## Requirements

- [Claude Code](https://github.com/anthropics/claude-code)
- [Pi agent](https://pi.dev/)
- [Homebrew](https://brew.sh/) for macOS dependency management
- [Node.js](https://nodejs.org/) 24+ for Pi extensions and `automating-browsers`
- macOS is assumed, but can be adapted for Linux

## Quick Start

```sh
git clone git@github.com:averycrespi/claudefiles.git
cd claudefiles
./setup.sh
```

The setup script will install dependencies and symlink configuration into `~/.claude/` and `~/.pi/`.

## Structure

| Directory | Purpose | Stow target |
| --------- | ------- | ----------- |
| [`claude/`](claude/README.md) | Claude Code skills, hooks, settings, agents | `~/.claude/` |
| `pi/` | Pi agent extensions, agents, skills, settings | `~/.pi/` |


## Development

```sh
npx tsc          # type-check Pi extension TypeScript files
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
- Individual skills and agents may have their own licenses
