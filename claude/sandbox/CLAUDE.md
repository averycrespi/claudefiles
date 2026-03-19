# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when running inside the sandbox VM.

## Sandbox Environment

You are running inside an isolated Linux VM (Ubuntu 24.04). You have full
permissions — install packages, run any commands, use Docker freely. There
are no permission prompts or hooks.

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
