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

### Safe Git Commands
- Use `safe-git-commit "message"` instead of `git commit`
- Use `safe-git-push` instead of `git push`
- Use `safe-gh-pr-create "title" "body"` instead of `gh pr create`

These commands include safety checks:
- Prevents commits to main/master branches
- Requires staged changes with no unstaged changes
- Limits commit size to 10MB
- Runs `gitleaks` to detect secrets before committing

### Confluence Search Command
- Use `confluence-search "query"` to search Confluence for pages
- Returns JSON output with search results for easy parsing
- Supports optional `--limit N` flag to control number of results (default: 10)
- Requires environment variables: `CONFLUENCE_DOMAIN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`
- Auto-detects API path based on domain (Atlassian Cloud vs self-hosted)
- Uses CQL (Confluence Query Language) for full-text search

Example usage:
```bash
confluence-search "project documentation"
confluence-search "API guide" --limit 20
confluence-search "onboarding" | jq '.results[].title'
```

### Confluence View Command
- Use `confluence-view <page-id-or-url>` to read a specific Confluence page
- Returns JSON output with page metadata and content
- Accepts numeric page ID or full Confluence URL with pageId parameter
- Supports `--metadata` flag to return metadata only (no content) for lightweight queries
- Requires environment variables: `CONFLUENCE_DOMAIN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`
- Auto-detects API path based on domain (Atlassian Cloud vs self-hosted)

Example usage:
```bash
confluence-view 123456789
confluence-view "https://mycompany.atlassian.net/wiki/viewpage.action?pageId=123456789"
confluence-view 123456789 --metadata
confluence-view 123456789 | jq '.title'
confluence-view 123456789 | jq '.content' | pandoc -f html -t markdown
```

## Repository Architecture

### Core Structure
- `claude/` - Claude Code configuration files
  - `CLAUDE.md` - Global instructions for all projects
  - `settings.json` - Permissions and hooks configuration
  - `agents/` - Custom agent definitions
  - `commands/` - Slash command definitions
  - `skills/` - Custom skill definitions
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
- `/git:review` - AI-assisted GitHub PR review analysis to augment human reviewers with repository context
- `/prompt:refine` - Refine and improve prompts
- `/prompt:suggest` - Analyze Claude Code usage history and suggest custom commands based on patterns

### Skills System
The repository includes custom skills that extend Claude Code's capabilities:

#### Jira Integration Skill
Automatic integration with Jira Cloud for seamless issue tracking:
- **Activation**: Automatically detects ticket IDs (e.g., "PROJ-123") and Jira-related keywords
- **Capabilities**: View issues, search with JQL, list boards/sprints, fetch project information
- **Security**: Read-only access enforced through permissions; no data modification allowed
- **Requirements**: Atlassian CLI (ACLI) installed and authenticated
- **Architecture**: Domain-based reference organization for efficient token usage

To enable Jira integration:
1. Install ACLI: `brew install acli` (included in Brewfile)
2. Authenticate: `acli jira auth login`
3. Verify: `acli jira auth status`

The skill provides transparent Jira context without leaving your IDE, supporting:
- Direct ticket lookup: "What's PROJ-123?"
- Natural queries: "Show me current sprint tickets"
- Multi-ticket analysis: Automatically fetches multiple ticket IDs in parallel
- JQL searches: "Find high priority bugs assigned to me"

**Reference Structure**: The skill uses domain-specific reference files for efficient context loading:
- `auth.md` - Authentication commands
- `workitems.md` - Work item operations
- `projects.md` - Project commands
- `boards-sprints.md` - Board and sprint operations
- `jql.md` - JQL query patterns
- `optimization.md` - Performance strategies
- `error-handling.md` - Error recovery patterns

This organization enables selective loading based on query type, reducing token consumption by ~55% for single-domain queries.

See `claude/skills/jira/SKILL.md` for detailed documentation.

#### Skill Creator
Guide for creating effective skills that extend Claude Code's capabilities:
- **Activation**: Use when users want to create or update custom skills
- **Capabilities**: Provides templates, validation scripts, and best practices for skill development
- **Features**: Includes init, validation, and packaging scripts for skill lifecycle management
- **Documentation**: Comprehensive guide on skill structure, activation patterns, and tool integration

The skill-creator helps you build skills that integrate specialized knowledge, workflows, or tool integrations into Claude Code. It includes Python scripts for initializing new skills, validating skill structure, and packaging skills for distribution.

See `claude/skills/skill-creator/SKILL.md` for detailed documentation.

#### Confluence Integration Skill
Transparent integration with Confluence for accessing documentation and wiki content:
- **Activation**: Automatically detects Confluence keywords ("confluence", "wiki", "documentation"), Confluence URLs, or numeric page IDs in Confluence context
- **Capabilities**: Search Confluence pages with CQL, retrieve page content and metadata, convert HTML to Markdown
- **Commands**: `confluence-search` for searching, `confluence-view` for retrieving specific pages
- **Security**: Read-only access via REST API; no data modification supported
- **Requirements**: Environment variables `CONFLUENCE_DOMAIN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`

To enable Confluence integration:
1. Generate API token: https://id.atlassian.com/manage-profile/security/api-tokens (for Atlassian Cloud)
2. Set environment variables in your shell profile (`~/.zshrc` or `~/.bashrc`):
   ```bash
   export CONFLUENCE_DOMAIN="company.atlassian.net"
   export CONFLUENCE_EMAIL="your.email@company.com"
   export CONFLUENCE_API_TOKEN="your-token-here"
   ```
3. Scripts are automatically available after running `setup.sh`

The skill provides seamless documentation access without leaving the development environment, supporting:
- Keyword-based search: "Find documentation about authentication"
- Direct page access: "Show me page 123456789"
- URL-based retrieval: Works with any Confluence URL format
- Content conversion: Pipe to `pandoc` for Markdown conversion

**Reference Structure**: The skill uses reference files for detailed guidance:
- `cql-patterns.md` - CQL query patterns and natural language mapping
- `troubleshooting.md` - Authentication, API errors, and debugging tips

The skill automatically handles API path detection for both Atlassian Cloud and self-hosted instances.

See `claude/skills/confluence/SKILL.md` for detailed documentation.

### Security Configuration
The `claude/settings.json` file enforces strict security policies:
- Allows only safe operations (specific bash commands, git operations)
- Blocks dangerous commands (`find`, `git commit`, `git push`)
- Requires using safe wrapper scripts for potentially dangerous operations
- Includes hooks for desktop notifications on significant events
- Jira integration: Allows read-only ACLI commands, blocks all write operations
- Thinking mode: Configured with `alwaysThinkingEnabled: false` for Claude Code 2.0

### Worktree Management
The `scripts/` directory includes tmux-integrated worktree management tools:

#### worktree-add
Creates a new git worktree and tmux window for a branch:
```bash
worktree-add <branch-name>
```
- Creates worktree in `../worktrees/<repo-name>/<branch-name>/`
- Launches tmux session `<repo-name>-worktree` (or uses existing)
- Creates new tmux window named after the branch
- Automatically starts Claude Code in the worktree directory
- Idempotent: safe to run multiple times

#### worktree-attach
Attaches to an existing tmux session for the current worktree:
```bash
worktree-attach
```
- Detects whether you're in main repository or a worktree
- Attaches to the appropriate tmux window in the worktree session
- If already in tmux: switches to the target session/window
- If not in tmux: attaches to the session and selects the window
- Useful for returning to Claude Code sessions after detaching

#### worktree-rm
Removes a git worktree and its tmux window:
```bash
worktree-rm <branch-name>
```
- Cleans up both the worktree directory and tmux window
- Ensures proper cleanup of git worktree references

The notification hooks in `settings.json` integrate with these scripts to provide desktop notifications when Claude Code completes tasks or needs attention.

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
