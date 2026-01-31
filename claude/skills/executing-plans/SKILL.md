---
name: executing-plans
description: Use when you have a written implementation plan to execute - dispatches subagents for implementation and reviews to prevent context pollution
---

# Executing Plans

## Overview

Execute implementation plans by dispatching subagents for each phase: implementation, spec review, and code quality review. The main context only orchestrates while subagents do the heavy lifting, preventing context pollution that degrades model quality.

**Core principle:** Subagent per phase + controller orchestration = preserved model quality throughout long execution runs.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**REQUIRED SUB-SKILL:** Use Skill(asking-questions) for all user questions.

## The Process

```
For each task triplet (Implement → Spec Review → Code Review):
  1. Mark "Implement" in_progress
  2. Dispatch implementer subagent with full task text
  3. Implementer implements, tests, commits, self-reviews
  4. Parse implementer report, capture agent ID and commit SHA
  5. Mark "Implement" complete
  6. Mark "Spec Review" in_progress
  7. Dispatch spec reviewer subagent
  8. If APPROVED → mark "Spec Review" complete
     If ISSUES → resume implementer to fix, re-dispatch spec reviewer
  9. Mark "Code Review" in_progress
  10. Dispatch code quality reviewer subagent
  11. If APPROVED → mark "Code Review" complete
      If ISSUES → resume implementer to fix, re-dispatch code reviewer
  12. Proceed to next triplet (now unblocked)

After all triplets:
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

  - **Continue:** Use existing tasks, resume from first non-completed triplet
  - **Start fresh:** Advise user to start a new session for clean execution (tasks are session-scoped and cannot be deleted)
- **If no tasks exist:** Create all task triplets from the plan (see "Creating Tasks from Plan" below)

### Creating Tasks from Plan

Parse the plan document and create a **task triplet** for each task:

**For each Task N in the plan:**

1. **Create Implementation task:**
   ```
   TaskCreate:
     subject: "Task N: Implement [Component Name]"
     description: |
       [Copy task content from plan: Files, Steps, Acceptance Criteria]
     activeForm: "Implementing [Component Name]"
   ```

2. **Create Spec Review task:**
   ```
   TaskCreate:
     subject: "Task N: Spec Review"
     description: |
       Review implementation of Task N for spec compliance.
       Verify all requirements are met, nothing extra added.
       Use spec-reviewer-prompt.md template.
     activeForm: "Reviewing spec compliance for [Component Name]"
   ```

3. **Create Code Review task:**
   ```
   TaskCreate:
     subject: "Task N: Code Review"
     description: |
       Review implementation of Task N for code quality.
       Check tests, error handling, maintainability.
       Use code-quality-reviewer-prompt.md template.
     activeForm: "Reviewing code quality for [Component Name]"
   ```

**After all tasks created, set blocking relationships:**

```
# Within each triplet:
TaskUpdate:
  taskId: [spec-review-id]
  addBlockedBy: [implement-id]

TaskUpdate:
  taskId: [code-review-id]
  addBlockedBy: [spec-review-id]

# Between triplets (Task N+1 blocked by Task N's code review):
TaskUpdate:
  taskId: [task-N+1-implement-id]
  addBlockedBy: [task-N-code-review-id]
```

This creates the execution chain:
```
Implement 1 → Spec Review 1 → Code Review 1 → Implement 2 → Spec Review 2 → ...
```

### Step 2: Execute Each Task Triplet

For each task triplet in order:

#### 2a. Implementation Phase

**Mark in progress:**
```
TaskUpdate:
  taskId: [implement-task-id]
  status: in_progress
```

This triggers the CLI spinner showing the task's `activeForm`.

**Dispatch implementer subagent:**

Use prompt template at `./implementer-prompt.md`. Fill in:
- Task description (full text from plan)
- Context (where task fits, dependencies, architectural notes)
- Working directory

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: [filled template from implementer-prompt.md]
```

**Parse implementer report:**

Extract from subagent output:
- `implementer_agent_id`: The agent ID returned by Task tool (for resumption)
- `commit_sha`: The commit SHA from the report
- `base_sha`: Commit before this task (HEAD~1 at dispatch time)

**Mark complete:**
```
TaskUpdate:
  taskId: [implement-task-id]
  status: completed
```

#### 2b. Spec Review Phase

**Mark in progress:**
```
TaskUpdate:
  taskId: [spec-review-task-id]
  status: in_progress
```

**Dispatch spec reviewer subagent:**

Use prompt template at `./spec-reviewer-prompt.md`. Fill in task requirements and implementation summary.

**Parse subagent output:**
- If output starts with `APPROVED:` → mark spec review complete
- If output starts with `ISSUES:` → fix issues inline, amend commit, re-dispatch

**Fix/re-review loop:**
1. Fix issues inline
2. Amend commit: `git add -A && git commit --amend --no-edit`
3. Re-dispatch spec reviewer
4. Repeat until `APPROVED`

**Mark complete (only after APPROVED):**
```
TaskUpdate:
  taskId: [spec-review-task-id]
  status: completed
```

#### 2c. Code Quality Review Phase

**Mark in progress:**
```
TaskUpdate:
  taskId: [code-review-task-id]
  status: in_progress
```

**Dispatch code quality reviewer subagent:**

Use prompt template at `./code-quality-reviewer-prompt.md`. The code-reviewer subagent uses the template at `./code-reviewer-template.md`.

Fill in:
- WHAT_WAS_IMPLEMENTED: Task summary
- PLAN_OR_REQUIREMENTS: Task text from plan
- BASE_SHA: Commit before this task
- HEAD_SHA: Current commit
- DESCRIPTION: Brief description

**Parse subagent output:**
- If output starts with `APPROVED:` → mark code review complete
- If output starts with `APPROVED_WITH_MINOR:` → mark complete, note minor issues
- If output starts with `ISSUES:` → fix critical/important issues, amend, re-dispatch

**Fix/re-review loop (for critical/important issues):**
1. Fix issues inline
2. Amend commit: `git add -A && git commit --amend --no-edit`
3. Re-dispatch code reviewer
4. Repeat until `APPROVED` or `APPROVED_WITH_MINOR`

**Mark complete:**
```
TaskUpdate:
  taskId: [code-review-task-id]
  status: completed
```

Proceed to next triplet.

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
Implementation → Spec Review → Code Quality Review
                     ↓              ↓
              "Did we build    "Did we build
               the right        it well?"
               thing?"
```

**Never skip spec review.** Code quality review on wrong code is wasted effort.

**Never skip code quality review.** Spec-compliant code can still be buggy or unmaintainable.

## Red Flags

**Never:**
- Skip either review stage
- Proceed to code quality before spec compliance passes
- Ignore Critical or Important issues
- Guess when blocked

**Always:**
- Follow plan steps exactly
- Use TDD for implementation
- Fix issues before proceeding to next task
- Commit after each task (before review)

## Integration

**Required skills:**
- **test-driven-development** - Implementation discipline
- **completing-work** - Complete development after all tasks

**Used by:**
- **writing-plans** - Creates plans this skill executes

---

## Native Task Notes

- Tasks are created by this skill at the start of execution, not during planning
- Task triplets: Implement, Spec Review, Code Review for each plan task
- Blocking chain: Implement N → Spec Review N → Code Review N → Implement N+1
- Plan document is the source of truth for *what* to do
- Native tasks track *progress* and *enforce review gates*
- The `activeForm` field shows in the CLI spinner during `in_progress` status
- If resuming execution, existing tasks are reused; otherwise created fresh
