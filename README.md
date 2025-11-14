# claudefiles

My opinionated resources for working with [Claude Code](https://www.anthropic.com/claude-code).

## Features

- 🤖 **Agents** for research, code reviews, and security analysis
- ⚡ **Commands** for task workflows and prompt engineering
- 🧠 **Skills** for Git, Jira, Confluence, and skill creation
- 📜 **Scripts** for parallel development using Git worktrees
- ⚙️ **Settings** for permissions, notifications, and the status line

## Requirements

- [Claude Code](https://www.claude.com/product/claude-code) to make use of these resources
- [Homebrew](https://brew.sh/) for macOS dependency management
- [Bun](https://bun.com/) for the status line
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

### Atlassian CLI

To use the `jira` skill, you must authenticate with the Atlassian CLI:

```sh
# Authenticate with your Jira Cloud instance (one-time setup)
acli jira auth login

# Verify authentication
acli jira auth status
```

### Confluence

To use the `confluence` skill, you must export the following environment variable:

```sh
# Add to your shell profile (~/.zshrc, ~/.bashrc, etc.)
export CONFLUENCE_DOMAIN="mycompany.atlassian.net"  # Your Confluence domain
export CONFLUENCE_EMAIL="your.email@example.com"    # Your email address
export CONFLUENCE_API_TOKEN="your-api-token-here"   # API token from Atlassian
```

To create an API token:
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a label (e.g., "Claude Code")
4. Copy the token and add it to your environment variables

## Components

### Agents

> [Agents](https://code.claude.com/docs/en/sub-agents) are specialized AI personalities which Claude Code can delegate tasks to.
> They can be manually invoked by the user, or be automatically invoked by Claude Code.
> Each agent has its own isolated context windows, and can share its results with the main context.

- Use the [`code-reviewer`](./claude/agents/code-reviewer.md) agent for reviewing code
- Use the [`research-assistant`](./claude/agents/research-assistant.md) agent for in-depth research and analysis
- Use the [`security-analyst`](./claude/agents/security-analyst.md) agent to find vulnerabilities

### Commands

> [Commands](https://code.claude.com/docs/en/slash-commands) are macros for frequently use prompts.
> They must be manually invoked by the user.

Task workflow:
- Use `/task:specify requirements` to generate a spec through Socratic questioning, written to `SPEC.md`
- Use `/task:plan [spec-file]` to transform a spec into a detailed execution plan, written to `PLAN.md`
- Use `/task:execute [plan-file]` to execute a plan from a file, with progress logged to `EXECUTION.md`
- Use `/task:verify [spec-file]` to validate the final state against a spec, reporting to `VERIFICATION.md`
- Recommendation: To prevent context bloat, run `/clear` between each step

Prompt engineering:
- Use `/prompt:refine prompt-file` to improve your existing Claude prompts
- Use `/prompt:suggest` to analyze your Claude usage history and suggest custom commands

### Skills

> [Skills](https://www.claude.com/blog/skills) are specialized instruction sets for domain-specific expertise.
> They can be manually invoked by the user, or be automatically invoked by Claude Code.

- Use the [`jira`](./claude/skills/jira/README.md) skill to retrieve information about projects, boards, and issues from Jira Cloud
- Use the [`confluence`](./claude/skills/confluence/README.md) skill to search and read documentation from Confluence
- Use the [`git`](./claude/skills/git/README.md) skill to enforce safe Git commands and conventional commit format
- Use the [`skill-creator`](./claude/skills/skill-creator/README.md) skill to create new skills

### Scripts

Worktree management:
- Use [`worktree-init`](./scripts/worktree-init) to start a new tmux session for the current repository
- Use [`worktree-add`](./scripts/worktree-add) to create a new worktree and tmux window for a branch
- Use [`worktree-attach`](./scripts/worktree-attach) to attach to an existing tmux session for the current repository
- Use [`worktree-rm`](./scripts/worktree-rm) to destroy a worktree and its associated tmux window
- The Claude Code [hooks](./claude/settings.json) will call [`worktree-notify`](./scripts/worktree-notify) when Claude is done or needs attention

### Settings

> See [settings.json](./claude/settings.json) for all settings.

Allowed permissions:
- Common Unix commands
- Read-only Git operations
- Scripts included in skills
- Skills themslves
- Context7 MCP tools

Denied permissions:
- Git commit and push commands; use safe wrappers instead
- GitHub create PR command; use safe wrapper instead

Hooks:
- Send a notification when Claude needs your attention

Status line:
- Configures the [ccusage status line](https://ccusage.com/guide/statusline)

## License

- Repository licensed under [MIT](./LICENSE)
- `skill-creator` skill licensed under [Apache](./claude/skills/skill-creator/LICENSE.txt)
