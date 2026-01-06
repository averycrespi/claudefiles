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

**Code reviewer returns:**
- Strengths (what's well done)
- Issues categorized by severity:
  - Critical (must fix)
  - Important (should fix)
  - Minor (nice to have)
- Assessment (ready to merge? yes/no/with fixes)

**Handling feedback:**
- **Critical issues:** Fix immediately, amend commit, re-review
- **Important issues:** Fix immediately, amend commit, re-review
- **Minor issues:** Judgment call - fix now or note for later

**Only proceed to next task after code quality review approves (or approves with minor issues noted).**
