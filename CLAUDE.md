# CLAUDE.md

Project-specific instructions for this repository.

## Repository Overview

This repository contains opinionated resources for working with Claude Code:
- **Workflow skills** for structured development (adapted from [superpowers](https://github.com/obra/superpowers))
- **Atlassian MCP** for Jira, Confluence, and Compass
- **Worktree scripts** for parallel development with tmux
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
/brainstorm → /write-plan → /execute-plan → /complete-work
```

1. **Brainstorming** - Explore requirements and design through collaborative dialogue
2. **Writing Plans** - Create detailed implementation plans with bite-sized tasks
3. **Executing Plans** - Implement tasks inline with subagent spec and code quality reviews
4. **Completing Work** - Verify tests pass and create PR or keep branch

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

| Skill             | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `brainstorming`   | Turn ideas into designs through collaborative dialogue      |
| `writing-plans`   | Create detailed implementation plans with TDD steps         |
| `executing-plans` | Execute plans with inline implementation + subagent reviews |
| `completing-work` | Verify tests, present options, create PR                    |

### Integrations

| Integration   | Purpose                                             |
| ------------- | --------------------------------------------------- |
| Atlassian MCP | Read/write access to Jira, Confluence, and Compass  |

### Reference Skills

| Skill                     | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `asking-questions`        | Consistent question patterns for workflow skills  |
| `test-driven-development` | TDD discipline: red-green-refactor cycle          |

### Meta Skills

| Skill             | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `using-skills`    | Skill enforcement rules (injected at session start) |
| `creating-skills` | Guide for creating new skills                       |

## Agents

| Agent           | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `code-reviewer` | Review code changes against plans and standards |

## Scripts

### Worktree Management

For parallel development using Git worktrees and tmux:

| Script                       | Purpose                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `worktree-init`              | Start a new tmux session for the current repository                         |
| `worktree-attach`            | Attach to the tmux session for the current repository                       |
| `worktree-add <branch-name>` | Create a new worktree and tmux window for a branch                          |
| `worktree-rm <branch-name>`  | Destroy the worktree and tmux window for a branch                           |
| `worktree-notify`            | Add notification bell to tmux window for the current branch (used by hooks) |

## Repository Structure

```
claude/                  # Symlinked to ~/.claude/ via stow
├── CLAUDE.md           # Global instructions for all projects
├── settings.json       # Permissions and hooks
├── agents/             # Custom agent definitions
├── commands/           # Slash command definitions
├── hooks/              # Session hooks (skill enforcement, etc.)
└── skills/             # Custom skill definitions
scripts/                # Worktree and utility scripts
```

## Modifying This Repository

- Edit files in `claude/` directory
- Run `./setup.sh` to apply changes via stow
- Update README.md and this CLAUDE.md when making significant changes
