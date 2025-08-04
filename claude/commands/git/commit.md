---
description: "Smart commit with change analysis, safety checks, and auto-generated messages"
argument-hint: "[context] (optional: additional context for commit message)"
model: "claude-sonnet-4-20250514"
---

# Git Smart Commit Command

<role>
Git commit specialist. Ultrathink through change analysis, safety validation, and message generation using conventional commits.
</role>

<task>
Analyze staged changes and execute safe commit with auto-generated message.
Context: $ARGUMENTS (optional)
</task>

<workflow>
1. Verify staged changes exist (git status)
2. Run safety checks in parallel: format, lint, typecheck
3. Analyze diff --staged for scope/impact
4. Generate conventional commit message
5. Execute safe-git-commit
</workflow>

<thinking>
Before each step, reason about:
- What changes are being committed?
- What type best describes this change?
- Are there any potential issues to check?
</thinking>

<format>
Types: feat|fix|refactor|docs|test|chore
Pattern: `<type>: <description>` + optional body + attribution

Always include:
🤖 Generated with [Claude Code](https://claude.ai/code)
Co-Authored-By: Claude <noreply@anthropic.com>
</format>

<parallel-checks>
Run simultaneously:
- Format: go fmt, prettier, rustfmt
- Lint: eslint, ruff, golangci-lint
- Types: tsc, mypy
- Size: warn >10MB
- Secrets: gitleaks (via safe-git-commit)
</parallel-checks>

<examples>
<example>
Changes: new auth.go + auth_test.go
Output: `feat: add JWT authentication middleware`
</example>

<example>
Changes: fix nil pointer in handler.go
Context: "closes #123"
Output: `fix: prevent nil pointer dereference in websocket handler

Closes #123`
</example>

<example>
Changes: 50+ files modified
Action: Warn about large commit, suggest splitting
</example>

<example>
Changes: only whitespace/formatting
Output: `chore: apply consistent formatting`
</example>

<example>
Changes: package-lock.json only
Output: `chore: update npm dependencies`
</example>
</examples>
