# Pi Agent Configuration

This directory manages [Pi](https://pi.dev/) coding agent configuration files.

## Directory Structure

```
pi/agent/
├── AGENTS.md       # Agent instructions (task approach, git rules, style)
├── settings.json   # Provider, model, and thinking settings
├── agents/         # Subagent definitions (code, explore, research, deep-research, review)
├── extensions/     # TypeScript extensions
├── prompts/        # Custom prompt templates
└── skills/         # Custom skills
```

## How It Works

Running `make stow-pi` creates symlinks from `pi/agent/` into `~/.pi/agent/`. Edits here take effect immediately — no need to re-stow after changing files.

## Extensions

TypeScript modules that customize the Pi agent. Type-check with `make typecheck`.

| Extension        | Purpose                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `ask-user`       | `ask_user` tool for multiple-choice questions                     |
| `autopilot`      | Autonomous plan → implement → verify pipeline from a design doc   |
| `autoralph`      | Autonomous agent-driven Ralph-style loop from a design doc        |
| `compact-tools`  | Compact TUI rendering for built-in shell and file tools           |
| `format`         | Format files after write and edit                                 |
| `mcp-broker`     | Broker CLI skill + guard for remote operations                    |
| `provider-usage` | Provider rate-limit quota in the footer                           |
| `subagents`      | Dynamic subagent loading and dispatch                             |
| `task-list`      | Session-scoped task list with agent tools and a sticky TUI widget |
| `web-access`     | Web search, fetch, GitHub, and PDF tools                          |

Underscore-prefixed directories are libraries imported by sibling extensions, not extensions themselves — pi's extension loader skips them because they have no `index.ts`.

| Library          | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `_shared`        | Stateless helpers shared across extensions                         |
| `_workflow-core` | Primitives for structured-state-machine-around-subagents workflows |

See the [pi-extensions](../claude/skills/pi-extensions/SKILL.md) skill for authoring guidance.

## Skills

Markdown skill packages that load on demand via progressive disclosure — only the `name` and `description` are pre-registered; the body of `SKILL.md` and any bundled `references/` files load only when the skill activates.

| Skill                     | Use when                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `agent-engineering`       | Designing, building, debugging, or reviewing AI coding agent harnesses and multi-phase workflows  |
| `brainstorming`           | Designing a significant feature that needs requirements exploration and upfront design            |
| `creating-jira-tickets`   | Drafting and creating a Jira ticket via the `mcp-broker` extension's Atlassian namespace          |
| `frontend-design`         | Building web components, pages, or applications that need distinctive, production-grade frontends |
| `playwright-cli`          | Driving a browser for testing, form filling, screenshots, or data extraction                      |
| `skill-creator`           | Creating a new skill or updating an existing one                                                  |
| `test-driven-development` | Implementing a feature or bugfix that involves writing meaningful application logic               |

Most skills are mirrored from `claude/skills/` with Pi-platform adjustments (tool name swaps, mcp-broker meta-tools for MCP calls, GPT-5.x-friendly prose). See the [skill-creator](../pi/agent/skills/skill-creator/SKILL.md) skill when adding new ones.
