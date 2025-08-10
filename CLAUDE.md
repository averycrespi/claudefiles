# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains configuration files, scripts, and resources for working with Claude Code across projects. It's designed to enhance security and productivity when using Claude Code.

## Setup and Installation

Run the setup script to configure the environment:
```bash
./setup.sh
```

This script:
- Installs macOS dependencies via Homebrew (`brew bundle`)
- Uses `stow` to symlink configuration files to `~/.claude/`
- Configures the context7 MCP server for documentation access
- Adds the `scripts/` directory to your PATH

## Safe Command Usage

This repository enforces security through custom "safe" command replacements:

### Safe Find Command
- Use `safe-find [options]` instead of `find [options]`
- Blocks dangerous operations like `-exec`, `-delete`, `-ok`
- Supports basic filtering: `-name`, `-type`, `-maxdepth`, `-path`, `-regex`
- Has built-in limits: max 50 depth, max 100,000 files

### Safe Git Commands
- Use `safe-git-commit "message"` instead of `git commit`
- Use `safe-git-push` instead of `git push`
- Use `safe-gh-pr-create "title" "body"` instead of `gh pr create`

These commands include safety checks:
- Prevents commits to main/master branches
- Requires staged changes with no unstaged changes
- Limits commit size to 10MB
- Runs `gitleaks` to detect secrets before committing

## Repository Architecture

### Core Structure
- `claude/` - Claude Code configuration files
  - `CLAUDE.md` - Global instructions for all projects
  - `settings.json` - Permissions and hooks configuration
  - `agents/` - Custom agent definitions
  - `commands/` - Slash command definitions
- `scripts/` - Security-enhanced command line tools
- `setup.sh` - Repository setup and configuration script
- `Brewfile` - macOS dependencies managed by Homebrew

### Agent System
The repository includes specialized agents for different tasks:

#### research-assistant
- Use when investigating technical concepts or best practices
- Synthesizes information from multiple authoritative sources
- Provides structured output with citations and recommendations
- Accessible via the Task tool with `subagent_type: "research-assistant"`

#### security-analyst
- Analyzes code for security vulnerabilities and potential exploits
- Reviews implementations for SQL injection, XSS, authentication flaws, cryptographic weaknesses
- Automatically invoked after implementing security-sensitive features
- Accessible via the Task tool with `subagent_type: "security-analyst"`

#### code-reviewer
- Reviews code for quality, best practices, potential bugs, and performance issues
- Checks adherence to conventions, identifies code smells, and suggests improvements
- Automatically invoked after writing or modifying significant code
- Accessible via the Task tool with `subagent_type: "code-reviewer"`

### Command Extensions
Custom slash commands are available in `claude/commands/`:

#### Task Command System
Comprehensive workflow for systematic project transformation:
- `/task:specify` - Create technical specifications through Socratic questioning → `SPEC.md`
- `/task:plan` - Generate detailed implementation plans with parallel research → `PLAN.md`
- `/task:execute` - Execute plans systematically with progress tracking → `EXECUTION.md`
- `/task:verify` - Validate final system state against original specifications → `VERIFICATION.md`

**Command Workflow**: `/task:specify` → `/task:plan` → `/task:execute` → `/task:verify`

**Key Features**:
- Agent integration (research-assistant, security-analyst, code-reviewer)
- Safety-first approach using safe-git commands
- TodoWrite integration for systematic task management
- Auto-calls `/docs:update` when behavior changes
- Comprehensive validation at each step

#### Other Commands
- `/docs:update` - Analyze recent code changes and update documentation automatically
- `/git:commit` - Smart commit with change analysis, safety checks, and auto-generated messages
- `/prompt:refine` - Refine and improve prompts
- `/prompt:suggest` - Analyze Claude Code usage history and suggest custom commands based on patterns

### Security Configuration
The `claude/settings.json` file enforces strict security policies:
- Allows only safe operations (specific bash commands, git operations)
- Blocks dangerous commands (`find`, `git commit`, `git push`)
- Requires using safe wrapper scripts for potentially dangerous operations
- Includes hooks for desktop notifications on significant events

## Working with This Repository

### Modifying Configuration
- Edit files in `claude/` directory
- Run `./setup.sh` again to apply changes via stow
- Configuration changes affect all projects globally
- **Important**: Update the README.md and this CLAUDE.md file when making significant changes to document new features, commands, or architectural changes

### Adding New Safe Commands
1. Create script in `scripts/` directory
2. Make executable (`chmod +x`)
3. Add corresponding permission to `claude/settings.json`
4. Test thoroughly before use

### MCP Integration
The repository is configured to use the context7 MCP server for accessing up-to-date library documentation. This is automatically configured during setup.
