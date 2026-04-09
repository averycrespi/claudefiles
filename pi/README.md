# Agent Config

My configuration for working with AI coding agents - currently [Pi](https://pi.dev/).

## Usage

Requirements:

- [Pi agent](https://pi.dev/)
- [Make](https://www.gnu.org/software/make/manual/make.html)
- [Stow](https://www.gnu.org/software/stow/)

```sh
make stow   # symlink config into ~/.pi/agent/
make unstow # remove symlinks
```

## Development

Requirements:

- [Node.js](https://nodejs.org/) 24.14.1

```sh
make install   # install Node dependencies for developing extensions
make typecheck # type-check extension TypeScript files
```

## Related

- [agent-tools](https://github.com/averycrespi/agent-tools) - A collection of tools that reduce the friction of working with AI coding agents

## Inspiration

- [Building a Coding Agent for the Pi](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) - Lessons learned building a minimal, opinionated coding agent
- [onecli](https://github.com/onecli/onecli) - Credential vault giving AI agents access to services without exposing keys
- [awesome-mcp-gateways](https://github.com/e2b-dev/awesome-mcp-gateways) - Curated list of MCP gateways
- [Pi](https://lucumr.pocoo.org/2026/1/31/pi/) - Armin Ronacher's introduction to the Pi minimal coding agent
- [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) - Hooks, agent teams, HUDs, and extensions for OpenAI Codex CLI
- [Clawdette](https://github.com/kristopolous/Clawdette) - Vibe-code a Claude Code clone in any language and platform
- [oh-my-pi](https://github.com/can1357/oh-my-pi) - Terminal AI coding agent with hash-anchored edits, LSP, and subagents
- [JSON Canvas](https://jsoncanvas.org/) - Open JSON file format for infinite canvas data by Obsidian
- [claudefiles](https://github.com/averycrespi/claudefiles) - Opinionated resources and config files for working with Claude Code
- [awesome-pi-agent](https://github.com/qualisero/awesome-pi-agent) - Curated list of add-ons, tools, skills, and resources for Pi
- [superpowers](https://github.com/obra/superpowers) - A collection of practical enhancements for coding agents
- [Pi coding agent example extensions](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/) - Example extensions for the Pi coding agent
- [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) - Pi extension that bridges MCP servers with a low-context proxy tool and optional direct tool promotion
- [Brave Search API](https://brave.com/search/api/) - Web search API with a 35+ billion page index
- [shittycodingagent packages](https://shittycodingagent.ai/packages) - Community package registry for Pi extensions, skills, themes, and prompts

## License

This project is licensed under the [MIT License](./LICENSE).
