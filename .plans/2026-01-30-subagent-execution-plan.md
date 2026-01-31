# Subagent Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Move implementation from inline to subagent in the executing-plans skill, preventing context pollution.

**Architecture:** Controller orchestrates (reads plan, dispatches subagents, tracks progress). Implementer subagent does the heavy lifting (implements, tests, commits). Reviewer subagents verify spec compliance and code quality. Fix loops resume the implementer subagent.

**Tech Stack:** Claude Code skills (markdown), Task tool for subagent dispatch

---

### Task 1: Create Implementer Prompt Template

**Files:**
- Create: `claude/skills/executing-plans/implementer-prompt.md`

**Step 1: Create the implementer prompt template**

```markdown
# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent.

**Purpose:** Implement a single task from the plan, following TDD.

**When to dispatch:** When starting the implementation phase of a task triplet.

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: |
    You are implementing Task N: [task name]

    ## Task Description

    [FULL TEXT of task from plan - controller pastes here]

    ## Context

    [Scene-setting: where this fits in the plan, dependencies on previous tasks,
    relevant architectural decisions from design doc if any]

    ## Your Job

    1. Implement exactly what the task specifies (nothing more, nothing less)
    2. Write tests following TDD (red-green-refactor)
    3. Verify all tests pass
    4. Commit your work with conventional commit message
    5. Self-review (see below)
    6. Report back

    Working directory: [directory path]

    ## Self-Review Checklist

    Before reporting, review your own work:

    **Completeness:**
    - Did I implement everything in the spec?
    - Did I miss any edge cases?

    **Discipline:**
    - Did I avoid overbuilding (YAGNI)?
    - Did I only build what was requested?
    - Did I follow existing patterns in the codebase?

    **Testing:**
    - Do tests verify actual behavior?
    - Did I follow TDD (write test first, see it fail, make it pass)?

    If you find issues during self-review, fix them before reporting.

    ## Report Format

    When done, report:
    - What you implemented
    - Test results (which tests, pass/fail)
    - Files changed
    - Self-review findings (if any issues found and fixed)
    - Commit SHA
```

## Fix Prompt

When resuming an implementer to fix issues found by a reviewer:

```
Task tool (general-purpose):
  resume: [implementer-agent-id]
  prompt: |
    The [spec/code quality] reviewer found issues with your implementation:

    [ISSUES from reviewer output]

    Please fix these issues:
    1. Make the fixes
    2. Run tests to verify nothing broke
    3. Amend commit: git add -A && git commit --amend --no-edit
    4. Report back with what you fixed and the new commit SHA
```
```

**Step 2: Verify the file was created correctly**

Run: `cat claude/skills/executing-plans/implementer-prompt.md | head -20`
Expected: Shows the header and first section of the template

**Step 3: Commit**

```bash
git add claude/skills/executing-plans/implementer-prompt.md
git commit -m "feat: add implementer subagent prompt template"
```

---

### Task 2: Update SKILL.md - Overview and Core Principle

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md:1-38`

**Step 1: Update the frontmatter description**

Change line 3 from:
```
description: Use when you have a written implementation plan to execute - implements inline with subagent review gates for spec compliance and code quality
```

To:
```
description: Use when you have a written implementation plan to execute - dispatches subagents for implementation and reviews to prevent context pollution
```

**Step 2: Update the Overview section**

Replace lines 8-16 with:
```markdown
## Overview

Execute implementation plans by dispatching subagents for each phase: implementation, spec review, and code quality review. The main context only orchestrates while subagents do the heavy lifting, preventing context pollution that degrades model quality.

**Core principle:** Subagent per phase + controller orchestration = preserved model quality throughout long execution runs.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**REQUIRED SUB-SKILL:** Use Skill(asking-questions) for all user questions.
```

**Step 3: Update the Process diagram**

Replace lines 18-38 with:
```markdown
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
```

**Step 4: Verify changes**

Run: `head -40 claude/skills/executing-plans/SKILL.md`
Expected: Shows updated overview and process

**Step 5: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "refactor: update SKILL.md overview for subagent execution"
```

---

### Task 3: Update SKILL.md - Implementation Phase

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md:133-175`

**Step 1: Replace the Implementation Phase section**

Replace the "#### 2a. Implementation Phase" section (lines 137-174) with:

```markdown
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

**Mark complete:**
```
TaskUpdate:
  taskId: [implement-task-id]
  status: completed
```
```

**Step 2: Verify changes**

Run: `sed -n '133,180p' claude/skills/executing-plans/SKILL.md`
Expected: Shows updated implementation phase with subagent dispatch

**Step 3: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "refactor: update implementation phase to use subagent"
```

---

### Task 4: Update SKILL.md - Fix/Re-review Loop

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md:189-198` (spec review fix loop)
- Modify: `claude/skills/executing-plans/SKILL.md:228-236` (code review fix loop)

**Step 1: Update spec review fix loop**

Replace the "Fix/re-review loop" section in spec review (around lines 191-197) with:

```markdown
**Fix/re-review loop:**
1. Resume implementer subagent with fix instructions:
   ```
   Task tool (general-purpose):
     resume: [implementer_agent_id]
     prompt: |
       The spec reviewer found issues:
       [ISSUES from reviewer output]

       Fix these issues, run tests, amend commit, report back.
   ```
2. Parse response for new commit SHA
3. Re-dispatch spec reviewer
4. Repeat until `APPROVED`
```

**Step 2: Update code review fix loop**

Replace the "Fix/re-review loop" section in code review (around lines 230-235) with:

```markdown
**Fix/re-review loop (for critical/important issues):**
1. Resume implementer subagent with fix instructions:
   ```
   Task tool (general-purpose):
     resume: [implementer_agent_id]
     prompt: |
       The code quality reviewer found issues:
       [ISSUES from reviewer output]

       Fix these issues, run tests, amend commit, report back.
   ```
2. Parse response for new commit SHA
3. Re-dispatch code reviewer
4. Repeat until `APPROVED` or `APPROVED_WITH_MINOR`
```

**Step 3: Verify changes**

Run: `grep -A 15 "Fix/re-review loop" claude/skills/executing-plans/SKILL.md`
Expected: Shows both updated fix loops with resume pattern

**Step 4: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "refactor: update fix loops to resume implementer subagent"
```

---

### Task 5: Update SKILL.md - Prompt Templates Section

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md:264-269`

**Step 1: Update Prompt Templates section**

Replace lines 264-269 with:

```markdown
## Prompt Templates

- `./implementer-prompt.md` - Dispatch implementer subagent (includes fix prompt)
- `./spec-reviewer-prompt.md` - Verify implementation matches spec
- `./code-quality-reviewer-prompt.md` - Verify implementation is well-built
- `./code-reviewer-template.md` - Full template for code-reviewer subagent
```

**Step 2: Verify changes**

Run: `grep -A 6 "## Prompt Templates" claude/skills/executing-plans/SKILL.md`
Expected: Shows updated list including implementer-prompt.md

**Step 3: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "docs: add implementer prompt to templates list"
```

---

### Task 6: Update DESIGN.md

**Files:**
- Modify: `DESIGN.md:5-14`

**Step 1: Replace the "Inline Implementation vs Subagents" section**

Replace lines 5-14 with:

```markdown
## Full Subagent Execution

The original [superpowers](https://github.com/obra/superpowers) repository uses a **subagent for each task** during plan execution: one subagent implements, another reviews for spec compliance, another reviews for code quality.

This repository uses the **same full subagent approach**:

- **Implementation uses a subagent** - fresh context per task, no pollution of main context
- **Reviews use subagents** (spec compliance + code quality) - maintains independent perspective
- **Fix loops resume the implementer** - preserves implementation context for better fixes

The main context only orchestrates: reads plan, dispatches subagents, tracks progress. This prevents context pollution that degrades model quality during long execution runs.
```

**Step 2: Verify changes**

Run: `head -20 DESIGN.md`
Expected: Shows updated section title and content

**Step 3: Commit**

```bash
git add DESIGN.md
git commit -m "docs: update DESIGN.md for full subagent execution"
```
