# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when running inside the sandbox VM.

## Sandbox Environment

You are running inside an isolated Linux VM (Ubuntu 24.04). You have full
permissions — install packages, run any commands, use Docker freely. There
are no permission prompts or hooks.

## MCP Server Usage

MCP server operations often return verbose results (full page contents, large search result sets, detailed metadata). To preserve context, **always delegate high-context MCP operations to a subagent**:

- **Search operations** — result sets contain many fields per entry
- **Page or document reads** — full content can be very large
- **Multi-step lookups** — any task requiring 2+ MCP calls to the same server

Use the Agent tool with a clear prompt describing what to retrieve and how to summarize it. The subagent should return only the relevant details, not raw API output.

**OK to call directly** (without subagent): single-resource lookups when you only need one or two specific fields.

## Conventional Commits

Always use conventional commits when writing commit messages:

**Format:**
```
<type>: <description>

[optional body]
```

**Common Types:**
- `feat` - New feature
- `fix` - Bug fix
- `chore` - Maintenance tasks, dependencies
- `docs` - Documentation changes
- `refactor` - Code restructuring without behavior change
- `test` - Adding/updating tests

**Best Practices:**
- Keep subject line under 50 characters
- Use imperative mood ("add" not "added")
- No period at end of subject
- Separate subject and body with blank line
