---
name: executing-plans
description: Use when you have a written implementation plan to execute - implements inline with subagent review gates for spec compliance and code quality
---

# Executing Plans

## Overview

Execute implementation plans by implementing tasks inline (fast) with independent subagent reviews (unbiased). Combines speed of inline execution with quality assurance of fresh-context reviewers.

**Core principle:** Inline implementation + subagent review gates = fast execution with independent quality checks.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**REQUIRED SUB-SKILL:** Use Skill(asking-questions) for all user questions.

## The Process

```
For each task pair (Implement → Review):
  1. Mark "Implement" in_progress
  2. Implement inline (TDD)
  3. Commit
  4. Mark "Implement" complete
  5. Mark "Review" in_progress
  6. Prepare diff context
  7. Dispatch spec + code reviewers in parallel (background tasks)
  8. Wait for both to complete
  9. Parse XML outputs (with legacy fallback)
  10. Merge results, determine overall verdict
  11. If APPROVED → mark "Review" complete, proceed
      If ISSUES → fix inline, amend, re-run both reviews
  12. Proceed to next pair (now unblocked)

After all pairs:
  Use completing-work
```

### Step 1: Load Plan and Initialize Tasks

1. Read plan file
2. Review critically - identify any questions or concerns
3. If concerns: Raise them before starting
4. If no concerns: Initialize task tracking

**Initialize task tracking:**

```
TaskList
```

- **If tasks exist for this plan:** Use `AskUserQuestion` to ask:

```javascript
AskUserQuestion(
  questions: [{
    question: "Found existing tasks for this plan. How would you like to proceed?",
    header: "Resume",
    multiSelect: false,
    options: [
      { label: "Continue (Recommended)", description: "Resume from first incomplete task" },
      { label: "Start fresh", description: "Start new session for clean execution" }
    ]
  }]
)
```

  - **Continue:** Use existing tasks, resume from first non-completed pair
  - **Start fresh:** Advise user to start a new session for clean execution (tasks are session-scoped and cannot be deleted)
- **If no tasks exist:** Create all task pairs from the plan (see "Creating Tasks from Plan" below)

### Creating Tasks from Plan

Parse the plan document and create a **task pair** for each task:

**For each Task N in the plan:**

1. **Create Implementation task:**
   ```
   TaskCreate:
     subject: "Task N: Implement [Component Name]"
     description: |
       [Copy task content from plan: Files, Steps, Acceptance Criteria]
     activeForm: "Implementing [Component Name]"
   ```

2. **Create Review task:**
   ```
   TaskCreate:
     subject: "Task N: Review"
     description: |
       Run parallel spec and code reviews for Task N.
       Parse XML outputs, merge results, present to implementer.
       If issues: fix and re-review. If approved: proceed.
     activeForm: "Reviewing [Component Name]"
   ```

**After all tasks created, set blocking relationships:**

```
# Within each pair:
TaskUpdate:
  taskId: [review-id]
  addBlockedBy: [implement-id]

# Between pairs (Task N+1 blocked by Task N's review):
TaskUpdate:
  taskId: [task-N+1-implement-id]
  addBlockedBy: [task-N-review-id]
```

This creates the execution chain:
```
Implement 1 → Review 1 → Implement 2 → Review 2 → ...
```

### Preparing Diff Context

Before dispatching reviews, prepare the diff context to include in prompts.

**Threshold:** 500 lines

```javascript
// Pseudocode - implement inline
function prepareDiffContext(baseSha, headSha) {
  const stat = `git diff --stat ${baseSha}..${headSha}`;
  const fullDiff = `git diff ${baseSha}..${headSha}`;
  const lineCount = fullDiff.split('\n').length;

  if (lineCount <= 500) {
    return `
**Diff Stats:**
\`\`\`
${stat}
\`\`\`

**Full Diff:**
\`\`\`diff
${fullDiff}
\`\`\`
`;
  } else {
    return `
**Diff Stats:**
\`\`\`
${stat}
\`\`\`

**Note:** Diff is ${lineCount} lines (exceeds 500 line threshold).
Fetch specific files as needed using: \`git diff ${baseSha}..${headSha} -- path/to/file\`
`;
  }
}
```

Run `git diff --stat` and `git diff` to get the values, count lines, and format accordingly.

### Step 2: Execute Each Task Pair

For each task pair in order:

#### 2a. Implementation Phase

**Mark in progress:**
```
TaskUpdate:
  taskId: [implement-task-id]
  status: in_progress
```

This triggers the CLI spinner showing the task's `activeForm`.

**Implement using TDD:**
- Write failing test
- Verify it fails
- Write minimal implementation
- Verify it passes
- Refactor if needed

**Reference:** Skill(test-driven-development) for TDD discipline.

**Commit:**
```bash
git add -A
git commit -m "feat: [task description]"
```

Capture commit SHAs:
```bash
git rev-parse HEAD~1  # BASE_SHA
git rev-parse HEAD    # HEAD_SHA
```

**Mark complete:**
```
TaskUpdate:
  taskId: [implement-task-id]
  status: completed
```

#### 2b. Parallel Review Phase

After implementation is committed, run both reviews in parallel.

**Mark in progress:**
```
TaskUpdate:
  taskId: [review-task-id]
  status: in_progress
```

**Prepare diff context:**

```bash
git diff --stat $BASE_SHA..$HEAD_SHA
git diff $BASE_SHA..$HEAD_SHA
```

If diff exceeds 500 lines, include only stats and instruct reviewers to fetch as needed.

**Launch both reviews as background tasks:**

```javascript
// Launch spec review in background
Task({
  subagent_type: 'general-purpose',
  description: 'Review spec compliance for Task N',
  prompt: specReviewPrompt,  // From spec-reviewer-prompt.md with DIFF_CONTEXT filled
  run_in_background: true
})
// Capture task_id from result

// Launch code review in background (same message, parallel)
Task({
  subagent_type: 'code-reviewer',
  description: 'Review code quality for Task N',
  prompt: codeReviewPrompt,  // From code-reviewer-template.md with DIFF_CONTEXT filled
  run_in_background: true
})
// Capture task_id from result
```

**Wait for both to complete:**

```javascript
TaskOutput({ task_id: specTaskId, block: true, timeout: 180000 })
TaskOutput({ task_id: codeTaskId, block: true, timeout: 180000 })
```

**Parse outputs and merge results.**

#### 2c. Parse Review Outputs

Parse each review output, trying XML first with legacy fallback.

**XML Parsing:**

Extract `<spec-review>` or `<code-review>` tags and parse contents.

**Legacy Fallback:**

If no valid XML found, check for legacy prefixes:
- `APPROVED:` → verdict: APPROVED, no issues
- `APPROVED_WITH_MINOR:` → verdict: APPROVED_WITH_MINOR, parse minor notes
- `ISSUES:` → verdict: ISSUES, parse issue list

#### 2d. Merge Review Results

Combine findings from both reviews into a single verdict.

**Overall Verdict Logic:**

```
if spec has critical issues → SPEC_CRITICAL
else if code has critical issues → CODE_CRITICAL
else if either has important issues → ISSUES
else if code is APPROVED_WITH_MINOR → APPROVED_WITH_MINOR
else → APPROVED
```

**Issue Priority Order:**

1. Spec Critical - wrong thing built
2. Code Critical - bugs, security holes
3. Spec Important - missing/extra features
4. Code Important - architecture, error handling
5. Minor notes - don't block

**Related Issue Detection:**

Issues in the same file within 5 lines are grouped together.

#### 2e. Present Results and Act

**Display merged results:**

```
Review Results:
  Spec Review: [verdict] ([confidence] confidence)
  Code Review: [verdict] ([confidence] confidence)

Issues to Fix (N):

  1. [Source Type] path/to/file.ts:45
     Description of the issue
     [For spec: Requirement: "..."]
     [For code: Fix: "..."]

Minor Notes (M):
  - path/to/file.ts:30 - observation

Action: [FIX_AND_REREVIEW | PROCEED | PROCEED_WITH_NOTES]
```

**Actions:**

- **FIX_AND_REREVIEW:** Fix all critical/important issues, amend commit, re-run BOTH reviews
- **PROCEED:** All approved, continue to next task
- **PROCEED_WITH_NOTES:** Approved with minor issues noted, continue to next task

**Re-review Strategy:**

Always re-run both reviews after fixes (not just the one that failed):
- Fixes might affect either domain
- Clean slate is simpler to reason about
- Parallel execution makes this cheap

**Review Loop Limit:**

After 3 review iterations without approval, ask user:
- Continue trying
- Proceed anyway (user accepts risk)
- Stop for manual review

**Mark complete (only after APPROVED or APPROVED_WITH_MINOR):**
```
TaskUpdate:
  taskId: [review-task-id]
  status: completed
```

Proceed to next pair.

### Step 3: Complete Development

After all tasks complete:

1. Run full test suite to verify everything works together
2. **REQUIRED SUB-SKILL:** Use Skill(completing-work)
3. Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask

**STOP executing immediately when:**
- Hit a blocker (missing dependency, unclear instruction)
- Test fails and fix is not obvious
- Spec reviewer identifies fundamental misunderstanding
- Code reviewer identifies Critical architectural issues

**Ask for clarification rather than guessing.**

## Prompt Templates

- `./spec-reviewer-prompt.md` - Verify implementation matches spec
- `./code-quality-reviewer-prompt.md` - Verify implementation is well-built
- `./code-reviewer-template.md` - Full template for code-reviewer subagent

## Review Order Matters

```
Implementation → [Spec Review ║ Code Review] → Merge → Act
                        ↓              ↓
                  "Did we build    "Did we build
                   the right        it well?"
                   thing?"
```

Reviews run in parallel but issues are prioritized:

1. **Spec Critical** - wrong thing built (fix first)
2. **Code Critical** - bugs, security (fix second)
3. **Spec Important** - missing features
4. **Code Important** - architecture issues
5. **Minor notes** - don't block

**Never skip reviews.** Both domains matter:
- Spec-compliant code can still be buggy
- Well-built code can still be wrong

**Re-review both** after any fix. Fixes can affect either domain.

## Red Flags

**Never:**
- Skip either review
- Ignore Critical or Important issues
- Guess when blocked
- Proceed after 3 failed review iterations without user consent
- Auto-resolve conflicting findings between reviewers

**Always:**
- Follow plan steps exactly
- Use TDD for implementation
- Run both reviews in parallel
- Re-run both reviews after fixes (not just the failed one)
- Fix issues before proceeding to next task
- Commit after each task (before review)
- Present merged results clearly

## Error Handling

**Timeout Handling:**

Reviews timeout after 180 seconds (3 minutes).

```javascript
TaskOutput({ task_id: taskId, block: true, timeout: 180000 })
```

If timeout:
1. Retry the failed review once
2. If still fails, ask user using AskUserQuestion:

```javascript
AskUserQuestion({
  questions: [{
    question: "Review timed out after retry. How would you like to proceed?",
    header: "Timeout",
    multiSelect: false,
    options: [
      { label: "Retry again", description: "Try the review one more time" },
      { label: "Skip review", description: "Proceed without this review (risky)" },
      { label: "Stop", description: "Stop execution for manual intervention" }
    ]
  }]
})
```

**Parse Failure Handling:**

If output contains neither valid XML nor legacy format:
1. Retry the review once
2. If still unparseable, ask user

**Both Reviews Fail:**

```javascript
AskUserQuestion({
  questions: [{
    question: "Both reviews failed. How would you like to proceed?",
    header: "Review Failed",
    multiSelect: false,
    options: [
      { label: "Retry both", description: "Run both reviews again" },
      { label: "Skip reviews", description: "Proceed without review (risky)" },
      { label: "Stop", description: "Stop for manual review" }
    ]
  }]
})
```

**Review Loop Protection:**

After 3 review iterations without full approval:

```javascript
AskUserQuestion({
  questions: [{
    question: "3 review iterations completed without full approval. How would you like to proceed?",
    header: "Review Loop",
    multiSelect: false,
    options: [
      { label: "Continue", description: "Keep trying to resolve issues" },
      { label: "Proceed anyway", description: "Accept current state and move on" },
      { label: "Stop", description: "Stop for manual review" }
    ]
  }]
})
```

## Integration

**Required skills:**
- **test-driven-development** - Implementation discipline
- **completing-work** - Complete development after all tasks

**Used by:**
- **writing-plans** - Creates plans this skill executes

---

## Native Task Notes

- Tasks are created by this skill at the start of execution, not during planning
- Task pairs: Implement, Review for each plan task (reviews run in parallel internally)
- Blocking chain: Implement N → Review N → Implement N+1
- Plan document is the source of truth for *what* to do
- Native tasks track *progress* and *enforce review gates*
- The `activeForm` field shows in the CLI spinner during `in_progress` status
- If resuming execution, existing tasks are reused; otherwise created fresh
