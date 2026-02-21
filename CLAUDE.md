# CLAUDE.md

Project-specific instructions for this repository.

## Repository Overview

This repository contains opinionated resources for working with Claude Code:
- **Workflow skills** for structured development (adapted from [superpowers](https://github.com/obra/superpowers))
- **cco** for parallel Claude Code workspaces (see [orchestrator README](./orchestrator/README.md))
- **Atlassian MCP** for Jira, Confluence, and Compass
- **Permission and notification settings** for a better experience

See [DESIGN.md](./DESIGN.md) for rationale behind key architectural decisions.

## Public Repository Guidelines

This is a public repository. When creating or modifying content:

- **No internal details** - Don't reference specific companies, projects, team names, or internal URLs
- **No private data** - Don't include API keys, tokens, credentials, or sensitive configuration
- **Generic examples** - Use placeholders like `ABC-123` for tickets, `example.com` for domains
- **Sanitize plans/designs** - Review `.plans/` and `.designs/` files before committing to ensure they contain no proprietary information

## Setup

```bash
./setup.sh
```

See the README for detailed setup instructions.

## Development Workflow

This repository includes a structured development workflow:

```
/architect → /brainstorm → /write-plan → /execute-plan → /complete-work
```

1. **Architecting** - Describe the shape of a system: components, responsibilities, boundaries
2. **Brainstorming** - Design a specific feature through collaborative dialogue
3. **Writing Plans** - Create detailed implementation plans with bite-sized tasks
4. **Executing Plans** - Implement tasks inline with subagent spec and code quality reviews
5. **Completing Work** - Verify tests pass and create PR or keep branch

### When to Use This Workflow

**Use the structured workflow** when:
- Building a significant feature that spans multiple files
- You want independent code reviews after each task
- The implementation would benefit from upfront design discussion

**Use Claude Code's built-in planning mode** when:
- Making smaller, well-defined changes
- The scope is clear and doesn't need exploration
- You want faster iteration with less ceremony

## Skills

### Workflow Skills

| Skill                     | Purpose                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `architecting`            | Describe the shape of a system: components, responsibilities, boundaries |
| `brainstorming`           | Turn ideas into designs through collaborative dialogue      |
| `writing-plans`           | Create detailed implementation plans with TDD steps         |
| `executing-plans`         | Execute plans with subagent implementation + reviews        |
| `executing-plans-quickly` | Execute plans inline without subagents for simple tasks     |
| `completing-work`         | Verify tests, present options, create or update PR          |

### Integrations

| Integration              | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| Atlassian MCP            | Read/write access to Jira, Confluence, and Compass  |
| `searching-datadog-logs` | Search Datadog logs via the API                     |

### Reference Skills

| Skill                     | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `test-driven-development` | TDD discipline: red-green-refactor cycle          |

### Meta Skills

| Skill             | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `creating-skills` | Guide for creating new skills                       |

## Agents

| Agent           | Purpose                                           |
| --------------- | ------------------------------------------------- |
| `code-reviewer` | Review code changes against plans and standards   |

## Testing

Run cco tests:

```bash
cd orchestrator && go test ./... -count=1
```

**Note:** tmux integration tests require sandbox to be disabled (`dangerouslyDisableSandbox`) due to Unix socket access at `/private/tmp/tmux-*/`. On macOS, use `filepath.EvalSymlinks` on temp dirs in Go tests to handle the `/var` → `/private/var` symlink.

## Repository Structure

```
claude/                  # Symlinked to ~/.claude/ via stow
├── CLAUDE.md           # Global instructions for all projects
├── settings.json       # Permissions and hooks
├── agents/             # Custom agent definitions
├── commands/           # Slash command definitions
├── hooks/              # PreToolUse hooks (e.g., gitleaks)
├── scripts/            # Status line and other scripts
└── skills/             # Custom skill definitions
```

## Modifying This Repository

- Edit files in `claude/` directory
- Run `./setup.sh` to apply changes via stow
- Update README.md and this CLAUDE.md when making significant changes

**IMPORTANT:** Never edit files directly in `~/.claude/`. Those are symlinks managed by stow. Always edit the source files in this repository's `claude/` directory. For example:
- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./claude/settings.json`, NOT `~/.claude/settings.json`
