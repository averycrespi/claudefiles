---
name: writing-plans
description: Use when you have a spec or design document and need to break it into a detailed implementation plan with right-sized tasks
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan, with each task sized to a single self-contained unit of change. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `.plans/YYYY-MM-DD-<feature-name>.md`

## Task Sizing

Each task is one self-contained, single-PR-scope unit of change — what would naturally land as a single commit and be reviewable on its own. Do not decompose tasks into atomic steps like "write the test" / "run the test" / "implement" — that level of choreography belongs to the implementer subagent, not the plan.

A task is sized correctly when:

- Its acceptance criteria fit in 1–3 specific, verifiable bullets
- It changes one conceptual unit (one component, one feature slice, one refactor phase)
- It produces one commit at the end

**Vary task size by complexity:**

- **Simple work** — renames, version bumps, doc updates, applying an existing pattern, one-line config changes. Bundle related simple work into a single task. Don't create separate tasks for "add the constant" and "use the constant" — that's one task.
- **Standard work** — a new function with tests, a new endpoint following existing patterns, refactoring one module's internals, adding a config option. One task. This is the default size.
- **Complex or risky work** — auth, security, or data-integrity changes; new abstractions; cross-cutting refactors; anything where you couldn't draft acceptance criteria without thinking hard. Keep tasks tight and split aggressively. Touching more than ~5 files or introducing a new abstraction is a signal to split.

**When in doubt, size up.** The cost of treating something as more complex than it is = one extra review pass. The cost of bundling something risky with something simple = shipping a bug inside a too-large diff.

No fixed cap on tasks per plan — let the plan be as long as the work is. But if a task's acceptance criteria don't fit in 1–3 bullets, it's too big — split it.

## Plan Document Header

**Every plan MUST start with this header:**

<header>
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---

</header>

## Task Structure

Each task must follow this structure:

<task>
### Task N: [Component Name]

**Files:**

- Create: `exact/path/to/file.ext`
- Modify: `exact/path/to/existing.ext:123-145`
- Test: `tests/exact/path/to/test.ext`

**Acceptance Criteria:**

- [Specific, verifiable bullet — e.g., "`function([])` returns `None` and does not raise"]
- [...]

**Notes:** [Non-obvious context, dependencies on prior tasks, gotchas]

**Commit:** `<type>(<scope>): <description>`

</task>

The implementer subagent handles the red-green-refactor cycle internally — your job is to specify _what counts as done_, not _how to get there_.

## Documentation Task

Before writing tasks, scan the project's documentation files (README.md, CLAUDE.md, docs/, etc.) and identify which sections would become stale after the planned changes. Then:

- **If docs need updating:** Add a final task that updates the specific files and sections affected. This task follows the same structure as any other task — list the files, the sections to change, the new content, and a commit. It gets spec-reviewed and code-reviewed like everything else.
- **If no docs need updating** (e.g., pure internal refactor): Add a comment at the end of the plan: `<!-- No documentation updates needed -->` so it's a conscious decision, not an oversight.

## Remember

- Exact file paths always — but **always relative to the repo root**, never absolute paths
- **Never hardcode the repository's absolute path** (e.g., `/Users/alice/project`) anywhere in the plan — plans may be executed in worktrees at different paths
- Never include `cd /absolute/path` commands — use relative paths or assume the working directory is the repo root
- Complete code in plan (not "add validation")
- Exact commands with expected output
- Reference relevant skills with @ syntax
- DRY, YAGNI, TDD, frequent commits

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
