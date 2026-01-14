# claudefiles

My opinionated resources for working with [Claude Code](https://www.anthropic.com/claude-code).

## Features

- [Structured Development Workflow](#structured-development-workflow) - Brainstorm, plan, execute, and complete work with independent reviews
- [Worktree Scripts](#worktree-scripts) - Parallel development using Git worktrees and tmux
- [Integrations](#integrations) - Connect to Jira and Confluence for seamless context

## Requirements

- [Claude Code](https://github.com/anthropics/claude-code)
- [Homebrew](https://brew.sh/) for macOS dependency management
- [Bun](https://bun.sh/) for the status line
- macOS is assumed, but can be adapted for Linux

## Quick Start

```sh
git clone git@github.com:averycrespi/claudefiles.git
cd claudefiles
./setup.sh
```

The setup script will install dependencies, symlink configuration files to `~/.claude/`, configure MCP servers, and add scripts to your `PATH`.

---

## Structured Development Workflow

A structured approach to development adapted from [superpowers](https://github.com/obra/superpowers):

```
/brainstorm
    │
    ├── Ask clarifying questions
    ├── Explore 2-3 approaches
    ├── Present design for validation
    ├── Commit design document
    └── Ask user if they want to write a plan
         │
         ▼
/write-plan
    │
    ├── Break work into bite-sized tasks
    ├── Specify exact files and code
    ├── Save implementation plan
    └── Ask user if they want to execute the plan
         │
         ▼
/execute-plan
    │
    ├── For each task:
    │       ├── Implement using TDD
    │       ├── Commit changes
    │       ├── Spec review (subagent)
    │       ├── Code quality review (subagent)
    │       └── Iterate until reviews pass
    └── Complete the work
         │
         ▼
/complete-work
    │
    ├── Verify tests pass
    └── Create PR or keep branch
```

Each command is a thin wrapper around its corresponding skill:

| Command          | Skill             | Description                                                    |
| ---------------- | ----------------- | -------------------------------------------------------------- |
| `/brainstorm`    | `brainstorming`   | Explore requirements and design through collaborative dialogue |
| `/write-plan`    | `writing-plans`   | Create detailed implementation plan with bite-sized tasks      |
| `/execute-plan`  | `executing-plans` | Execute plan with inline implementation and subagent reviews   |
| `/complete-work` | `completing-work` | Verify tests pass and create PR or keep branch                 |

### When to Use This Workflow

**Use the structured workflow** when:
- Building a significant feature that spans multiple files
- You want independent code reviews after each task
- The implementation would benefit from upfront design discussion
- You want a written plan you can review before execution

**Use Claude Code's built-in planning mode** when:
- Making smaller, well-defined changes
- The scope is clear and doesn't need exploration
- You want faster iteration with less ceremony

---

## Worktree Scripts

Scripts for parallel development using Git worktrees and tmux:

| Script                       | Purpose                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `worktree-init`              | Start a new tmux session for the current repository                         |
| `worktree-attach`            | Attach to an existing tmux session for the current repository               |
| `worktree-add <branch-name>` | Create a new worktree and tmux window for a branch                          |
| `worktree-rm <branch-name>`  | Destroy the worktree and tmux window for a branch                           |
| `worktree-notify`            | Add notification bell to tmux window for the current branch (used by hooks) |

---

## Integrations

### Jira

Read-only access to Jira issues, boards, and sprints via the Atlassian CLI.

**Setup:**

```sh
acli jira auth login
acli jira auth status  # Verify authentication
```

For more information, see the [Jira skill README](./claude/skills/jira/README.md).

### Confluence

Search and read Confluence documentation.

**Setup:**

```sh
# Add to your shell profile (~/.zshrc, ~/.bashrc, etc.)
export CONFLUENCE_DOMAIN="mycompany.atlassian.net"
export CONFLUENCE_EMAIL="your.email@example.com"
export CONFLUENCE_API_TOKEN="your-api-token-here"
```

For more information, see the [Confluence skill README](./claude/skills/confluence/README.md).

---

## Miscellaneous

### Reference Skills

| Skill                     | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `test-driven-development` | TDD discipline: red-green-refactor cycle |

### Meta Skills

| Skill             | Purpose                       |
| ----------------- | ----------------------------- |
| `creating-skills` | Guide for creating new skills |

### Agents

| Agent           | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `code-reviewer` | Review code changes against plans and standards |

### Settings

Configured in [settings.json](./claude/settings.json):

- **Permissions** - Common Unix commands, Git operations, skills and their scripts, Context7 MCP tools
- **Hooks** - Desktop notification when Claude needs attention or finishes
- **Status line** - [ccusage](https://ccusage.com/guide/statusline) integration for usage tracking

---

## Attribution

The workflow skills in this repository are adapted from [superpowers](https://github.com/obra/superpowers) by Jesse Vincent, licensed under MIT.

The `creating-skills` skill is adapted from [Anthropic's skill-creator](https://github.com/anthropics/skills/tree/main/skill-creator), licensed under Apache 2.0.

## License

- Repository licensed under [MIT](./LICENSE)
- Individual skills and agents may have their own licenses
