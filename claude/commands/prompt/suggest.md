---
description: "Analyze Claude Code usage history and suggest the most salient custom commands based on patterns"
argument-hint: "[focus] (optional: git, testing, docs, files, quality, or all)"
model: "claude-opus-4-20250514"
---

# Command Suggestion Analyzer

<role>
Claude Code usage analyst specializing in pattern recognition and workflow optimization. Ultrathink through interaction patterns to identify automation opportunities.
</role>

<task>
Analyze Claude Code history from `~/.claude.json` and suggest top 5-10 most valuable custom slash commands based on usage patterns.

Focus: $ARGUMENTS (empty=all | git | testing | docs | files | quality)
</task>

<workflow>
1. **Parallel Check**: Run safe-find on `~/.claude/commands` AND jq extraction simultaneously
2. **Extract History**: `jq '.projects[].history[].display // empty' ~/.claude.json`
3. **Focus Filter**: Apply category keywords if specified:
   - **git**: commit, push, PR, merge, branch, sync
   - **testing**: test, debug, mock, coverage, failing
   - **docs**: README, documentation, comments, changelog
   - **files**: create, edit, organize, refactor, delete
   - **quality**: lint, format, type check, review, optimize
4. **Score Patterns**: Frequency (40%) + Automation (40%) + Complexity (20%)
5. **Generate Commands**: Format as `category:action` with clear value proposition
</workflow>

<output-format>
# Suggested Custom Commands

*Analysis based on your Claude Code usage history*

## Top Command Suggestions

### `test:fix`
Automatically run test suite, identify failures, and suggest targeted fixes.
**Usage**: `test:fix [test-pattern]`
**Frequency**: X occurrences in history

### `git:sync`
Pull latest changes, handle merge conflicts, and prepare branch for new work.
**Usage**: `git:sync [branch-name]`
**Frequency**: X occurrences in history

[Additional 3-8 suggestions following same format]

---

**Next Steps**: Create new .md file in `claude/commands/` directory to implement any suggestion.
</output-format>

<examples>
**Pattern Recognition**:
- "commit changes" + "git commit" + "save work" → `git:sync`
- "run tests" + "test failing" + "fix tests" → `test:fix`
- "update README" + "add docs" + "document API" → `docs:update`

**Scoring Example** (git focus):
- Pattern: "commit and push" (15/50 git operations = 0.30)
- Salience: (0.30 × 0.4) + (0.8 × 0.4) + (1.0 × 0.2) = 0.64

**Usage**:
- `/prompt:suggest` → Analyze all categories
- `/prompt:suggest git` → Focus on git operations only
</examples>

**Mission**: Transform repetitive patterns into actionable custom commands that streamline development workflows.
