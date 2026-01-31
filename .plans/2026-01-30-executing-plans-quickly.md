# executing-plans-quickly Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) or Skill(executing-plans-quickly) to implement this plan task-by-task.

**Goal:** Add a lightweight plan execution skill that does implementation and reviews inline without subagent dispatch.

**Architecture:** Create new skill `executing-plans-quickly` with inline review checklists, update `writing-plans` to offer three execution options, update documentation.

**Tech Stack:** Markdown skills, no code dependencies

---

### Task 1: Create executing-plans-quickly Skill

**Files:**
- Create: `~/.claude/skills/executing-plans-quickly/SKILL.md`

**Step 1: Create skill directory**

```bash
mkdir -p ~/.claude/skills/executing-plans-quickly
```

**Step 2: Write SKILL.md**

Create `~/.claude/skills/executing-plans-quickly/SKILL.md` with the following content:

```markdown
---
name: executing-plans-quickly
description: Use when you have a written implementation plan to execute quickly - does implementation and reviews inline in main context without subagent dispatch
---

# Executing Plans Quickly

## Overview

Execute implementation plans inline in the main context. Same task triplet structure and review discipline as `executing-plans`, but without subagent dispatch for faster execution.

**Core principle:** Inline execution trades isolation for speed - best for simple plans where context pollution isn't a concern.

**Announce at start:** "I'm using the executing-plans-quickly skill to implement this plan inline."

**REQUIRED SUB-SKILL:** Use Skill(asking-questions) for all user questions.

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
```

**Step 3: Verify file exists**

```bash
cat ~/.claude/skills/executing-plans-quickly/SKILL.md | head -5
```

Expected output: YAML frontmatter with name and description

**Step 4: Commit**

```bash
git add ~/.claude/skills/executing-plans-quickly/SKILL.md
git commit -m "feat: add executing-plans-quickly skill"
```

---

### Task 2: Update writing-plans Skill

**Files:**
- Modify: `~/.claude/skills/writing-plans/SKILL.md:99-129`

**Step 1: Update the Execution Handoff section**

Replace the "Execution Handoff" section (lines 99-129) with:

```markdown
## Execution Handoff

After saving the plan:
- Commit the plan document to git

Then ask the user if they want to execute using `AskUserQuestion`:

```javascript
AskUserQuestion(
  questions: [{
    question: "Plan is ready. How would you like to proceed?",
    header: "Execute",
    multiSelect: false,
    options: [
      { label: "Execute with subagents (Recommended)", description: "Full isolation - best for complex plans or autonomous work" },
      { label: "Execute quickly", description: "Faster - does implementation and reviews in main context" },
      { label: "Don't execute", description: "Stop here - execute manually later" }
    ]
  }]
)
```

**Based on selection:**

**Execute with subagents:**
- **REQUIRED SUB-SKILL:** Use Skill(executing-plans)
- Dispatches subagents for implementation and reviews
- Best for complex plans or autonomous work

**Execute quickly:**
- **REQUIRED SUB-SKILL:** Use Skill(executing-plans-quickly)
- Does implementation and reviews inline in main context
- Best for simple plans or interactive sessions

**Don't execute:**
- Plan is saved for later execution
- User can invoke execution skills in any session
```

**Step 2: Verify the change**

```bash
grep -A 5 "Execute with subagents" ~/.claude/skills/writing-plans/SKILL.md
```

Expected: Shows the new option with description

**Step 3: Commit**

```bash
git add ~/.claude/skills/writing-plans/SKILL.md
git commit -m "feat(writing-plans): add quick execution option"
```

---

### Task 3: Update CLAUDE.md

**Files:**
- Modify: `/Users/avery/Workspace/claudefiles/CLAUDE.md:47-53`

**Step 1: Update the Workflow Skills table**

Find the workflow skills table and add the new skill. The table should become:

```markdown
| Skill                     | Purpose                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `brainstorming`           | Turn ideas into designs through collaborative dialogue      |
| `writing-plans`           | Create detailed implementation plans with TDD steps         |
| `executing-plans`         | Execute plans with subagent implementation + reviews        |
| `executing-plans-quickly` | Execute plans inline without subagents for simple tasks     |
| `completing-work`         | Verify tests, present options, create PR                    |
```

**Step 2: Verify the change**

```bash
grep "executing-plans-quickly" /Users/avery/Workspace/claudefiles/CLAUDE.md
```

Expected: Shows the new row in the table

**Step 3: Commit**

```bash
git add /Users/avery/Workspace/claudefiles/CLAUDE.md
git commit -m "docs(CLAUDE.md): add executing-plans-quickly to workflow skills"
```

---

### Task 4: Update README.md

**Files:**
- Modify: `/Users/avery/Workspace/claudefiles/README.md:36-98`

**Step 1: Update the mermaid diagram**

Replace the Executing subgraph (lines 48-55) to indicate both options:

```markdown
    subgraph Executing["executing-plans / executing-plans-quickly"]
        E1[Implement with TDD] --> E2[Commit changes]
        E2 --> E3[Spec + code review]
        E3 -->|pass| E4[Next task]
        E3 -->|fail| E1
    end
```

**Step 2: Update "When to Use This Workflow" section**

After the existing content about structured workflow vs Claude Code planning mode (around line 98), add:

```markdown

**Choosing an execution mode:**

When you choose to execute a plan, you'll be offered two modes:

| Mode | Best for | Trade-off |
|------|----------|-----------|
| **Execute with subagents** | Complex plans, autonomous work | Slower but prevents context pollution |
| **Execute quickly** | Simple plans, interactive sessions | Faster but all work happens in main context |

Both modes use the same task triplet structure (Implement → Spec Review → Code Review) and the same review discipline. The difference is whether work happens in subagents or inline.
```

**Step 3: Verify the changes**

```bash
grep "executing-plans-quickly" /Users/avery/Workspace/claudefiles/README.md
```

Expected: Shows the updated diagram label

**Step 4: Commit**

```bash
git add /Users/avery/Workspace/claudefiles/README.md
git commit -m "docs(README): document quick execution mode"
```
