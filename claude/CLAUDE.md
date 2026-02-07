# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) across all projects.

## Git Operations

### General Instructions

- Use `git` directly without `-C` flag - the working directory is already the repository root

### Conventional Commits

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

**Optional Scope:**
```
feat(auth): add OAuth2 support
fix(api): handle timeout errors
```

**Breaking Changes:**
```
feat!: change API response format
```

**Examples:**
```
feat: add user profile page
fix: resolve memory leak in connection pool
chore: update dependencies
docs: add API usage examples
refactor(parser): simplify token handling
test: add integration tests for checkout flow
```

**Best Practices:**
- Keep subject line under 50 characters
- Use imperative mood ("add" not "added")
- No period at end of subject
- Separate subject and body with blank line
- Wrap body at 72 characters

## Asking Questions

- **Decisions (2-4 options):** Use `AskUserQuestion` — lead with recommendation and "(Recommended)" label, concise labels, descriptions explain trade-offs
- **Open-ended/yes-no:** Ask conversationally in plain text
- **One question per message** — don't overwhelm with multiple questions
- **Don't ask what you can figure out** — check files, git history, and context first
- **Handle "Other"** — follow up conversationally to understand the alternative
