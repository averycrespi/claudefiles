# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) across all projects.

## Git Operations

### Conventional Commits

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
