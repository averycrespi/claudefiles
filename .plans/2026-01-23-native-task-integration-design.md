# Native Task Integration Design

## Goal

Integrate Claude Code's native task management tools (`TaskCreate`, `TaskUpdate`, `TaskList`) into the workflow skills, replacing `TodoWrite` references with structured task tracking and dependency management.

## Background

Claude Code v2.1.16 introduced native task management with:
- Explicit dependencies (`blockedBy` relationships)
- Status tracking (`pending`/`in_progress`/`completed`)
- Task ownership for multi-agent workflows
- CLI visibility with spinner showing `activeForm`

Reference: [superpowers PR #344](https://github.com/obra/superpowers/pull/344)

## Architecture

**Dual-track approach:**
- Plan document remains the permanent record (persists across sessions)
- Native tasks provide in-session visibility and progress tracking
- Re-create tasks from plan when resuming in a new session

**Integration points:**

| Skill | Integration |
|-------|-------------|
| brainstorming | None - stays conversational |
| writing-plans | Create tasks + set dependencies |
| executing-plans | Check/create tasks at load, update status during execution |
| completing-work | Verify all tasks completed before offering options |

## Detailed Design

### writing-plans

Add a "Native Task Integration" section after the existing content.

**Task creation:** As each task is written in the plan, create a corresponding native task:

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

**Dependencies:** After all tasks created, set `blockedBy` relationships:

```
TaskUpdate:
  taskId: [task-id]
  addBlockedBy: [prerequisite-task-ids]
```

Dependencies follow task order by default (Task 2 blocked by Task 1) unless the plan specifies otherwise.

### executing-plans

Replace `TodoWrite` references with native task tools.

**Step 1 (Load and Review Plan):** Change from "Create TodoWrite with all tasks" to:

```
TaskList  # Check if tasks exist from writing-plans
```

- If tasks exist: use them
- If no tasks (new session): re-create from plan document

**Step 2a (Mark In Progress):** Change from "Mark task as in_progress in TodoWrite" to:

```
TaskUpdate:
  taskId: [task-id]
  status: in_progress
```

This triggers CLI spinner showing the `activeForm`.

**Step 2f (Mark Complete):** Change from "Mark task as completed in TodoWrite" to:

```
TaskUpdate:
  taskId: [task-id]
  status: completed
```

### completing-work

Add task verification before test verification (new Step 0).

**Step 0 (Verify Task Completion):**

```
TaskList  # Check task completion status
```

If any tasks remain `in_progress` or `pending`:

```
Warning: [N] tasks not marked complete:
- Task 2: [subject] (in_progress)
- Task 5: [subject] (pending)

Continue anyway, or return to complete tasks?
```

If all tasks `completed`: proceed silently to test verification.

### brainstorming

No changes. Brainstorming produces designs through conversation, not tasks. Task creation happens in writing-plans where concrete work items are defined.

## Files to Modify

- `claude/skills/writing-plans/SKILL.md` - Add native task creation section
- `claude/skills/executing-plans/SKILL.md` - Replace TodoWrite with native tasks
- `claude/skills/completing-work/SKILL.md` - Add task verification step

## Non-Goals

- Persisting tasks across sessions (plan document serves this purpose)
- Adding task creation to brainstorming (keeps it conversational)
- Multi-agent task assignment (out of scope for this integration)

## Testing

- Verify writing-plans creates tasks with correct structure
- Verify executing-plans updates task status during execution
- Verify completing-work warns on incomplete tasks
- Verify new session can re-create tasks from existing plan
