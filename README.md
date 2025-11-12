# claudefiles

My opinionated resources for working with [Claude Code](https://www.anthropic.com/claude-code).

## Features

- 🤖 **Agents** for research, code review, security analysis, etc.
- ⚡ **Slash commands** for task completion, prompt refinement, and more
- 🎫 **Skills** for Jira integration and skill creation
- 🔒 **Reasonable permissions** for balancing agent autonomy with security
- 🔔 **Notification hooks** to alert you when Claude needs attention
- 🛡️ **Safe wrapper scripts** for granting Claude access to dangerous commands
- 🌳 **Worktree management scripts** for building ergonomic workflows
- 📊 **Status line** showing the current model and session information
- 📖 **Instructions** telling Claude how to use the resources in this repository

## Requirements

- **Claude Code** to make use of these resources
- **macOS** is assumed, but can be adapted for Linux
- **Homebrew** for macOS dependency management
- **Python 3** for the `safe-find` script
- **Bun** for the status line

## Quickstart

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

### Atlassian CLI Setup

For Jira integration capabilities, you must authenticate with the Atlassian CLI:

```sh
# Authenticate with your Jira Cloud instance (one-time setup)
acli jira auth login

# Verify authentication
acli jira auth status
```

Once authenticated, Claude Code will automatically retrieve Jira issue, board, and sprint information when contextually relevant (e.g., when you mention ticket IDs like "PROJ-123" in conversation).

**Note**: ACLI authentication credentials are managed by the CLI itself. Claude Code only executes read-only commands and never handles credentials directly.

## Usage

### Agents

> [Subagents](https://code.claude.com/docs/en/sub-agents) are specialized AI personalities which Claude Code can delegate tasks to.
> They can be manually invoked by the user, or be automatically invoked by Claude Code.
> They have their own isolated context windows, and can share their results with the main context.

- Use the `code-reviewer` agent for detailed code reviews
- Use the `research-assistant` agent for in-depth research and analysis
- Use the `security-analyst` agent to find vulnerabilities

### Slash Commands

> [Slash commands](https://code.claude.com/docs/en/slash-commands) are macros for frequently use prompts.
> They must be manually invoked by the user.

#### Prompt Engineering

- Use `/prompt:refine prompt-file` to improve your existing Claude prompts
- Use `/prompt:suggest` to analyze your Claude usage history and suggest custom commands

#### Task Lifecycle

> Recommendation: Wipe the context with `/clear` between each step. This prevents context bloat.

- Use `/task:specify requirements` to generate a spec through Socratic questioning, written to `SPEC.md`
- Use `/task:plan [spec-file]` to transform a spec into a detailed execution plan, written to `PLAN.md`
- Use `/task:execute [plan-file]` to execute a plan from a file, with progress logged to `EXECUTION.md`
- Use `/task:verify [spec-file]` to validate the final state against a spec, reporting to `VERIFICATION.md`

#### Utilities

- Use `/docs:update` to analyze recent code changes and update documentation automatically
- Use `/git:commit` to analyze staged changes and create smart commits with auto-generated messages
- Use `/git:review github-pr-url` to generate AI-assisted GitHub PR review analysis to augment human reviewers

### Skills

> [Skills](https://www.claude.com/blog/skills) are specialized instruction sets for domain-specific expertise.
> They can be manually invoked by the user, or be automatically invoked by Claude Code.

- Use the `jira` skill to retrieve information about projects, boards, and issues from Jira Cloud
- Use the `skill-creator` skill to create new skills

### Safe Wrapper Scripts

- Claude has been [instructed](./claude/CLAUDE.md) how to use these scripts
- The [permissions](./claude/settings.json) prevents Claude from using the unsafe versions

### Worktree Management Scripts

- Use `worktree-add` to create a new worktree and tmux window for a branch
  - Under the hood, `worktree-init` is called to start a new tmux session
- Use `worktree-attach` to attach to the existing tmux session for the current repository
  - Attaches to the first window in the session if it exists, otherwise returns an error
- Use `worktree-rm` to destroy a worktree and its associated tmux window
- The Claude [hooks](./claude/settings.json) call `worktree-notify` when Claude is done or needs attention

## License

- Repository licensed under [MIT](./LICENSE)
- `skill-creator` skill licensed under [Apache](./claude/skills/skill-creator/LICENSE.txt)
