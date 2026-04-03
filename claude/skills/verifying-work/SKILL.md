---
name: verifying-work
description: Use when finishing plan execution to holistically review all work before completing - runs automated checks, dispatches 5 parallel reviewers, auto-fixes clear issues, surfaces ambiguous findings
---

# Verifying Work

## Overview

Perform a holistic review of all work completed during plan execution. Run automated checks, dispatch 5 parallel reviewers for cross-cutting concerns, auto-fix clear issues, and surface ambiguous findings for user decision — before proceeding to PR creation.

**Core principle:** Per-task reviews catch task-level issues. This skill catches what only becomes visible when looking at all the work together: integration problems, inconsistencies, plan gaps, and cross-component concerns.

**Announce at start:** "I'm using the verifying-work skill to holistically review the implementation."

## The Process

### Phase 0: Verify Task Completion

Before any checks, verify all tasks from the plan are complete:

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

**If all tasks `completed`:** Proceed silently to Phase 1.

**If no tasks exist:** Proceed silently to Phase 1 (plan may have been executed without native task tracking).

### Phase 1: Automated Checks

Run hard gates before any AI review:

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...

# Run linter if configured
npm run lint / cargo clippy / ruff check / golangci-lint run

# Run type-checker if configured
npx tsc --noEmit / mypy . / pyright
```

**If all pass:** Proceed to Phase 2.

**If any fail:** Dispatch a fixer agent with the failures:

```
Agent tool (general-purpose):
  description: "Fix automated check failures"
  prompt: [Use fixer-prompt.md template with CHECK_FAILURES filled in]
```

Re-run the failing checks. Up to 3 rounds total. If still failing after 3 rounds, stop and escalate to user:

```
Automated checks still failing after 3 fix attempts:

[Show remaining failures]

Cannot proceed with verification until checks pass.
```

### Phase 2: Gather Context and Dispatch Reviewers

**Gather context:**

1. Determine the base branch:
   ```
   git rev-parse --abbrev-ref origin/HEAD
   ```
   Fall back to `main` if the command fails.

2. Get the full diff:
   ```
   git diff <base-branch>...HEAD
   ```

3. Parse the diff to identify changed files (lines starting with `+++ b/`)

4. Read the full contents of each changed/added file using the Read tool

5. Look for plan and design files — find the plan from `.plans/` and the design from `.designs/` using conversation context or by globbing those directories

6. Read the project's CLAUDE.md if it exists

7. Assemble everything into a context block

**Dispatch 5 reviewer subagents:**

Launch all 5 in a SINGLE message with 5 Agent tool calls. Use `Agent tool (general-purpose)` with `model: haiku` for each.

Read each prompt file from the skill directory at dispatch time. Each agent's prompt is the prompt file content with the full context package appended.

| # | Reviewer | Prompt File |
|---|----------|-------------|
| 1 | Plan Completeness | `plan-completeness-prompt.md` |
| 2 | Integration Correctness | `integration-correctness-prompt.md` |
| 3 | Consistency | `consistency-prompt.md` |
| 4 | Security | `security-prompt.md` |
| 5 | Test Coverage | `test-coverage-prompt.md` |

**If no design document or plan file exists:** Skip the Plan Completeness reviewer. Dispatch the other 4.

Each agent MUST return findings in this format:

```
FINDINGS:
- <file>:<line> | <severity> | <confidence> | <auto-fixable:yes/no> | <description>
NO_FINDINGS (if nothing to report)
```

Where `<severity>` is one of: `blocker`, `important`, `suggestion`
Where `<confidence>` is an integer from 0 to 100.
Where `<auto-fixable>` is `yes` or `no`.

### Phase 3: Synthesize Findings

After all reviewers return:

1. **Parse** each agent's response for `FINDINGS:` or `NO_FINDINGS`
2. **Filter** — drop any finding with confidence below 80
3. **Deduplicate** — if multiple reviewers flag the same file:line range (within 3 lines), merge them keeping the highest severity and noting all contributing reviewers
4. **Split** into two buckets:
   - **Auto-fixable**: findings marked `auto-fixable:yes`
   - **Ambiguous**: findings marked `auto-fixable:no`

**If no findings remain after filtering:** Report clean verification, proceed directly to `Skill(completing-work)`.

### Phase 4: Fix Loop

**If auto-fixable issues exist:**

1. Dispatch single fixer agent (general-purpose, default model) with all auto-fixable findings:
   ```
   Agent tool (general-purpose):
     description: "Fix verification findings"
     prompt: [Use fixer-prompt.md template with FINDINGS filled in]
   ```

2. Parse fixer report:
   - Issues marked as fixed → track for report
   - Issues marked as unresolvable → reclassify as ambiguous

3. Re-run only the reviewers that originally flagged auto-fixable issues (same prompt files, updated diff)

4. Repeat up to 3 total rounds

5. Any issues remaining after 3 rounds → reclassify as ambiguous

### Phase 5: Present Results

Show the user a structured report:

```
## Verification Report

**Verdict: <Ready / Needs Attention>**

### Auto-Fixed (<N> issues)
- [<Reviewer>] <description> (fixed in <commit-sha>)

### Needs Your Input (<N> findings)
- [<Reviewer>] <description>
  `<file>:<line>` — <severity>
```

**If no ambiguous findings:** Proceed directly to `Skill(completing-work)`.

**If ambiguous findings exist:** Use `AskUserQuestion`:

```javascript
AskUserQuestion(
  questions: [{
    question: "Verification found findings that need your input. How would you like to proceed?",
    header: "Verify",
    multiSelect: false,
    options: [
      { label: "Proceed (Recommended)", description: "Continue to completing-work — findings are informational" },
      { label: "Address findings", description: "Work through findings before continuing" }
    ]
  }]
)
```

- **Proceed:** Call `Skill(completing-work)`
- **Address findings:** Work with user to resolve, then user can re-run verifying-work or proceed manually

## When to Stop and Ask

**STOP immediately when:**
- Automated checks fail after 3 fix rounds
- A reviewer finds a blocker that's not auto-fixable
- Fixer agent introduces new test failures that persist

## Red Flags

**Never:**
- Skip automated checks
- Dispatch reviewers against code that doesn't compile/pass tests
- Auto-fix ambiguous findings without user input
- Proceed past blockers without user acknowledgment

**Always:**
- Verify task completion before automated checks
- Run automated checks before AI reviewers
- Present all ambiguous findings to user
- Proceed to completing-work after verification

## Integration

**Required skills:**
- **completing-work** — Called after verification passes

**Used by:**
- **executing-plans** — Calls this skill after all task triplets complete
- **executing-plans-quickly** — Calls this skill after all task triplets complete

## Prompt Templates

- `./plan-completeness-prompt.md` — Verify design/plan items are all implemented
- `./integration-correctness-prompt.md` — Verify cross-task dependencies and data flow
- `./consistency-prompt.md` — Verify uniform patterns across changeset
- `./security-prompt.md` — Holistic security review across all changes
- `./test-coverage-prompt.md` — Verify integration/E2E test coverage
- `./fixer-prompt.md` — Fix auto-fixable findings and automated check failures
