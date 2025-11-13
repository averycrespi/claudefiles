---
name: git
description: Always-active skill providing Git workflow guidance. Use safe Git commands and conventional commit format for all Git operations.
---

# Git

## Overview

Use safe Git commands for all Git operations. Write commits using conventional commit format.

**IMPORTANT:** Only use `safe-git-push` and `safe-gh-pr-create` when the user explicitly requests it. Never push or create PRs proactively.

## Safe Git Commands

**ALWAYS use these safe commands instead of standard Git commands:**

- `safe-git-commit "message"` - Replaces `git commit`
  - Runs gitleaks to detect secrets
  - Enforces 10MB size limit
  - Requires clean staging (no unstaged changes)

- `safe-git-push` - Replaces `git push` (ONLY use when explicitly requested)
  - Blocks pushes to main/master branches
  - Requires completely clean working tree
  - No untracked files, no unstaged/staged changes

- `safe-gh-pr-create "title" "body"` - Replaces `gh pr create` (ONLY use when explicitly requested)
  - Creates draft PR by default
  - Blocks PRs from main/master branches
  - Checks for duplicate PRs
  - Requires branch synced with remote

**These commands accept no other flags or arguments.**

## Conventional Commits

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

## Workflow

Standard sequence: `commit → push → PR`

1. Stage changes: `git add <files>`
2. Commit: `safe-git-commit "feat: add new feature"`
3. Push: `safe-git-push`
4. Create PR: `safe-gh-pr-create "Feature: New feature" "Description of changes"`
