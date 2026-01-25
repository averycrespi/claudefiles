# Move Task Management to Execution Skill

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Move all native task creation from `writing-plans` to `executing-plans` so plans can be cleanly re-executed from any session.

**Architecture:** Plan file becomes the only output of planning. Tasks are created at the start of execution, with an option to resume existing tasks or start fresh.

**Tech Stack:** Claude Code skills (markdown files)

---

## Background

Currently, native tasks are created during `writing-plans` and then tracked during `executing-plans`. This creates friction when:
- Starting a new session to execute an existing plan (tasks are session-scoped, so they're gone)
- Re-running a completed plan (e.g., on a different branch)

The plan document already persists across sessions—tasks should be ephemeral runtime tracking, created fresh each time execution begins.

---

## Task 1: Remove Task Creation from `writing-plans`

**Files:**
- Modify: `claude/skills/writing-plans/SKILL.md:117-196`

**Step 1: Delete the "Native Task Integration" section**

Remove lines 117-196 entirely (from `## Native Task Integration` to the end of the file).

**Step 2: Verify the file ends cleanly**

The file should end after line 112 (`- User can run \`Skill(executing-plans)\` in any session`), with a single trailing newline.

**Step 3: Commit**

```bash
git add claude/skills/writing-plans/SKILL.md
git commit -m "refactor(writing-plans): remove task creation, plans only produce documents"
```

---

## Task 2: Add Task Initialization Flow to `executing-plans`

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md:39-52`

**Step 1: Replace the current "Step 1: Load and Review Plan" section**

Replace lines 39-52 with the new initialization flow:

```markdown
### Step 1: Load Plan and Initialize Tasks

1. Read plan file
2. Review critically - identify any questions or concerns
3. If concerns: Raise them before starting
4. If no concerns: Initialize task tracking

**Initialize task tracking:**

```
TaskList
```

- **If tasks exist for this plan:** Ask the user: "Found existing tasks. Continue from where you left off, or start fresh in a new session?"
  - **Continue:** Use existing tasks, resume from first non-completed triplet
  - **Start fresh:** Advise user to start a new session for clean execution (tasks are session-scoped and cannot be deleted)
- **If no tasks exist:** Create all task triplets from the plan (see "Creating Tasks from Plan" below)
```

**Step 2: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): add task initialization with resume/fresh option"
```

---

## Task 3: Add Task Creation Logic to `executing-plans`

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md` (insert new section before "Step 2: Execute Each Task Triplet")

**Step 1: Add "Creating Tasks from Plan" section**

Insert after the new Step 1, before Step 2:

```markdown
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
```

**Step 2: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): add task creation logic from plan"
```

---

## Task 4: Update Native Task Notes Section

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md:229-238`

**Step 1: Replace the "Native Task Notes" section**

Replace lines 229-238 with:

```markdown
## Native Task Notes

- Tasks are created by this skill at the start of execution, not during planning
- Task triplets: Implement, Spec Review, Code Review for each plan task
- Blocking chain: Implement N → Spec Review N → Code Review N → Implement N+1
- Plan document is the source of truth for *what* to do
- Native tasks track *progress* and *enforce review gates*
- The `activeForm` field shows in the CLI spinner during `in_progress` status
- If resuming execution, existing tasks are reused; otherwise created fresh
```

**Step 2: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "docs(executing-plans): update native task notes for new flow"
```

---

## Summary

| Skill | Before | After |
|-------|--------|-------|
| `writing-plans` | Creates plan + tasks | Creates plan only |
| `executing-plans` | Uses existing tasks or recreates | Always initializes tasks, offers resume/fresh choice |

**Benefits:**
- Plan file is single source of truth
- Clean re-execution from any session
- Clear separation: planning = what, execution = tracking
- Option to resume interrupted execution
