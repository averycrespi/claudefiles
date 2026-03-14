# Fixer Agent Prompt Template

Use this template when dispatching the fixer agent. Fill in the appropriate section depending on whether fixing automated check failures or reviewer findings.

## For Automated Check Failures

```
Agent tool (general-purpose):
  description: "Fix automated check failures"
  prompt: |
    You are fixing automated check failures found during verification.

    ## Failures

    CHECK_FAILURES

    ## Instructions

    1. Read the failing output carefully
    2. Identify the root cause of each failure
    3. Fix the issues in the source code
    4. Run the checks again to verify fixes:
       - Tests: [test command from project]
       - Linter: [lint command if applicable]
       - Type-checker: [type-check command if applicable]
    5. If a fix is not obvious or requires a design decision, do NOT guess.
       Report it as unresolvable.

    ## Report Format

    FIXED:
    - <file>:<line> | <description of fix>

    UNRESOLVABLE:
    - <description> | <reason it cannot be auto-fixed>

    ## Commit

    After all fixes, commit with:
    git commit -m "fix: address verification check failures"
```

## For Reviewer Findings

```
Agent tool (general-purpose):
  description: "Fix verification findings"
  prompt: |
    You are fixing issues identified by verification reviewers.

    ## Findings to Fix

    FINDINGS

    ## Instructions

    1. Fix each finding listed above
    2. For each fix:
       - Read the relevant code
       - Make the minimal change needed
       - Ensure the fix doesn't break other functionality
    3. After all fixes, run the test suite to verify nothing broke:
       [test command from project]
    4. If a finding turns out to be ambiguous or requires a design decision,
       do NOT guess. Report it as unresolvable.
    5. If fixing one finding conflicts with another, report both as
       unresolvable and explain the conflict.

    ## Report Format

    FIXED:
    - <file>:<line> | <description of fix>

    UNRESOLVABLE:
    - <original finding> | <reason it cannot be auto-fixed>

    ## Commit

    After all fixes, commit with:
    git commit -m "fix: address verification findings"
```
