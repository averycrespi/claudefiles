# Verifying Work — Design

## Purpose

Perform a holistic review of all work completed during plan execution, automatically fix clear issues, and surface ambiguous findings for user decision — before proceeding to PR creation.

This stage catches what per-task reviews miss: cross-task integration issues, inconsistencies across the full changeset, plan-level gaps, security concerns spanning multiple components, and test coverage gaps at the integration/E2E level.

## Position in Workflow

```
brainstorming → writing-plans → executing-plans → verifying-work → completing-work
```

Each skill calls the next directly:
- executing-plans finishes all task triplets → calls `Skill(verifying-work)`
- verifying-work finishes verification → calls `Skill(completing-work)`

This keeps the "call next skill" instruction fresh in context rather than pushing it further back.

## Inputs

- The design document (from `.plans/`)
- The implementation plan (from `.plans/`)
- The full git diff from branch point to HEAD
- Full contents of all changed/added files
- Project CLAUDE.md

## Outputs

- Auto-fixed issues (committed, reported for awareness)
- Ambiguous findings (presented for user decision)
- Verdict: proceed to completing-work, or address findings first

## Process

### Phase 0: Verify Task Completion

Before any checks, verify all tasks from the plan are complete:

```
TaskList
```

If any tasks remain `in_progress` or `pending`, warn the user and use `AskUserQuestion` to let them decide: continue anyway, or return to complete tasks.

If all tasks are `completed` (or no tasks exist), proceed silently.

### Phase 1: Automated Checks

Run hard gates before any AI review:
1. Run full test suite
2. Run linter (if configured)
3. Run type-checker (if configured)

If any fail, dispatch a fixer agent with the failures. Re-run checks. Up to 3 rounds. If still failing after 3 rounds, stop and escalate to user.

### Phase 2: Dispatch Reviewers

Launch 5 parallel reviewer subagents (model: haiku), each with access to the design document, implementation plan, full diff, changed file contents, and project CLAUDE.md.

| # | Reviewer | Focus |
|---|----------|-------|
| 1 | Plan Completeness | Every item in the design/plan is implemented. Nothing missing, nothing half-done, no scope creep. |
| 2 | Integration Correctness | Cross-task dependencies work. Shared state, API contracts, data flow between components. |
| 3 | Consistency | Uniform patterns across the changeset: error handling, naming, logging, code style. |
| 4 | Security | Auth flows, input validation, data handling across boundaries, secrets management. |
| 5 | Test Coverage | Integration/E2E gaps. Cross-component scenarios tested? Edge cases at boundaries covered? |

Each reviewer returns findings in this format:
```
FINDINGS:
- <file>:<line> | <severity> | <confidence> | <auto-fixable:yes/no> | <description>

NO_FINDINGS
```

Severity levels:
- **blocker** — Must fix before merge
- **important** — Should fix, risk if ignored
- **suggestion** — Improvement, not blocking

Auto-fixable criteria — mark yes ONLY if:
- The fix is unambiguous (one clear correct action)
- No design decision required
- No user preference involved
- Examples: missing error handling, inconsistent naming, dead code, missing test for obvious scenario

### Phase 3: Synthesize

1. Filter findings below 80 confidence
2. Deduplicate (same file:line range within 3 lines, keep highest severity)
3. Split into two buckets:
   - **Auto-fixable**: clear-cut issues (missing error handling, inconsistent naming, missing test case, unused import)
   - **Ambiguous**: needs human judgment (architectural concerns, design trade-offs, scope questions)

### Phase 4: Fix Loop

If auto-fixable issues exist:
1. Dispatch single fixer agent (general-purpose, default model) with all auto-fixable findings
2. Fixer implements fixes, runs tests, commits with message: `fix: address verification findings`
3. Re-run only the reviewers that originally flagged issues
4. Repeat up to 3 total rounds
5. Any issues remaining after 3 rounds get reclassified as ambiguous
6. If fixer determines an issue is actually ambiguous, it reports it back as unresolved for reclassification

### Phase 5: Present Results

Show the user a structured report:

```
## Verification Report

**Verdict: <Ready / Needs Attention>**

### Auto-Fixed (<N> issues)
- [Consistency] Standardized error handling across 3 files (fixed in abc123)
- [Test Coverage] Added integration test for auth + API interaction (fixed in def456)

### Needs Your Input (<N> findings)
- [Plan Completeness] Design called for rate limiting but no implementation found
- [Security] Auth token refresh logic differs between web and API paths

### Proceed to completing-work?
```

If ambiguous findings exist, use `AskUserQuestion` to let the user decide:
- **Proceed** — findings are informational, continue to completing-work
- **Address findings** — user works with Claude to resolve, then re-runs verifying-work or proceeds manually

If no ambiguous findings, proceed directly to `Skill(completing-work)`.

## Reviewer Prompt Design

Each reviewer gets a dedicated prompt file. All share a common structure:

```
You are a [Role] reviewing the complete implementation of a feature.

## Context
- Design document: [injected]
- Implementation plan: [injected]
- Full diff: [injected]
- Changed file contents: [injected]

## Your Focus
[Dimension-specific instructions]

## Output Format
FINDINGS:
- <file>:<line> | <severity> | <confidence> | <auto-fixable:yes/no> | <description>
Or: NO_FINDINGS

## Severity Guide / Auto-Fixable Guide
[As defined above]
```

## Fixer Agent Design

The fixer agent receives:
- The full list of auto-fixable findings (with file, line, description)
- Access to all changed files
- The test/lint/type-check commands

Instructions:
1. Fix all listed issues
2. Run tests after each logical group of fixes
3. Commit with message: `fix: address verification findings`
4. Report what was fixed and what couldn't be fixed
5. If a fix turns out to be ambiguous, report it as unresolved for reclassification

## Integration Changes

### executing-plans

Currently Step 3 says:
```
After all tasks complete:
1. Run full test suite
2. Use Skill(completing-work)
```

Changes to:
```
After all tasks complete:
1. Use Skill(verifying-work)
```

The test suite run moves into verifying-work's Phase 1. executing-plans no longer references completing-work.

### completing-work

Two responsibilities move to verifying-work:
- **Task completion check** (Step 0) — moves to verifying-work Phase 0
- **Test verification** (Step 1) — moves to verifying-work Phase 1

Completing-work simplifies to: clean up plan files → reflect on learnings → present PR options. Its step numbering updates accordingly.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No design document exists | Skip plan-completeness reviewer. Run other 4. |
| No plan file exists | Skip plan-completeness reviewer. Run other 4. |
| All reviewers return NO_FINDINGS | Report clean verification, proceed to completing-work. |
| Fixer introduces new test failures | Counts as a fix-loop round. Fixer must resolve before proceeding. |
| Fixer can't fix an "auto-fixable" issue | Reclassify as ambiguous, present to user. |
| 3 fix rounds exhausted, issues remain | Reclassify remaining as ambiguous, present to user. |
| User says "proceed anyway" on ambiguous findings | Proceed to completing-work. |
| User says "address findings" | User works with Claude to resolve, then re-runs or proceeds manually. |
| Manual invocation (not from executing-plans) | Works standalone — gathers diff from branch point, looks for plan files in `.plans/`, proceeds normally. |

## File Structure

```
claude/skills/verifying-work/
├── SKILL.md                          # Main skill definition
├── plan-completeness-prompt.md       # Reviewer 1
├── integration-correctness-prompt.md # Reviewer 2
├── consistency-prompt.md             # Reviewer 3
├── security-prompt.md                # Reviewer 4
├── test-coverage-prompt.md           # Reviewer 5
└── fixer-prompt.md                   # Fixer agent
```
