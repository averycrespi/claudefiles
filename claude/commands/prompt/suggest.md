---
description: "Analyze Claude Code usage history and suggest the most salient custom commands based on patterns"
argument-hint: ""
model: "claude-opus-4-20250514"
---

# Command Suggestion Analyzer

<role>
Claude Code usage analyst specializing in pattern recognition and workflow optimization. Ultrathink through interaction patterns to identify automation opportunities.
</role>

<task>
Analyze Claude Code history from `~/.claude.json` and suggest top 5-10 most valuable custom slash commands based on usage patterns. Output actionable suggestions with names, descriptions, and rationale.
</task>

<workflow>
1. **Check Existing**: Use safe-find to scan `~/.claude/commands` for existing commands
2. **Extract History**: `jq -r '.projects[].history[].display // empty' ~/.claude.json`
3. **Analyze Patterns**: Group by semantic similarity across categories:
   - Testing: "run tests", "fix failing", "test coverage"
   - Git: "commit", "push", "create PR", "merge"
   - Code Quality: "lint", "format", "type check", "refactor"
   - Files: "create", "edit", "update", "delete"
   - Documentation: "README", "docs", "comments"
4. **Score Salience**: Frequency (40%) + Automation potential (40%) + Complexity fit (20%)
5. **Generate Commands**: Format as `category:action` with clear value proposition
</workflow>

<output-format>
# Suggested Custom Commands

*Analysis based on your Claude Code usage history*

## Top Command Suggestions

### `test:fix`
Automatically run test suite, identify failures, and suggest targeted fixes based on error patterns.
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

<implementation>
**Parallel Operations** (Claude 4 optimization):
1. Batch tool calls: Check existing commands + Extract history simultaneously
2. Filter queries: Remove slash commands, single words, entries < 10 chars
3. Normalize text: Lowercase, extract action keywords, categorize
4. Avoid duplicates: Cross-reference against existing commands
5. Quality checks: Ensure >10 history entries for meaningful analysis

**Important**: Never use Read tool on ~/.claude.json - always use jq due to file size
</implementation>

<examples>
**Pattern Recognition**:
- "run tests" + "test failing" + "fix tests" → Suggest: `test:fix`
- "commit changes" + "git commit" + "save work" → Suggest: `git:sync`
- "update README" + "add docs" + "document API" → Suggest: `docs:update`

**Scoring Example**:
- Pattern: "fix linting errors" (15 occurrences)
- Frequency: 15/100 = 0.15 (40% weight)
- Automation: High = 0.8 (40% weight)
- Complexity: Perfect fit = 1.0 (20% weight)
- Salience: (0.15 × 0.4) + (0.8 × 0.4) + (1.0 × 0.2) = 0.58
</examples>

**Mission**: Transform repetitive patterns into actionable custom commands that streamline development workflows.
