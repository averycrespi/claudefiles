---
name: executing-plans-quickly
description: Use when you have a written implementation plan file to execute quickly - does implementation and reviews inline in main context without subagent dispatch
---

# Executing Plans Quickly

## Overview

Execute implementation plans inline in the main context. Same task triplet structure and review discipline as `executing-plans`, but without subagent dispatch for faster execution.

**Core principle:** Inline execution trades isolation for speed - best for simple plans where context pollution isn't a concern.

**Announce at start:** "I'm using the executing-plans-quickly skill to implement this plan inline."

## When to Use This Skill

**Use this skill when:**
- Simple plans with 1-3 tasks
- Well-understood changes where context pollution isn't a concern
- Interactive sessions where speed matters more than isolation

**Use full executing-plans when:**
- Complex plans with many tasks
- Long-running autonomous work
- When you want independent review perspectives

## The Process

```
For each task triplet (Implement → Spec Review → Code Review):
  1. Mark "Implement" in_progress
  2. Implement the task inline (TDD, commit)
  3. Mark "Implement" complete
  4. Mark "Spec Review" in_progress
  5. Self-review against spec (inline checklist)
  6. If issues → fix inline, amend commit
  7. Mark "Spec Review" complete
  8. Mark "Code Review" in_progress
  9. Self-review for code quality (inline checklist)
  10. If issues → fix inline, amend commit
  11. Mark "Code Review" complete
  12. Proceed to next triplet

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
     activeForm: "Reviewing spec compliance for [Component Name]"
   ```

3. **Create Code Review task:**
   ```
   TaskCreate:
     subject: "Task N: Code Review"
     description: |
       Review implementation of Task N for code quality.
       Check tests, error handling, maintainability.
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

### Step 2: Execute Each Task Triplet

For each task triplet in order:

#### 2a. Implementation Phase

**Mark in progress:**
```
TaskUpdate:
  taskId: [implement-task-id]
  status: in_progress
```

**Implement inline:**
1. Follow the task steps exactly as written in the plan
2. Use TDD: write failing test, make it pass, refactor
3. Commit when complete

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

**Review against spec checklist:**

```
□ All requirements from task spec implemented
□ No extra features added beyond spec
□ No requirements misinterpreted
□ Tests cover the specified behavior
```

**If issues found:**
1. Fix the issues inline
2. Amend the commit: `git add -A && git commit --amend --no-edit`
3. Re-check the checklist

**Mark complete (only after all checks pass):**
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

**Review for code quality checklist:**

```
□ Tests actually test behavior (not implementation details)
□ Error handling appropriate for the context
□ Follows existing codebase patterns
□ No obvious bugs or edge cases missed
```

**If issues found:**
1. Fix the issues inline
2. Amend the commit: `git add -A && git commit --amend --no-edit`
3. Re-check the checklist

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
- Discover fundamental misunderstanding of requirements

**Ask for clarification rather than guessing.**

## Red Flags

**Never:**
- Skip either review phase
- Proceed to code quality before spec compliance passes
- Ignore issues found in review
- Guess when blocked

**Always:**
- Follow plan steps exactly
- Use TDD for implementation
- Fix issues before proceeding to next task
- Commit after each implementation task

## Integration

**Required skills:**
- **test-driven-development** - Implementation discipline
- **completing-work** - Complete development after all tasks

**Used by:**
- **writing-plans** - Creates plans this skill executes
