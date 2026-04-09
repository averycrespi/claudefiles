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
└── skills/         # Custom skills (broker-cli)
```

## How It Works

Running `make stow-pi` creates symlinks from `pi/agent/` into `~/.pi/agent/`. Edits here take effect immediately — no need to re-stow after changing files.

## Extensions

TypeScript modules that customize the Pi agent. Type-check with `make typecheck`.

| Extension                | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `ask-user`               | Improved TUI for user questions                       |
| `autoformat`             | Auto-run gofmt and prettier on edited files           |
| `broker-guard`           | Block broker-backed commands without skill invocation |
| `compact-read`           | Compress verbose read output                          |
| `context-files-reminder` | Inject context file contents into LLM calls           |
| `subagents`              | Dynamic subagent loading and dispatch                 |
| `usage`                  | Session usage tracking                                |
| `web`                    | Web search and fetch tools                            |

See the [pi-extensions](../../claude/skills/pi-extensions/SKILL.md) skill for authoring guidance.
