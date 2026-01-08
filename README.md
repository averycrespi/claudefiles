# claudefiles

My opinionated resources for working with [Claude Code](https://www.anthropic.com/claude-code).

## Features

- **Workflow skills** for structured development (adapted from [superpowers](https://github.com/obra/superpowers))
- **Integration skills** for Jira and Confluence
- **Worktree scripts** for parallel development with tmux
- **Permission and notification settings** for a better experience

## Requirements

- [Claude Code](https://claude.ai/download) to make use of these resources
- [Homebrew](https://brew.sh/) for macOS dependency management
- [Bun](https://bun.sh/) for the status line
- macOS is assumed, but can be adapted for Linux

## Setup

### Quickstart

```sh
git clone git@github.com:averycrespi/claudefiles.git
cd claudefiles
./setup.sh
```

The setup script will:
- Install dependencies via Homebrew
- Symlink configuration files to `~/.claude/`
- Configure MCP servers in Claude Code
- Add the scripts directory to your `PATH`

### Jira Integration

To use the `jira` skill, authenticate with the Atlassian CLI:

```sh
acli jira auth login
acli jira auth status  # Verify authentication
```

For more information, see the [Jira skill README](./claude/skills/jira/README.md).

### Confluence Integration

To use the `confluence` skill, export the following environment variables:

```sh
# Add to your shell profile (~/.zshrc, ~/.bashrc, etc.)
export CONFLUENCE_DOMAIN="mycompany.atlassian.net"
export CONFLUENCE_EMAIL="your.email@example.com"
export CONFLUENCE_API_TOKEN="your-api-token-here"
```

For more information, see the [Confluence skill README](./claude/skills/confluence/README.md).

## Workflow

### The Development Workflow

This repository includes a structured development workflow adapted from [superpowers](https://github.com/obra/superpowers):

```
/brainstorm → /write-plan → /execute-plan → /complete-work
```

1. **Brainstorming** - Explore requirements and design through collaborative dialogue
2. **Writing Plans** - Create detailed implementation plans with bite-sized tasks
3. **Executing Plans** - Implement tasks with spec and code quality reviews
4. **Completing Work** - Verify tests pass and create PR or keep branch

### When to Use This Workflow

**Use the structured workflow** (`/brainstorm` → `/write-plan` → `/execute-plan`) when:
- Building a significant feature that spans multiple files
- You want independent code reviews after each task
- The implementation would benefit from upfront design discussion
- You want a written plan you can review before execution

**Use Claude Code's built-in planning mode** when:
- Making smaller, well-defined changes
- The scope is clear and doesn't need exploration
- You want faster iteration with less ceremony
- The task is straightforward enough to not need independent reviews

### Slash Commands

| Command          | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `/brainstorm`    | Explore requirements and design before implementation        |
| `/write-plan`    | Create detailed implementation plan with bite-sized tasks    |
| `/execute-plan`  | Execute plan with inline implementation and subagent reviews |
| `/complete-work` | Verify tests and present options to finish work              |

## Skills

### Workflow Skills

Adapted from [superpowers](https://github.com/obra/superpowers). These skills guide structured development:

| Skill             | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `brainstorming`   | Turn ideas into designs through collaborative dialogue      |
| `writing-plans`   | Create detailed implementation plans with TDD steps         |
| `executing-plans` | Execute plans with inline implementation + subagent reviews |
| `completing-work` | Verify tests, present options, create PR                    |

### Integration Skills

Connect to external services for seamless context:

| Skill        | Purpose                                              |
| ------------ | ---------------------------------------------------- |
| `jira`       | Read-only access to Jira issues, boards, and sprints |
| `confluence` | Search and read Confluence documentation             |

### Reference Skills

Referenced by other skills for development practices:

| Skill                     | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `test-driven-development` | TDD discipline: red-green-refactor cycle |

### Meta Skills

For extending Claude Code's capabilities:

| Skill             | Purpose                       |
| ----------------- | ----------------------------- |
| `creating-skills` | Guide for creating new skills |

## Agents

| Agent           | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `code-reviewer` | Review code changes against plans and standards |

## Scripts

### Worktree Management

For parallel development using Git worktrees and tmux:

| Script            | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `worktree-init`   | Start a new tmux session for the current repository  |
| `worktree-add`    | Create a new worktree and tmux window for a branch   |
| `worktree-attach` | Attach to an existing tmux session                   |
| `worktree-rm`     | Destroy a worktree and its tmux window               |
| `worktree-notify` | Add notification bell to tmux window (used by hooks) |

## Settings

See [settings.json](./claude/settings.json) for all settings.

**Permissions:**
- Common Unix commands
- Git operations
- Skills and their scripts
- Context7 MCP tools

**Hooks:**
- Desktop notification when Claude needs attention or finishes

**Status line:**
- [ccusage](https://ccusage.com/guide/statusline) integration for usage tracking

## Attribution

The workflow skills in this repository are adapted from [superpowers](https://github.com/obra/superpowers) by Jesse Vincent, licensed under MIT.

The `creating-skills` skill is adapted from [Anthropic's skill-creator](https://github.com/anthropics/skills/tree/main/skill-creator), licensed under Apache 2.0.

## License

- Repository licensed under [MIT](./LICENSE)
- Individual skills and agents may have their own licenses
