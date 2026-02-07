# Native Task Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Integrate Claude Code's native task management tools into the workflow skills, replacing TodoWrite with structured task tracking.

**Architecture:** Add native task sections to writing-plans (task creation), executing-plans (status updates), and completing-work (verification). Plan document remains permanent record; native tasks provide session visibility.

**Tech Stack:** Claude Code native tools (TaskCreate, TaskUpdate, TaskList)

---

### Task 1: Add Native Task Integration to writing-plans

**Files:**
- Modify: `claude/skills/writing-plans/SKILL.md:112` (append after line 111)

**Step 1: Append native task integration section**

Add the following content at the end of the file (after line 111):

```markdown
---

## Native Task Integration

**REQUIRED:** Use Claude Code's native task tools to create structured tasks alongside the plan document.

### Creating Native Tasks

As each task is written in the plan, create a corresponding native task:

```
TaskCreate:
  subject: "Task N: [Component Name]"
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

### Setting Dependencies

After all tasks are created, set `blockedBy` relationships based on task order:

```
TaskUpdate:
  taskId: [task-id]
  addBlockedBy: [prerequisite-task-ids]
```

Task 2 is blocked by Task 1, Task 3 is blocked by Task 2, etc., unless the plan specifies otherwise.

### Notes

- Plan document remains the permanent record (persists across sessions)
- Native tasks provide CLI-visible progress tracking
- Tasks are session-scoped; executing-plans will re-create from plan if needed
```

**Step 2: Verify the file**

Run: `tail -50 claude/skills/writing-plans/SKILL.md`
Expected: New "Native Task Integration" section visible at end

**Step 3: Commit**

```bash
git add claude/skills/writing-plans/SKILL.md
git commit -m "feat(writing-plans): add native task integration"
```

---

### Task 2: Replace TodoWrite with Native Tasks in executing-plans

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md:33-47` (Step 1 and Step 2a)
- Modify: `claude/skills/executing-plans/SKILL.md:112-116` (Step 2f)
- Modify: `claude/skills/executing-plans/SKILL.md:180` (append new section)

**Step 1: Update Step 1 (Load and Review Plan)**

Replace lines 33-38:
```markdown
### Step 1: Load and Review Plan

1. Read plan file
2. Review critically - identify any questions or concerns
3. If concerns: Raise them before starting
4. If no concerns: Create TodoWrite with all tasks and proceed
```

With:
```markdown
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
```

**Step 2: Update Step 2a (Mark In Progress)**

Replace lines 44-47:
```markdown
#### 2a. Mark In Progress
```
Mark task as in_progress in TodoWrite
```
```

With:
```markdown
#### 2a. Mark In Progress

```
TaskUpdate:
  taskId: [task-id]
  status: in_progress
```

This triggers the CLI spinner showing the task's `activeForm`.
```

**Step 3: Update Step 2f (Mark Complete)**

Replace lines 112-116:
```markdown
#### 2f. Mark Complete

```
Mark task as completed in TodoWrite
```

Proceed to next task.
```

With:
```markdown
#### 2f. Mark Complete

```
TaskUpdate:
  taskId: [task-id]
  status: completed
```

Proceed to next task.
```

**Step 4: Append native task notes section**

Add at end of file (after line 180):

```markdown
---

## Native Task Notes

- Tasks created by writing-plans persist for the session
- If starting a new session with an existing plan, re-create tasks using TaskCreate
- Plan document remains the source of truth for *what* to do
- Native tasks track *progress* through the work
- The `activeForm` field shows in the CLI spinner during `in_progress` status
```

**Step 5: Verify the file**

Run: `grep -n "TaskUpdate\|TaskList\|TodoWrite" claude/skills/executing-plans/SKILL.md`
Expected: TaskUpdate/TaskList references, no TodoWrite references

**Step 6: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): replace TodoWrite with native tasks"
```

---

### Task 3: Add Task Verification to completing-work

**Files:**
- Modify: `claude/skills/completing-work/SKILL.md:12` (update core principle)
- Modify: `claude/skills/completing-work/SKILL.md:16-18` (insert new Step 0)
- Modify: `claude/skills/completing-work/SKILL.md:156-159` (update Always section)

**Step 1: Update core principle**

Replace line 12:
```markdown
**Core principle:** Verify tests → Reflect on learnings → Present options → Execute choice.
```

With:
```markdown
**Core principle:** Verify task completion → Verify tests → Reflect on learnings → Present options → Execute choice.
```

**Step 2: Insert new Step 0 before Step 1**

Insert after line 16 (`## The Process`), before the current Step 1:

```markdown
### Step 0: Verify Task Completion

**Before verifying tests, check that all tasks are complete:**

```
TaskList
```

**If any tasks remain `in_progress` or `pending`:**
```
Warning: [N] tasks not marked complete:
- Task 2: [subject] (in_progress)
- Task 5: [subject] (pending)

Continue anyway, or return to complete tasks?
```

Use `AskUserQuestion` to let user decide.

**If all tasks `completed`:** Proceed silently to Step 1.

**If no tasks exist:** Proceed silently to Step 1 (plan may have been executed without native task tracking).

```

**Step 3: Update the Always section in Red Flags**

Replace lines 156-159:
```markdown
**Always:**
- Verify tests before offering options
- Skip reflection silently if no learnings to propose
- Present exactly 2 options
```

With:
```markdown
**Always:**
- Verify task completion before verifying tests
- Verify tests before offering options
- Skip reflection silently if no learnings to propose
- Present exactly 2 options
```

**Step 4: Verify the file**

Run: `grep -n "TaskList\|task completion\|Step 0" claude/skills/completing-work/SKILL.md`
Expected: References to TaskList and task completion verification

**Step 5: Commit**

```bash
git add claude/skills/completing-work/SKILL.md
git commit -m "feat(completing-work): add task verification step"
```

---

## Verification

After all tasks complete:

1. Read each modified skill file to verify changes are correct
2. Manually test the workflow:
   - Run writing-plans on a small feature
   - Verify tasks are created with TaskList
   - Run executing-plans
   - Verify status updates appear
   - Run completing-work
   - Verify task verification occurs
