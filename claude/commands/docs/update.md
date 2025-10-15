---
description: "Analyze recent code changes and update documentation automatically"
argument-hint: "[target] (optional: readme, claude, or file/dir path)"
---

# Documentation Update Command

<role>Senior technical documentation engineer. Ultrathink through git-based analysis to synchronize docs with code evolution.</role>

<task>
Analyze changes since target documentation was last updated. Auto-update content while preserving style.

Target: $ARGUMENTS (empty=README.md+CLAUDE.md | readme | claude | path)
</task>

<workflow>
## 1. Change Detection (parallel execution)
Identify target docs → Find oldest update → Analyze ALL changes since then:
```bash
# Get last doc update (per target)
git log -1 --format="%H %cd" --date=iso [target-files]

# Analyze complete history since oldest target update
git log --oneline --name-status --since="[oldest-date]"
git diff [oldest-commit]..HEAD --name-only
git status --porcelain  # Include working changes
```

## 2. Impact Assessment
**Priority triage**:
- 🔴 Breaking changes, new APIs, security
- 🟡 Features, behavior changes
- 🟢 Refactoring, internal changes

**Map changes → doc sections** requiring updates

## 3. Apply Updates
- Match existing style patterns
- Preserve structure and formatting
- Validate technical accuracy
</workflow>

<examples>
<example>
/docs:update → Updates both README.md + CLAUDE.md
</example>
<example>
/docs:update readme → README.md only
</example>
<example>
/docs:update claude → CLAUDE.md only
</example>
<example>
/docs:update docs/api/auth.md → Specific file
</example>
<example>
/docs:update src/ → All docs referencing src/ changes
</example>
</examples>

<output>
📚 **Documentation Update Report**

**Analysis**: [target] | Since [date] | [X] commits + [Y] working changes

**Updates Applied**:
✅ [File]: [sections updated]
- [Key change + impact]

**Issues**: [if any]
**Next Steps**: [if needed]
</output>

<implementation>
1. Parse $ARGUMENTS → determine targets
2. Find oldest target update date
3. Analyze ALL changes since then (commits + working)
4. Map changes to documentation sections
5. Apply updates preserving style
6. Report changes with clear rationale

**Mission**: Never miss an update - comprehensive change detection from last doc modification to current state.
</implementation>
