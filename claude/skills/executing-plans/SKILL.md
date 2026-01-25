---
name: executing-plans
description: Use when you have a written implementation plan to execute - implements inline with subagent review gates for spec compliance and code quality
---

# Executing Plans

## Overview

Execute implementation plans by implementing tasks inline (fast) with independent subagent reviews (unbiased). Combines speed of inline execution with quality assurance of fresh-context reviewers.

**Core principle:** Inline implementation + subagent review gates = fast execution with independent quality checks.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

## The Process

```
For each task triplet (Implement → Spec Review → Code Review):
  1. Mark "Implement" in_progress
  2. Implement inline (TDD)
  3. Commit
  4. Mark "Implement" complete
  5. Mark "Spec Review" in_progress
  6. Dispatch spec reviewer subagent
  7. If APPROVED → mark "Spec Review" complete
     If ISSUES → fix inline, amend, re-dispatch
  8. Mark "Code Review" in_progress
  9. Dispatch code quality reviewer subagent
  10. If APPROVED → mark "Code Review" complete
      If ISSUES → fix inline, amend, re-dispatch
  11. Proceed to next triplet (now unblocked)

After all triplets:
  Use completing-work
```

### Step 1: Load and Review Plan

1. Read plan file
2. Review critically - identify any questions or concerns
3. If concerns: Raise them before starting
4. If no concerns: Check for existing tasks and proceed

**Check for existing tasks:**
```
TaskList
```

- If tasks exist from writing-plans: use them
- If no tasks (new session): re-create tasks from plan using TaskCreate

### Step 2: Execute Each Task

For each task in order:

#### 2a. Mark In Progress

```
TaskUpdate:
  taskId: [task-id]
  status: in_progress
```

This triggers the CLI spinner showing the task's `activeForm`.

#### 2b. Implement Inline

Follow the plan's steps exactly. Use TDD:
- Write failing test
- Verify it fails
- Write minimal implementation
- Verify it passes
- Refactor if needed

**Reference:** Skill(test-driven-development) for TDD discipline.

#### 2c. Commit

```bash
git add -A
git commit -m "feat: [task description]"
```

Capture the commit SHAs for review by running these commands directly:
```bash
git rev-parse HEAD~1
```
Note this output as BASE_SHA.

```bash
git rev-parse HEAD
```
Note this output as HEAD_SHA.

#### 2d. Dispatch Spec Reviewer

Use prompt template at `./spec-reviewer-prompt.md`

Fill in:
- Task requirements (full text from plan)
- What was implemented (your summary)

**If spec reviewer finds issues:**
1. Fix issues inline
2. Amend commit: `git add -A && git commit --amend --no-edit`
3. Re-dispatch spec reviewer
4. Repeat until approved

**Only proceed to code quality review after spec compliance passes.**

#### 2e. Dispatch Code Quality Reviewer

Use prompt template at `./code-quality-reviewer-prompt.md`

The code-reviewer subagent uses the template at `./code-reviewer-template.md`.

Fill in:
- WHAT_WAS_IMPLEMENTED: Task summary
- PLAN_OR_REQUIREMENTS: Task text from plan
- BASE_SHA: Commit before this task
- HEAD_SHA: Current commit
- DESCRIPTION: Brief description

**If code reviewer finds issues:**
- **Critical:** Fix immediately, amend commit, re-review
- **Important:** Fix immediately, amend commit, re-review
- **Minor:** Note for later or fix now (judgment call)

#### 2f. Mark Complete

```
TaskUpdate:
  taskId: [task-id]
  status: completed
```

Proceed to next task.

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

- Tasks created by writing-plans persist for the session
- If starting a new session with an existing plan, re-create tasks using TaskCreate
- Plan document remains the source of truth for *what* to do
- Native tasks track *progress* through the work
- The `activeForm` field shows in the CLI spinner during `in_progress` status
