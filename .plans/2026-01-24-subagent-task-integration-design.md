# Subagent Task Integration Design

> **Goal:** Integrate Claude Code's task system with spec reviewer and code reviewer subagents for visibility and enforcement.

## Problem

Currently:
- `writing-plans` creates tasks for implementation work
- `executing-plans` tracks implementation progress via tasks
- Spec and code reviewers run as subagents but aren't tracked in the task system
- No enforcement that reviews actually happened

## Solution

Pre-create review tasks in `writing-plans` with blocking relationships that enforce the review workflow.

## Task Structure

For each implementation task in the plan, create a triplet:

```
Task N: Implement [Component]
  status: pending
  activeForm: "Implementing [Component]"

Task N: Spec Review
  status: pending
  blockedBy: [implement-task-id]
  activeForm: "Reviewing spec compliance for [Component]"

Task N: Code Review
  status: pending
  blockedBy: [spec-review-task-id]
  activeForm: "Reviewing code quality for [Component]"
```

Blocking chain across tasks:
- Implement N → Spec Review N → Code Review N → Implement N+1

## Execution Flow

```
For each task triplet (Implement → Spec Review → Code Review):

  1. Mark "Implement" in_progress
  2. Implement using TDD, commit
  3. Mark "Implement" complete

  4. Mark "Spec Review" in_progress
  5. Dispatch spec reviewer subagent via Task tool
  6. Parse subagent output:
     - If "APPROVED" → mark "Spec Review" complete
     - If "ISSUES" → fix inline, amend commit, re-dispatch

  7. Mark "Code Review" in_progress
  8. Dispatch code reviewer subagent via Task tool
  9. Parse subagent output:
     - If "APPROVED" → mark "Code Review" complete
     - If "APPROVED_WITH_MINOR" → mark complete, note issues
     - If "ISSUES" (critical/important) → fix, amend, re-dispatch

  10. Proceed to next triplet (now unblocked)
```

## Subagent Output Format

Subagents remain independent - they don't interact with the task system. The main agent parses their output to determine task completion.

**Spec reviewer:**
```
APPROVED: [brief confirmation]
```
or
```
ISSUES:
- [issue 1 with file:line]
- [issue 2 with file:line]
```

**Code reviewer:**
```
APPROVED: [brief summary]
```
or
```
APPROVED_WITH_MINOR: [summary]
Minor issues noted: [list]
```
or
```
ISSUES:
Critical: [list]
Important: [list]
```

## Files to Modify

1. **`writing-plans/SKILL.md`**
   - Update task creation to produce triplets
   - Update dependency setup for triplet chains

2. **`executing-plans/SKILL.md`**
   - Update execution loop to work through triplets
   - Add review task state management
   - Add subagent output parsing logic

3. **`executing-plans/spec-reviewer-prompt.md`**
   - Add explicit output format (APPROVED / ISSUES prefix)

4. **`executing-plans/code-quality-reviewer-prompt.md`**
   - Add explicit output format (APPROVED / APPROVED_WITH_MINOR / ISSUES prefix)

## Benefits

- **Visibility:** `TaskList` shows all work including reviews
- **Enforcement:** Blocking relationships prevent skipping reviews
- **Progress:** CLI spinner shows review status during execution
- **Independence:** Subagents remain fresh-context reviewers
