---
name: completing-work
description: Use when finishing the structured development workflow after executing a plan - verifies task completion, reflects on learnings, and presents PR options
---

# Completing Work

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify task completion → Verify tests → Reflect on learnings → Present options → Execute choice → Holistic PR review.

**Announce at start:** "I'm using the completing-work skill to complete this work."

## The Process

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

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Reflect on Learnings

**If you have project-specific learnings from this session, present them for user approval.**

**What to look for:**
- Explicit corrections or guidance from the user during the session
- Findings from spec-reviewer and code-quality-reviewer subagents
- Friction points you figured out (build commands, test setup, file locations, naming conventions)
- Patterns discovered in existing code that weren't documented

**What makes a good reflection:**
- Actionable for future sessions (not one-off fixes)
- Project-specific (not general programming knowledge)
- Concise enough to fit naturally in CLAUDE.md

**What to exclude:**
- User preferences (belong in user's global CLAUDE.md, not project CLAUDE.md)
- Temporary workarounds or environment-specific quirks
- Things already documented in the project

**If you have learnings to propose:**

Use `AskUserQuestion` with `multiSelect: true`:

```
AskUserQuestion(
  questions: [{
    question: "Which learnings should be preserved in CLAUDE.md?",
    header: "Reflections",
    multiSelect: true,
    options: [
      {
        label: "<short label>",
        description: "<learning> → <target section in CLAUDE.md>"
      },
      // ... more options
    ]
  }]
)
```

**Example:**
```
options: [
  { label: "Build prereq", description: "Run `npm run build` before tests → ## Development" },
  { label: "API naming", description: "Query params use snake_case → new ## API Conventions" }
]
```

**After user selects:**
- If user selects any options → Update project CLAUDE.md, placing learnings in proposed sections
- Commit: `docs(CLAUDE.md): <summarize selected learnings>`
- If user selects nothing → Skip, continue to Step 3

**If no learnings to propose:** Skip silently, continue to Step 3.

### Step 3: Present Options

Use `AskUserQuestion` to present exactly 2 options:

```javascript
AskUserQuestion(
  questions: [{
    question: "Implementation complete. What would you like to do?",
    header: "Complete",
    multiSelect: false,
    options: [
      { label: "Push and create PR", description: "Push branch and create draft pull request" },
      { label: "Keep branch as-is", description: "I'll handle it later" }
    ]
  }]
)
```

### Step 4: Execute Choice

#### Option 1: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR in draft mode
gh pr create --draft --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

#### Option 2: Keep As-Is

Report: "Keeping branch <name>."

### Step 5: Holistic PR Review

**Only runs when user chose "Push and create PR" in Step 3. Skip silently otherwise.**

After the PR is created, dispatch the `pr-reviewer` agent to perform a holistic review of the full changeset:

```
Task tool (pr-reviewer):
  description: "Holistic review of PR #<number>"
  prompt: |
    Review PR #<number> in this repository.

    This PR was created as part of the structured development workflow.
    Individual tasks were already reviewed for spec compliance and code quality.
    Your job is to review the FULL changeset holistically — looking for
    cross-cutting concerns that per-task reviews wouldn't catch.
```

Report to user: "PR review posted as a comment on #<number>."

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" → ambiguous
- **Fix:** Present exactly 2 structured options

**Noisy reflections**
- **Problem:** Proposing too many trivial or already-documented learnings
- **Fix:** Only propose actionable, project-specific patterns not already in CLAUDE.md

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request

**Always:**
- Verify task completion before verifying tests
- Verify tests before offering options
- Skip reflection silently if no learnings to propose
- Present exactly 2 options
- Dispatch pr-reviewer after PR creation (advisory, not blocking)
