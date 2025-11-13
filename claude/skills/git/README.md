# Git Skill

Always-active skill that ensures Claude Code follows Git best practices with safe commands and conventional commit formatting.

## What It Does

Provides bundled safe Git scripts with security checks (secret detection, branch protection, size limits) and enforces conventional commit format for all Git operations.

## Bundled Scripts

Located in `scripts/`:
- `safe-git-commit` - Replaces `git commit` with gitleaks scanning and safety checks
- `safe-git-push` - Replaces `git push` with branch protection
- `safe-gh-pr-create` - Replaces `gh pr create` with duplicate detection and safety checks

## Usage

Claude automatically uses these safe commands for all Git operations. The skill enforces conventional commit format:

```
feat: add user profile page
fix: resolve memory leak in connection pool
chore: update dependencies
```

## Documentation

See [SKILL.md](SKILL.md) for complete documentation including command syntax, conventional commit details, and workflow guidance.
