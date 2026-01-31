# Subagent Execution Design

## Problem

The current `executing-plans` skill implements tasks inline (in the main context), which causes the context to fill up and compact. This degrades model quality during long execution runs.

## Solution

Move implementation to a subagent, matching the pattern from superpowers' `subagent-driven-development` skill. The main context only orchestrates while subagents do the heavy lifting.

## Architecture

### Subagent Model

Three subagents per task:
1. **Implementer subagent** - implements, tests, commits, self-reviews
2. **Spec reviewer subagent** - verifies implementation matches spec
3. **Code quality reviewer subagent** - verifies code quality

Main context (controller) responsibilities:
- Read plan once, extract all tasks with full text
- Track task progress via native tasks
- Dispatch subagents with curated context
- Parse subagent output (APPROVED/ISSUES)
- Track implementer subagent IDs for resumption
- Orchestrate fix/re-review loops

### Process Flow

```
For each task:
  1. Controller marks "Implement" in_progress
  2. Controller dispatches implementer subagent with full task text
  3. Implementer implements, tests, commits, self-reviews
  4. Controller marks "Implement" complete
  5. Controller dispatches spec reviewer with task requirements + implementer report
  6. If ISSUES → resume implementer to fix → re-dispatch spec reviewer
  7. Controller marks "Spec Review" complete
  8. Controller dispatches code quality reviewer
  9. If ISSUES → resume implementer to fix → re-dispatch code reviewer
  10. Controller marks "Code Review" complete
  11. Proceed to next task

After all tasks:
  Use completing-work skill
```

### Fix/Re-review Loop

When a reviewer returns `ISSUES`:
1. Controller resumes the implementer subagent (preserves implementation context)
2. Implementer fixes issues and amends commit
3. Controller re-dispatches the same reviewer
4. Repeat until `APPROVED`

### Context Provision

Controller provides full task text in subagent prompts. Subagents do not read the plan file themselves. This prevents redundant file reads and lets the controller curate exactly what context each subagent needs.

### Implementer Questions

Implementer subagents do not ask clarifying questions - they proceed with the context provided. If they make wrong assumptions, the spec reviewer catches it. This simplifies orchestration.

## Design Decisions

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| Implementation location | Subagent | Prevents context pollution in main context |
| Fix loop | Resume implementer | Preserves implementation context for better fixes |
| Context provision | Controller provides | Prevents redundant file reads, curated context |
| Implementer questions | Not allowed | Simpler orchestration, spec review catches issues |

## Files to Change

1. `claude/skills/executing-plans/SKILL.md` - Update process to use implementer subagent
2. `claude/skills/executing-plans/implementer-prompt.md` - New prompt template
3. `DESIGN.md` - Update "Inline Implementation vs Subagents" section

## Files Unchanged

- `claude/skills/executing-plans/spec-reviewer-prompt.md` - Already works as subagent prompt
- `claude/skills/executing-plans/code-quality-reviewer-prompt.md` - Already works as subagent prompt
