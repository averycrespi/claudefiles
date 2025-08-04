# claudefiles

My opinionated resources for working with [Claude Code](https://www.anthropic.com/claude-code).

## Features

- 🤖 **Agents** for research, code review, security analysis, etc.
- ⚡ **Slash commands** for task completion and prompt refinement
- 🔒 **Reasonable permissions** for balancing agent autonomy with security
- 🔔 **Notification hooks** to alert you when Claude needs attention
- 🛡️ **Safe wrapper scripts** for granting Claude access to dangerous commands
- 🌳 **Worktree management scripts** for building ergonomic workflows
- 📖 **Instructions** telling Claude how to use the resources in this repository

## Requirements

- **Claude Code** to make use of these resources
- **macOS** is assumed, but can be adapted for Linux
- **Homebrew** for macOS dependency management
- **Python 3** for the `safe-find` script

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

- Ask Claude to use the `code-reviewer` for detailed code reviews
- Ask Claude to use the `research-assistant` for in-depth research and analysis
- Ask Claude to use the `security-analyst` to find vulnerabilities

### Slash Commands

- Use `/docs:update` to analyze recent code changes and update documentation automatically
- Use `/git:commit` to analyze staged changes and create smart commits with auto-generated messages
- Use `/prompt:refine` to improve your existing Claude prompts
- Use `/prompt:suggest` to analyze your Claude usage history and suggest custom commands
- Use `/task:plan` to create a detailed plan for Claude to execute
  - Recommendation: use Claude to iterate on the plan file until you are satisfied
- Use `/task:exec` to execute a plan from a file
  - Recommendation: before executing a plan, wipe the context with `/clear` to prevent context bloat

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
