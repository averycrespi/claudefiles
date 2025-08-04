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
Analyze Claude Code history from `~/.claude.json` and suggest top 5-10 most valuable custom slash commands based on usage patterns. Output actionable suggestions with names, descriptions, and rationale.

Focus: $ARGUMENTS (empty=all categories | git | testing | docs | files | quality)
</task>

<workflow>
1. **Check Existing**: Use safe-find to scan `~/.claude/commands` for existing commands
2. **Extract History**: Use efficient single jq command: `jq '.projects[].history[].display // empty' ~/.claude.json`
3. **Filter by Focus**: If focus specified, filter patterns to relevant category
4. **Analyze Patterns**: Group by semantic similarity across categories:
   - **git**: "commit", "push", "create PR", "merge", "branch", "sync", "rebase"
   - **testing**: "run tests", "fix failing", "test coverage", "debug", "mock"
   - **docs**: "README", "documentation", "comments", "changelog", "wiki"
   - **files**: "create", "edit", "update", "delete", "organize", "refactor"
   - **quality**: "lint", "format", "type check", "code review", "optimize"
5. **Score Salience**: Frequency (40%) + Automation potential (40%) + Complexity fit (20%)
6. **Generate Commands**: Format as `category:action` with clear value proposition
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
**Efficient Operations** (Optimized for permissions):
1. **Parse Focus**: Extract focus parameter from $ARGUMENTS, default to "all"
2. **Batch Operations**: Check existing commands + Extract history with single jq call
3. **Simple Filtering**: Use basic text operations instead of complex pipes:
   - `jq` for JSON extraction (single operation)
   - `grep` for pattern filtering if focus specified
   - `cut`, `sort`, `uniq` for text processing
   - `wc` for frequency counting
4. **Focus Application**: Filter patterns by category keywords before analysis
5. **Quality Checks**: Ensure >10 history entries for meaningful analysis

**Key Improvements**:
- Single jq command instead of complex pipe chains
- Focus-based early filtering reduces processing overhead
- Leverage existing allowed bash commands efficiently
- Avoid permission-heavy operations
</implementation>

<examples>
**Pattern Recognition by Focus**:

**git focus**: 
- "commit changes" + "git commit" + "save work" → Suggest: `git:sync`
- "create PR" + "pull request" + "merge ready" → Suggest: `git:pr`

**testing focus**:
- "run tests" + "test failing" + "fix tests" → Suggest: `test:fix`
- "debug test" + "test coverage" + "mock data" → Suggest: `test:debug`

**docs focus**:
- "update README" + "add docs" + "document API" → Suggest: `docs:update`
- "code comments" + "document function" → Suggest: `docs:annotate`

**files focus**:
- "organize files" + "move files" + "clean up" → Suggest: `files:organize`

**quality focus**:
- "fix linting" + "format code" + "type errors" → Suggest: `quality:fix`

**Scoring Example** (focus: git):
- Pattern: "commit and push" (15 occurrences in git operations)
- Frequency: 15/50 git operations = 0.30 (40% weight)
- Automation: High = 0.8 (40% weight)  
- Complexity: Perfect fit = 1.0 (20% weight)
- Salience: (0.30 × 0.4) + (0.8 × 0.4) + (1.0 × 0.2) = 0.64
</examples>

**Usage Examples**:
- `/prompt:suggest` → Analyze all categories, suggest top commands
- `/prompt:suggest git` → Focus on git operations only  
- `/prompt:suggest testing` → Focus on testing patterns only
- `/prompt:suggest docs` → Focus on documentation patterns only
- `/prompt:suggest files` → Focus on file management patterns only
- `/prompt:suggest quality` → Focus on code quality patterns only

**Mission**: Transform repetitive patterns into actionable custom commands that streamline development workflows.
