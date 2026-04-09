# Claude Code Configuration

This directory manages Claude Code configuration files.

## Directory Structure

```
claude/
├── CLAUDE.md           # Global instructions for all projects
├── settings.json       # Permissions and hooks
├── agents/             # Custom agent definitions
├── commands/           # Slash command definitions
├── hooks/              # PreToolUse hooks (e.g., gitleaks)
├── sandbox/            # Sandbox overrides (settings, CLAUDE.md, scripts)
├── scripts/            # Status line and other scripts
└── skills/             # Custom skill definitions
```

## How It Works

Running `make stow-claude` creates symlinks from `claude/` into `~/.claude/`. For example:

- `claude/settings.json` → `~/.claude/settings.json`
- `claude/skills/brainstorming/SKILL.md` → `~/.claude/skills/brainstorming/SKILL.md`

This means every Claude Code session on your machine picks up these settings, skills, and agents automatically.

## Structured Development Workflow

A workflow for reliably turning ideas into pull requests, adapted from [superpowers](https://github.com/obra/superpowers).

```
/brainstorming → /writing-plans → /executing-plans → /verifying-work → /completing-work
```

**Use the structured workflow** when:

- Building a significant feature that spans multiple files
- You want independent code reviews after each task
- The implementation would benefit from upfront design discussion

**Use Claude Code's built-in planning mode** when:

- Making smaller, well-defined changes
- The scope is clear and doesn't need exploration

## Skills

### Structured Development Workflow

| Skill                     | Purpose                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| `brainstorming`           | Turn ideas into designs through collaborative dialogue                      |
| `writing-plans`           | Create detailed implementation plans with TDD steps                         |
| `executing-plans`         | Execute plans with subagent implementation + reviews                        |
| `executing-plans-quickly` | Execute plans inline without subagents for simple tasks                     |
| `verifying-work`          | Holistic review with parallel reviewers, auto-fix loop, and user escalation |
| `completing-work`         | Clean up plans, reflect on learnings, create or update PR                   |

### Other Workflows

| Skill                   | Purpose                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `assisting-research`    | Structured multi-session research with experiments and HTML reports |
| `creating-jira-tickets` | Draft and create well-structured Jira tickets                       |
| `reviewing-prs`         | Holistic PR review across 6 parallel dimensions                     |
| `troubleshooting`       | Battle buddy for incident response and system troubleshooting       |

### Reference Skills

| Skill                     | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `frontend-design`         | Distinctive, production-grade frontend design and building |
| `launchd-agents`          | Manage macOS launchd user agents                           |
| `playwright-cli`          | Browser automation for testing and data extraction         |
| `skill-creator`           | Guide for creating new skills                              |
| `test-driven-development` | TDD discipline: red-green-refactor cycle                   |
