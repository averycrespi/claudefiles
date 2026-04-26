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

| Extension        | Purpose                                                         |
| ---------------- | --------------------------------------------------------------- |
| `ask-user`       | `ask_user` tool for multiple-choice questions                   |
| `autopilot`      | Autonomous plan → implement → verify pipeline from a design doc |
| `autoralph`      | Autonomous agent-driven Ralph-style loop from a design doc      |
| `compact-tools`  | Compact TUI rendering for built-in shell and file tools         |
| `format`         | Format files after write and edit                               |
| `mcp-broker`     | Broker CLI skill + guard for remote operations                  |
| `provider-usage` | Provider rate-limit quota in the footer                         |
| `subagents`      | Dynamic subagent loading and dispatch                           |
| `task-list`      | Session-scoped task tracking with rich inline TUI rendering     |
| `web-access`     | Web search, fetch, GitHub, and PDF tools                        |

Underscore-prefixed directories are libraries imported by sibling extensions, not extensions themselves — pi's extension loader skips them because they have no `index.ts`.

| Library          | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `_shared`        | Stateless helpers shared across extensions                         |
| `_workflow-core` | Primitives for structured-state-machine-around-subagents workflows |

See the [pi-extensions](../claude/skills/pi-extensions/SKILL.md) skill for authoring guidance.
