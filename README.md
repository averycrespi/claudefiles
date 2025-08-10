# claudefiles

My opinionated resources for working with [Claude Code](https://www.anthropic.com/claude-code).

## Features

- 🤖 **Agents** for research, code review, security analysis, etc.
- ⚡ **Slash commands** for task completion, prompt refinement, and more
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

## Usage

### Agents

- Use the `code-reviewer` agent for detailed code reviews
- Use the `research-assistant` agent for in-depth research and analysis
- Use the `security-analyst` agent to find vulnerabilities

### Slash Commands

#### Prompt Engineering

- Use `/prompt:refine prompt-file` to improve your existing Claude prompts
- Use `/prompt:suggest` to analyze your Claude usage history and suggest custom commands

#### Task Lifecycle

> Recommendation: Wipe the context with `/clear` between each step. This prevents thought leakage & context bloat.

- Use `/task:specify requirements` to generate a spec through Socratic questioning, written to `SPEC.md`
- Use `/task:plan [spec-file]` to transform a spec into a detailed execution plan, written to `PLAN.md`
- Use `/task:execute [plan-file]` to execute a plan from a file, with progress logged to `EXECUTION.md`
- Use `/task:verify [spec-file]` to validate the final state against a spec, reporting to `VERIFICATION.md`

#### Utilities

- Use `/docs:update` to analyze recent code changes and update documentation automatically
- Use `/git:commit` to analyze staged changes and create smart commits with auto-generated messages

### Safe Wrapper Scripts

- Claude has been [instructed](./claude/CLAUDE.md) how to use these scripts
- The [permissions](./claude/settings.json) prevents Claude from using the unsafe versions

### Worktree Management Scripts

- Use `worktree-add` to create a new worktree and tmux window for a branch
  -  Under the hood, `worktree-init` is called to start a new tmux session
- Use `worktree-rm` to destroy a worktree and its associated tmux window
- The Claude [hooks](./claude/settings.json) call `worktree-notify` when Claude is done or needs attention

## License

[MIT](./LICENSE)
