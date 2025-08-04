---
description: "Analyze recent code changes and update documentation automatically"
argument-hint: "[target] (optional: readme, claude, or file/dir path)"
model: "claude-opus-4-20250514"
---

# Documentation Update Command

<role>Senior technical documentation engineer. Ultrathink through git-based documentation analysis to maintain accurate, synchronized docs.</role>

<task>
Analyze code changes via git history to auto-update project documentation. Detect gaps, update content while preserving style.

Target: $ARGUMENTS (empty=both README.md+CLAUDE.md | readme | claude | path)
</task>

<workflow>
## 1. Target-Specific Documentation & Change Analysis (parallel execution)
```bash
# Determine target documentation files based on arguments
# $ARGUMENTS = empty → README.md + CLAUDE.md
# $ARGUMENTS = "readme" → README.md only  
# $ARGUMENTS = "claude" → CLAUDE.md only
# $ARGUMENTS = "path/to/file.md" → specific file/directory

# For each target doc file, get last modification commit
git log -1 --format="%H %cd" --date=iso README.md 2>/dev/null  # if targeting readme/both
git log -1 --format="%H %cd" --date=iso CLAUDE.md 2>/dev/null  # if targeting claude/both
git log -1 --format="%H %cd" --date=iso [specific-path] 2>/dev/null  # if targeting specific path

# Get ALL commits since oldest target documentation was last updated
git log --oneline --name-status --since="[oldest-target-doc-date]"  # Dynamic date from targets only
git diff [oldest-target-doc-commit]..HEAD --name-only               # All changes since oldest target doc update

# Include current working state
git status --porcelain                 # Unstaged changes
git diff --cached --name-only          # Staged changes
git diff --name-only                   # Unstaged file changes
```

## 2. Comprehensive Impact Assessment
For each change discovered (from oldest doc update to current), identify:
- **Code changes**: New/modified APIs, features, configurations
- **File changes**: Added, deleted, moved files affecting documentation
- **Breaking changes**: Version bumps, API changes, deprecated features
- **Current work**: Unstaged/staged changes that affect user-facing behavior

**Analysis Strategy**:
1. **Target-focused**: Only analyze commits since the oldest **specified** documentation file was updated
2. **Historical changes**: Review ALL commits since oldest target doc file was updated
3. **Current state**: Include uncommitted changes that affect functionality
4. **Cross-reference**: Match code changes to specific target documentation sections

<example>
**Historical**: src/cli/commands.ts (3 commits ago) - Added --format flag
**Current**: package.json (staged) - Version bump to 2.1.0
**Impact**: README.md CLI section needs --format docs + version update
</example>

## 3. Documentation Updates
- Analyze existing style (headers, lists, code blocks)
- Apply changes matching discovered patterns
- Validate links, commands, version numbers

### Priority Levels
🔴 High: New APIs, breaking changes, security updates
🟡 Medium: Bug fixes changing behavior, new features
🟢 Low: Internal refactoring, style changes
</workflow>

<output>
📚 **Documentation Update Report**

### 📊 Analysis Summary
- **Target**: [specified target]
- **Time Range**: Since [oldest-target-doc-date] ([X] commits + current changes)
- **Historical Commits**: X analyzed since last target doc update
- **Current Changes**: Y staged + Z unstaged files
- **Gaps Found**: N sections requiring updates

### 📝 Updates Applied
✅ **README.md**: [X sections]
✅ **CLAUDE.md**: [Y sections]

**Key Changes**:
1. [Change + rationale]
2. [Change + rationale]

### ⚠️ Issues
- [Issue + recommended action]

### 📋 Next Steps
1. [Follow-up action]
</output>

<examples>
<example>
/docs:update → Analyze all changes, update README.md + CLAUDE.md
</example>
<example>
/docs:update readme → Focus on README.md only
</example>
<example>
/docs:update docs/api/ → Update files in specified directory
</example>
</examples>

## Implementation Logic

**Step-by-step execution**:
1. **Parse target argument** to determine which documentation files to update
2. **Find oldest target documentation update** using `git log -1 --format="%H %cd" --date=iso [target-file]`
3. **Analyze ALL changes since oldest target update** with `git log --since="[target-date]" --name-status`
4. **Include current working state** (staged + unstaged changes)
5. **Map changes to target documentation sections** that need updates
6. **Apply updates** while preserving existing style and structure

**Mission**: Keep documentation synchronized with code through comprehensive change detection - never miss an update by analyzing the complete history since documentation was last modified.
