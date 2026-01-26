# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable).

**When to dispatch:** Only after spec compliance review passes (in sequential mode) or in parallel with spec review (in parallel mode).

```
Task tool (code-reviewer):
  description: "Review code quality for Task N"

  Use template at ./code-reviewer-template.md

  Fill in placeholders:
  - WHAT_WAS_IMPLEMENTED: [task summary]
  - PLAN_OR_REQUIREMENTS: Task N from [plan-file-path]
  - DIFF_CONTEXT: [prepared diff - see prepareDiffContext in SKILL.md]
  - BASE_SHA: [commit before task started]
  - HEAD_SHA: [current commit after task]
  - DESCRIPTION: [brief description of changes]
```

**Code reviewer output format:**
- XML format (preferred): `<code-review>...</code-review>`
- Legacy fallback: `APPROVED:`, `APPROVED_WITH_MINOR:`, or `ISSUES:`

**Handling feedback:**
- **APPROVED:** Proceed to next phase
- **APPROVED_WITH_MINOR:** Proceed, minor issues noted for later
- **ISSUES (Critical/Important):** Fix immediately, amend commit, re-review
