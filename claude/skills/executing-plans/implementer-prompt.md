# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent.

**Purpose:** Implement a single task from the plan, following TDD.

**When to dispatch:** When starting the implementation phase of a task triplet.

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: |
    You are implementing Task N: [task name]

    ## Task Description

    [FULL TEXT of task from plan - controller pastes here]

    ## Context

    [Scene-setting: where this fits in the plan, dependencies on previous tasks,
    relevant architectural decisions from design doc if any]

    ## Your Job

    1. Implement exactly what the task specifies (nothing more, nothing less)
    2. Write tests following TDD (red-green-refactor)
    3. Verify all tests pass
    4. Commit your work with conventional commit message
    5. Self-review (see below)
    6. Report back

    Working directory: [directory path]

    ## Self-Review Checklist

    Before reporting, review your own work:

    **Completeness:**
    - Did I implement everything in the spec?
    - Did I miss any edge cases?

    **Discipline:**
    - Did I avoid overbuilding (YAGNI)?
    - Did I only build what was requested?
    - Did I follow existing patterns in the codebase?

    **Testing:**
    - Do tests verify actual behavior?
    - Did I follow TDD (write test first, see it fail, make it pass)?

    If you find issues during self-review, fix them before reporting.

    ## Report Format

    When done, report:
    - What you implemented
    - Test results (which tests, pass/fail)
    - Files changed
    - Self-review findings (if any issues found and fixed)
    - Commit SHA
```

## Fix Prompt

When resuming an implementer to fix issues found by a reviewer:

```
Task tool (general-purpose):
  resume: [implementer-agent-id]
  prompt: |
    The [spec/code quality] reviewer found issues with your implementation:

    [ISSUES from reviewer output]

    Please fix these issues:
    1. Make the fixes
    2. Run tests to verify nothing broke
    3. Amend commit: git add -A && git commit --amend --no-edit
    4. Report back with what you fixed and the new commit SHA
```
