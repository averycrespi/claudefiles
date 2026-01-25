# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable).

**When to dispatch:** Only after spec compliance review passes.

```
Task tool (code-reviewer):
  description: "Review code quality for Task N"

  Use template at ./code-reviewer-template.md

  Fill in placeholders:
  - WHAT_WAS_IMPLEMENTED: [task summary]
  - PLAN_OR_REQUIREMENTS: Task N from [plan-file-path]
  - BASE_SHA: [commit before task started]
  - HEAD_SHA: [current commit after task]
  - DESCRIPTION: [brief description of changes]
```

**Code reviewer output format (use EXACTLY this format for parsing):**
- If approved: "APPROVED: [brief summary of what's well done]"
- If approved with minor issues: "APPROVED_WITH_MINOR: [summary]\nMinor issues noted:\n- [issue 1]\n- [issue 2]"
- If issues requiring fixes: "ISSUES:\nCritical:\n- [issue with file:line]\nImportant:\n- [issue with file:line]"

**Handling feedback:**
- **APPROVED:** Proceed to next phase
- **APPROVED_WITH_MINOR:** Proceed, issues noted for later
- **ISSUES (Critical/Important):** Fix immediately, amend commit, re-review
