# Pi Agent Configuration

This directory manages [Pi](https://pi.dev/) coding agent configuration files.

## Directory Structure

```
pi/agent/
├── AGENTS.md       # Agent instructions (task approach, git rules, style)
├── settings.json   # Provider, model, and thinking settings
├── agents/         # Subagent definitions (code, explore, research, review)
├── extensions/     # TypeScript extensions
├── prompts/        # Custom prompt templates
└── skills/         # Custom skills
```

## How It Works

Running `make stow-pi` creates symlinks from `pi/agent/` into `~/.pi/agent/`. Edits here take effect immediately — no need to re-stow after changing files.

## Extensions

TypeScript modules that customize the Pi agent. Type-check with `make typecheck`.

| Extension                | Purpose                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `ask-user`               | Improved TUI for user questions                                 |
| `autopilot`              | Autonomous plan → implement → verify pipeline from a design doc |
| `code-feedback`          | Auto-format and surface LSP errors after edits                  |
| `compact-tools`          | Compact rendering for read and bash                             |
| `context-files-reminder` | Inject context file contents into LLM calls                     |
| `mcp-broker`             | Broker CLI skill + guard for remote operations                  |
| `provider-usage`         | Provider rate-limit quota in the footer                         |
| `readonly-tools`         | Enable built-in ls/find/grep tools for read-only exploration    |
| `subagents`              | Dynamic subagent loading and dispatch                           |
| `task-list`              | Session-scoped task tracking with rich inline TUI rendering     |
| `web-access`             | Web search and fetch tools                                      |

See the [pi-extensions](../claude/skills/pi-extensions/SKILL.md) skill for authoring guidance.
