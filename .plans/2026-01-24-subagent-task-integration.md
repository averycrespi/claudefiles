# Subagent Task Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Integrate review subagents with the native task system for visibility and enforcement.

**Architecture:** Modify writing-plans to create task triplets (Implement, Spec Review, Code Review) with blocking relationships. Modify executing-plans to manage review task lifecycle. Update reviewer prompts to use parseable output format.

**Tech Stack:** Claude Code native task tools (TaskCreate, TaskUpdate, TaskList)

---

### Task 1: Update writing-plans Task Creation

**Files:**
- Modify: `~/.claude/skills/writing-plans/SKILL.md:115-162`

**Step 1: Update the "Creating Native Tasks" section**

Replace lines 119-143 with the new triplet creation pattern:

```markdown
### Creating Native Tasks

As each task is written in the plan, create a task triplet:

**Implementation task:**
```
TaskCreate:
  subject: "Task N: Implement [Component Name]"
  description: |
    **Files:**
    - Create: `exact/path/to/file.py`
    - Test: `tests/path/test.py`

    **Steps:**
    1. Write failing test
    2. Run test to verify failure
    3. Implement minimal code
    4. Run test to verify pass
    5. Commit

    **Acceptance Criteria:**
    - Test exists and fails initially
    - Implementation passes test
    - Committed with descriptive message
  activeForm: "Implementing [Component Name]"
```

**Spec review task:**
```
TaskCreate:
  subject: "Task N: Spec Review"
  description: |
    Review implementation of Task N for spec compliance.
    Verify all requirements are met, nothing extra added.
    Use spec-reviewer-prompt.md template.
  activeForm: "Reviewing spec compliance for [Component Name]"
```

**Code review task:**
```
TaskCreate:
  subject: "Task N: Code Review"
  description: |
    Review implementation of Task N for code quality.
    Check tests, error handling, maintainability.
    Use code-quality-reviewer-prompt.md template.
  activeForm: "Reviewing code quality for [Component Name]"
```
```

**Step 2: Update the "Setting Dependencies" section**

Replace lines 145-155 with the triplet chain pattern:

```markdown
### Setting Dependencies

After all tasks are created, set `blockedBy` relationships to form triplet chains:

```
# Within each triplet:
TaskUpdate:
  taskId: [spec-review-id]
  addBlockedBy: [implement-id]

TaskUpdate:
  taskId: [code-review-id]
  addBlockedBy: [spec-review-id]

# Between triplets (Task 2 blocked by Task 1's code review):
TaskUpdate:
  taskId: [task-2-implement-id]
  addBlockedBy: [task-1-code-review-id]
```

This creates the chain: Implement 1 → Spec Review 1 → Code Review 1 → Implement 2 → ...
```

**Step 3: Verify the changes read correctly**

Read the file and confirm the new sections are clear and complete.

**Step 4: Commit**

```bash
git add ~/.claude/skills/writing-plans/SKILL.md
git commit -m "feat(writing-plans): create task triplets for review visibility"
```

---

### Task 2: Update executing-plans Process Overview

**Files:**
- Modify: `~/.claude/skills/executing-plans/SKILL.md:16-31`

**Step 1: Update "The Process" section**

Replace lines 16-31 with the triplet-aware process:

```markdown
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
```

**Step 2: Verify the changes read correctly**

Read the file and confirm the process overview is clear.

**Step 3: Commit**

```bash
git add ~/.claude/skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): update process overview for triplets"
```

---

### Task 3: Update executing-plans Task Execution Steps

**Files:**
- Modify: `~/.claude/skills/executing-plans/SKILL.md:48-133`

**Step 1: Replace "Step 2: Execute Each Task" section**

Replace lines 48-133 with the triplet execution flow:

```markdown
### Step 2: Execute Each Task Triplet

For each task triplet in order:

#### 2a. Implementation Phase

**Mark in progress:**
```
TaskUpdate:
  taskId: [implement-task-id]
  status: in_progress
```

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
```

**Step 2: Verify the changes read correctly**

Read the file and confirm the execution steps are clear and complete.

**Step 3: Commit**

```bash
git add ~/.claude/skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): add triplet execution with review tasks"
```

---

### Task 4: Update executing-plans Task Recreation Logic

**Files:**
- Modify: `~/.claude/skills/executing-plans/SKILL.md:198-205`

**Step 1: Update "Native Task Notes" section**

Replace lines 198-205 with triplet-aware notes:

```markdown
## Native Task Notes

- Tasks created by writing-plans include triplets: Implement, Spec Review, Code Review
- If starting a new session with an existing plan, re-create all triplets with blocking relationships
- Blocking chain: Implement N → Spec Review N → Code Review N → Implement N+1
- Plan document remains the source of truth for *what* to do
- Native tasks track *progress* and *enforce review gates*
- The `activeForm` field shows in the CLI spinner during `in_progress` status
- Review tasks must be marked complete before the next triplet can start (enforced by blockedBy)
```

**Step 2: Verify the changes read correctly**

Read the file and confirm the notes section is accurate.

**Step 3: Commit**

```bash
git add ~/.claude/skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): update task notes for triplet model"
```

---

### Task 5: Update Spec Reviewer Output Format

**Files:**
- Modify: `~/.claude/skills/executing-plans/spec-reviewer-prompt.md:60-62`

**Step 1: Update the "Report" section in the prompt template**

Replace lines 60-62 with parseable output format:

```markdown
    Report format (use EXACTLY this format for parsing):
    - If compliant: "APPROVED: [brief confirmation of what was verified]"
    - If issues: "ISSUES:\n- [issue 1 with file:line]\n- [issue 2 with file:line]"
```

**Step 2: Verify the changes read correctly**

Read the file and confirm the output format is clear.

**Step 3: Commit**

```bash
git add ~/.claude/skills/executing-plans/spec-reviewer-prompt.md
git commit -m "feat(executing-plans): add parseable output format for spec reviewer"
```

---

### Task 6: Update Code Quality Reviewer Output Format

**Files:**
- Modify: `~/.claude/skills/executing-plans/code-quality-reviewer-prompt.md:23-35`

**Step 1: Update the return format section**

Replace lines 23-35 with parseable output format:

```markdown
**Code reviewer output format (use EXACTLY this format for parsing):**
- If approved: "APPROVED: [brief summary of what's well done]"
- If approved with minor issues: "APPROVED_WITH_MINOR: [summary]\nMinor issues noted:\n- [issue 1]\n- [issue 2]"
- If issues requiring fixes: "ISSUES:\nCritical:\n- [issue with file:line]\nImportant:\n- [issue with file:line]"

**Handling feedback:**
- **APPROVED:** Proceed to next phase
- **APPROVED_WITH_MINOR:** Proceed, issues noted for later
- **ISSUES (Critical/Important):** Fix immediately, amend commit, re-review
```

**Step 2: Verify the changes read correctly**

Read the file and confirm the output format is clear.

**Step 3: Commit**

```bash
git add ~/.claude/skills/executing-plans/code-quality-reviewer-prompt.md
git commit -m "feat(executing-plans): add parseable output format for code reviewer"
```

---

## Summary

After completing all tasks:

1. **writing-plans** creates task triplets with blocking relationships
2. **executing-plans** manages review task lifecycle (in_progress → complete)
3. **Spec reviewer** outputs `APPROVED:` or `ISSUES:` for parsing
4. **Code reviewer** outputs `APPROVED:`, `APPROVED_WITH_MINOR:`, or `ISSUES:` for parsing
5. Blocking relationships enforce that reviews happen before proceeding
