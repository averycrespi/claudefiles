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
## 1. Change Analysis (parallel execution)
```bash
git log --oneline -20 --name-status    # Recent commits
git diff HEAD~10..HEAD --name-only     # Changed files
git status --porcelain                 # Current state
```

## 2. Impact Assessment
For each change, identify:
- Affected features/APIs
- Documentation sections requiring updates
- Breaking changes needing migration guides

<example>
Modified: src/cli/commands.ts - Added --format flag
Impact: README.md CLI section needs flag docs + examples
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
- **Commits**: X analyzed
- **Gaps Found**: Y sections

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

**Mission**: Keep documentation synchronized with code through intelligent change detection and systematic updates.
