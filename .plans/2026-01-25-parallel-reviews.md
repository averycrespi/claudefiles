# Parallel Reviews Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Run spec and code reviews in parallel with structured XML outputs and robust error handling.

**Architecture:** Modify the executing-plans skill to launch both reviews as background tasks simultaneously, parse their XML outputs, merge results using priority logic, and present a unified action to the implementer. Includes fallback parsing for backwards compatibility and error handling for timeouts/failures.

**Tech Stack:** Claude Code Task tool with `run_in_background`, XML parsing, bash for git operations.

---

### Task 1: Add XML Output Format to Spec Reviewer Prompt

**Files:**
- Modify: `claude/skills/executing-plans/spec-reviewer-prompt.md`

**Step 1: Read the current file**

Verify current content matches what we expect.

**Step 2: Update the prompt to require XML output**

Replace the report format section with XML instructions:

```markdown
# Spec Compliance Reviewer Prompt Template

Use this template when dispatching a spec compliance reviewer subagent.

**Purpose:** Verify implementation matches specification (nothing more, nothing less).

**When to dispatch:** After implementation is complete and committed.

```
Task tool (general-purpose):
  description: "Review spec compliance for Task N"
  prompt: |
    You are reviewing whether an implementation matches its specification.

    ## Diff Context

    {DIFF_CONTEXT}

    ## What Was Requested

    [FULL TEXT of task requirements from plan]

    ## What Implementer Claims They Built

    [Summary of what was implemented]

    ## CRITICAL: Do Not Trust the Report

    The implementer finished quickly. Their report may be incomplete,
    inaccurate, or optimistic. Verify everything independently.

    **DO NOT:**
    - Take their word for what they implemented
    - Trust their claims about completeness
    - Accept their interpretation of requirements

    **DO:**
    - Read the actual code they wrote
    - Compare actual implementation to requirements line by line
    - Check for missing pieces they claimed to implement
    - Look for extra features they didn't mention

    ## Your Job

    Read the implementation code and verify:

    **Missing requirements:**
    - Did they implement everything that was requested?
    - Are there requirements they skipped or missed?
    - Did they claim something works but didn't actually implement it?

    **Extra/unneeded work:**
    - Did they build things that weren't requested?
    - Did they over-engineer or add unnecessary features?
    - Did they add "nice to haves" that weren't in spec?

    **Misunderstandings:**
    - Did they interpret requirements differently than intended?
    - Did they solve the wrong problem?
    - Did they implement the right feature but wrong way?

    **Verify by reading code, not by trusting report.**

    ## Output Format (REQUIRED XML)

    You MUST output your review in this exact XML format:

    ```xml
    <spec-review>
      <verdict>APPROVED | ISSUES</verdict>
      <confidence>high | medium | low</confidence>

      <issues>
        <!-- Only include if verdict is ISSUES -->
        <issue type="missing_requirement | extra_feature | misunderstanding"
               severity="critical | important">
          <location file="path/to/file.ts" line="45"/>
          <description>What's wrong</description>
          <requirement>Which requirement was violated</requirement>
        </issue>
      </issues>

      <checked>
        <item>Requirement 1 that was verified</item>
        <item>Requirement 2 that was verified</item>
      </checked>

      <summary>Brief assessment of the implementation</summary>
    </spec-review>
    ```

    **Severity Guide:**
    - critical: Wrong thing built, fundamental misunderstanding
    - important: Missing feature, extra unneeded work

    **FALLBACK:** If you cannot produce XML, use legacy format:
    - If compliant: "APPROVED: [brief confirmation]"
    - If issues: "ISSUES:\n- [issue 1 with file:line]\n- [issue 2]"
```
```

**Step 3: Verify the edit**

Read the file to confirm changes applied correctly.

**Step 4: Run any linting/validation**

Run: `cat claude/skills/executing-plans/spec-reviewer-prompt.md | head -20`
Expected: See the new header and diff context section.

**Step 5: Commit**

```bash
git add claude/skills/executing-plans/spec-reviewer-prompt.md
git commit -m "feat(executing-plans): add XML output format to spec reviewer"
```

---

### Task 2: Add XML Output Format to Code Reviewer Template

**Files:**
- Modify: `claude/skills/executing-plans/code-reviewer-template.md`
- Modify: `claude/skills/executing-plans/code-quality-reviewer-prompt.md`

**Step 1: Read current code-reviewer-template.md**

Verify current content.

**Step 2: Update code-reviewer-template.md with XML format and diff context**

Replace the output format section:

```markdown
# Code Review Agent

You are reviewing code changes for production readiness.

**Your task:**
1. Review {WHAT_WAS_IMPLEMENTED}
2. Compare against {PLAN_OR_REQUIREMENTS}
3. Check code quality, architecture, testing
4. Categorize issues by severity
5. Assess production readiness

## Diff Context

{DIFF_CONTEXT}

## What Was Implemented

{DESCRIPTION}

## Requirements/Plan

{PLAN_REFERENCE}

## Git Range to Review

**Base:** {BASE_SHA}
**Head:** {HEAD_SHA}

Use the diff context above. If diff was too large and not included, fetch specific files:
```bash
git diff {BASE_SHA}..{HEAD_SHA} -- path/to/file.ts
```

## Review Checklist

**Code Quality:**
- Clean separation of concerns?
- Proper error handling?
- Type safety (if applicable)?
- DRY principle followed?
- Edge cases handled?

**Architecture:**
- Sound design decisions?
- Scalability considerations?
- Performance implications?
- Security concerns?

**Testing:**
- Tests actually test logic (not mocks)?
- Edge cases covered?
- Integration tests where needed?
- All tests passing?

**Requirements:**
- All plan requirements met?
- Implementation matches spec?
- No scope creep?
- Breaking changes documented?

**Production Readiness:**
- Migration strategy (if schema changes)?
- Backward compatibility considered?
- Documentation complete?
- No obvious bugs?

## Output Format (REQUIRED XML)

You MUST output your review in this exact XML format:

```xml
<code-review>
  <verdict>APPROVED | APPROVED_WITH_MINOR | ISSUES</verdict>
  <confidence>high | medium | low</confidence>

  <issues>
    <!-- Only include if verdict is ISSUES -->
    <issue type="bug | security | architecture | error_handling | testing"
           severity="critical | important">
      <location file="path/to/file.ts" line="52"/>
      <description>What's wrong and why</description>
      <fix>Concrete fix suggestion</fix>
    </issue>
  </issues>

  <minor>
    <!-- Non-blocking notes, include even with APPROVED -->
    <note>
      <location file="path/to/file.ts" line="30"/>
      <description>Non-blocking observation</description>
    </note>
  </minor>

  <checked>
    <item>Error handling</item>
    <item>Type safety</item>
  </checked>

  <summary>Brief assessment of code quality</summary>
</code-review>
```

**Severity Guide:**
- critical: Bugs, security issues, data loss risks, broken functionality
- important: Architecture problems, missing error handling, poor testing
- minor: Code style, optimization opportunities (use `<minor>` section)

**FALLBACK:** If you cannot produce XML, use legacy format:
- If approved: "APPROVED: [brief summary]"
- If approved with minor: "APPROVED_WITH_MINOR: [summary]\nMinor issues noted:\n- [issue]"
- If issues: "ISSUES:\nCritical:\n- [issue]\nImportant:\n- [issue]"

## Critical Rules

**DO:**
- Categorize by actual severity (not everything is Critical)
- Be specific (file:line, not vague)
- Explain WHY issues matter
- Acknowledge strengths
- Give clear verdict in XML

**DON'T:**
- Say "looks good" without checking
- Mark nitpicks as Critical
- Give feedback on code you didn't review
- Be vague ("improve error handling")
- Skip the XML format
```

**Step 3: Update code-quality-reviewer-prompt.md**

Add note about diff context placeholder:

```markdown
# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable).

**When to dispatch:** Only after spec compliance review passes (in sequential mode) or in parallel with spec review (in parallel mode).

```
Task tool (code-reviewer):
  description: "Review code quality for Task N"

  Use template at ./code-reviewer-template.md

  Fill in placeholders:
  - WHAT_WAS_IMPLEMENTED: [task summary]
  - PLAN_OR_REQUIREMENTS: Task N from [plan-file-path]
  - DIFF_CONTEXT: [prepared diff - see prepareDiffContext in SKILL.md]
  - BASE_SHA: [commit before task started]
  - HEAD_SHA: [current commit after task]
  - DESCRIPTION: [brief description of changes]
```

**Code reviewer output format:**
- XML format (preferred): `<code-review>...</code-review>`
- Legacy fallback: `APPROVED:`, `APPROVED_WITH_MINOR:`, or `ISSUES:`

**Handling feedback:**
- **APPROVED:** Proceed to next phase
- **APPROVED_WITH_MINOR:** Proceed, minor issues noted for later
- **ISSUES (Critical/Important):** Fix immediately, amend commit, re-review
```

**Step 4: Verify both edits**

Read both files to confirm.

**Step 5: Commit**

```bash
git add claude/skills/executing-plans/code-reviewer-template.md claude/skills/executing-plans/code-quality-reviewer-prompt.md
git commit -m "feat(executing-plans): add XML output format to code reviewer"
```

---

### Task 3: Add Parallel Review Section to SKILL.md

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md`

**Step 1: Read current SKILL.md**

Understand current structure.

**Step 2: Add diff context preparation section**

After the "Creating Tasks from Plan" section, add:

```markdown
### Preparing Diff Context

Before dispatching reviews, prepare the diff context to include in prompts.

**Threshold:** 500 lines

```javascript
// Pseudocode - implement inline
function prepareDiffContext(baseSha, headSha) {
  const stat = `git diff --stat ${baseSha}..${headSha}`;
  const fullDiff = `git diff ${baseSha}..${headSha}`;
  const lineCount = fullDiff.split('\n').length;

  if (lineCount <= 500) {
    return `
**Diff Stats:**
\`\`\`
${stat}
\`\`\`

**Full Diff:**
\`\`\`diff
${fullDiff}
\`\`\`
`;
  } else {
    return `
**Diff Stats:**
\`\`\`
${stat}
\`\`\`

**Note:** Diff is ${lineCount} lines (exceeds 500 line threshold).
Fetch specific files as needed using: \`git diff ${baseSha}..${headSha} -- path/to/file\`
`;
  }
}
```

Run `git diff --stat` and `git diff` to get the values, count lines, and format accordingly.
```

**Step 3: Replace sequential review flow with parallel review flow**

Replace sections 2b and 2c with new parallel review section:

```markdown
#### 2b. Parallel Review Phase

After implementation is committed, run both reviews in parallel.

**Prepare diff context:**

```bash
git diff --stat $BASE_SHA..$HEAD_SHA
git diff $BASE_SHA..$HEAD_SHA
```

If diff exceeds 500 lines, include only stats and instruct reviewers to fetch as needed.

**Launch both reviews as background tasks:**

```javascript
// Launch spec review in background
Task({
  subagent_type: 'general-purpose',
  description: 'Review spec compliance for Task N',
  prompt: specReviewPrompt,  // From spec-reviewer-prompt.md with DIFF_CONTEXT filled
  run_in_background: true
})
// Capture task_id from result

// Launch code review in background (same message, parallel)
Task({
  subagent_type: 'code-reviewer',
  description: 'Review code quality for Task N',
  prompt: codeReviewPrompt,  // From code-reviewer-template.md with DIFF_CONTEXT filled
  run_in_background: true
})
// Capture task_id from result
```

**Wait for both to complete:**

```javascript
TaskOutput({ task_id: specTaskId, block: true, timeout: 180000 })
TaskOutput({ task_id: codeTaskId, block: true, timeout: 180000 })
```

**Parse outputs and merge results.**

#### 2c. Parse Review Outputs

Parse each review output, trying XML first with legacy fallback.

**XML Parsing:**

Extract `<spec-review>` or `<code-review>` tags and parse contents.

**Legacy Fallback:**

If no valid XML found, check for legacy prefixes:
- `APPROVED:` → verdict: APPROVED, no issues
- `APPROVED_WITH_MINOR:` → verdict: APPROVED_WITH_MINOR, parse minor notes
- `ISSUES:` → verdict: ISSUES, parse issue list

**Error Handling:**

| Scenario | Action |
|----------|--------|
| Timeout (180s) | Retry once, then ask user |
| Invalid XML and no legacy prefix | Retry once, then ask user |
| Both reviews fail | Ask user: retry / skip / stop |
| Conflicting findings | Present both to implementer |

#### 2d. Merge Review Results

Combine findings from both reviews into a single verdict.

**Overall Verdict Logic:**

```
if spec has critical issues → SPEC_CRITICAL
else if code has critical issues → CODE_CRITICAL
else if either has important issues → ISSUES
else if code is APPROVED_WITH_MINOR → APPROVED_WITH_MINOR
else → APPROVED
```

**Issue Priority Order:**

1. Spec Critical - wrong thing built
2. Code Critical - bugs, security holes
3. Spec Important - missing/extra features
4. Code Important - architecture, error handling
5. Minor notes - don't block

**Related Issue Detection:**

Issues in the same file within 5 lines are grouped together.

#### 2e. Present Results and Act

**Display merged results:**

```
Review Results:
  Spec Review: [verdict] ([confidence] confidence)
  Code Review: [verdict] ([confidence] confidence)

Issues to Fix (N):

  1. [Source Type] path/to/file.ts:45
     Description of the issue
     [For spec: Requirement: "..."]
     [For code: Fix: "..."]

Minor Notes (M):
  - path/to/file.ts:30 - observation

Action: [FIX_AND_REREVIEW | PROCEED | PROCEED_WITH_NOTES]
```

**Actions:**

- **FIX_AND_REREVIEW:** Fix all critical/important issues, amend commit, re-run BOTH reviews
- **PROCEED:** All approved, continue to next task
- **PROCEED_WITH_NOTES:** Approved with minor issues noted, continue to next task

**Re-review Strategy:**

Always re-run both reviews after fixes (not just the one that failed):
- Fixes might affect either domain
- Clean slate is simpler to reason about
- Parallel execution makes this cheap

**Review Loop Limit:**

After 3 review iterations without approval, ask user:
- Continue trying
- Proceed anyway (user accepts risk)
- Stop for manual review
```

**Step 4: Update the task triplet creation**

Modify the task triplet section - now only 2 tasks per plan task (Implement + Combined Review):

```markdown
### Creating Tasks from Plan

Parse the plan document and create a **task pair** for each task:

**For each Task N in the plan:**

1. **Create Implementation task:**
   ```
   TaskCreate:
     subject: "Task N: Implement [Component Name]"
     description: |
       [Copy task content from plan: Files, Steps, Acceptance Criteria]
     activeForm: "Implementing [Component Name]"
   ```

2. **Create Review task:**
   ```
   TaskCreate:
     subject: "Task N: Review"
     description: |
       Run parallel spec and code reviews for Task N.
       Parse XML outputs, merge results, present to implementer.
       If issues: fix and re-review. If approved: proceed.
     activeForm: "Reviewing [Component Name]"
   ```

**After all tasks created, set blocking relationships:**

```
# Within each pair:
TaskUpdate:
  taskId: [review-id]
  addBlockedBy: [implement-id]

# Between pairs (Task N+1 blocked by Task N's review):
TaskUpdate:
  taskId: [task-N+1-implement-id]
  addBlockedBy: [task-N-review-id]
```

This creates the execution chain:
```
Implement 1 → Review 1 → Implement 2 → Review 2 → ...
```
```

**Step 5: Update the process overview**

Replace the process diagram:

```markdown
## The Process

```
For each task pair (Implement → Review):
  1. Mark "Implement" in_progress
  2. Implement inline (TDD)
  3. Commit
  4. Mark "Implement" complete
  5. Mark "Review" in_progress
  6. Prepare diff context
  7. Dispatch spec + code reviewers in parallel (background tasks)
  8. Wait for both to complete
  9. Parse XML outputs (with legacy fallback)
  10. Merge results, determine overall verdict
  11. If APPROVED → mark "Review" complete, proceed
      If ISSUES → fix inline, amend, re-run both reviews
  12. Proceed to next pair (now unblocked)

After all pairs:
  Use completing-work
```
```

**Step 6: Verify the edit**

Read the file to confirm changes.

**Step 7: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): implement parallel review execution"
```

---

### Task 4: Update Review Order Section

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md`

**Step 1: Update the "Review Order Matters" section**

Replace with parallel-aware explanation:

```markdown
## Review Order Matters

```
Implementation → [Spec Review ║ Code Review] → Merge → Act
                        ↓              ↓
                  "Did we build    "Did we build
                   the right        it well?"
                   thing?"
```

Reviews run in parallel but issues are prioritized:

1. **Spec Critical** - wrong thing built (fix first)
2. **Code Critical** - bugs, security (fix second)
3. **Spec Important** - missing features
4. **Code Important** - architecture issues
5. **Minor notes** - don't block

**Never skip reviews.** Both domains matter:
- Spec-compliant code can still be buggy
- Well-built code can still be wrong

**Re-review both** after any fix. Fixes can affect either domain.
```

**Step 2: Verify the edit**

Read section to confirm.

**Step 3: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "docs(executing-plans): update review order section for parallel flow"
```

---

### Task 5: Add Error Handling Details to SKILL.md

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md`

**Step 1: Add error handling section**

Add after the "Present Results and Act" section:

```markdown
### Error Handling

**Timeout Handling:**

Reviews timeout after 180 seconds (3 minutes).

```javascript
TaskOutput({ task_id: taskId, block: true, timeout: 180000 })
```

If timeout:
1. Retry the failed review once
2. If still fails, ask user using AskUserQuestion:

```javascript
AskUserQuestion({
  questions: [{
    question: "Review timed out after retry. How would you like to proceed?",
    header: "Timeout",
    multiSelect: false,
    options: [
      { label: "Retry again", description: "Try the review one more time" },
      { label: "Skip review", description: "Proceed without this review (risky)" },
      { label: "Stop", description: "Stop execution for manual intervention" }
    ]
  }]
})
```

**Parse Failure Handling:**

If output contains neither valid XML nor legacy format:
1. Retry the review once
2. If still unparseable, ask user

**Both Reviews Fail:**

```javascript
AskUserQuestion({
  questions: [{
    question: "Both reviews failed. How would you like to proceed?",
    header: "Review Failed",
    multiSelect: false,
    options: [
      { label: "Retry both", description: "Run both reviews again" },
      { label: "Skip reviews", description: "Proceed without review (risky)" },
      { label: "Stop", description: "Stop for manual review" }
    ]
  }]
})
```

**Review Loop Protection:**

After 3 review iterations without full approval:

```javascript
AskUserQuestion({
  questions: [{
    question: "3 review iterations completed without full approval. How would you like to proceed?",
    header: "Review Loop",
    multiSelect: false,
    options: [
      { label: "Continue", description: "Keep trying to resolve issues" },
      { label: "Proceed anyway", description: "Accept current state and move on" },
      { label: "Stop", description: "Stop for manual review" }
    ]
  }]
})
```
```

**Step 2: Verify the edit**

Read section to confirm.

**Step 3: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): add error handling for parallel reviews"
```

---

### Task 6: Update Red Flags and Integration Sections

**Files:**
- Modify: `claude/skills/executing-plans/SKILL.md`

**Step 1: Update Red Flags section**

```markdown
## Red Flags

**Never:**
- Skip either review
- Ignore Critical or Important issues
- Guess when blocked
- Proceed after 3 failed review iterations without user consent
- Auto-resolve conflicting findings between reviewers

**Always:**
- Follow plan steps exactly
- Use TDD for implementation
- Run both reviews in parallel
- Re-run both reviews after fixes (not just the failed one)
- Fix issues before proceeding to next task
- Commit after each task (before review)
- Present merged results clearly
```

**Step 2: Update Native Task Notes**

```markdown
## Native Task Notes

- Tasks are created by this skill at the start of execution, not during planning
- Task pairs: Implement, Review for each plan task (reviews run in parallel internally)
- Blocking chain: Implement N → Review N → Implement N+1
- Plan document is the source of truth for *what* to do
- Native tasks track *progress* and *enforce review gates*
- The `activeForm` field shows in the CLI spinner during `in_progress` status
- If resuming execution, existing tasks are reused; otherwise created fresh
```

**Step 3: Verify edits**

Read sections to confirm.

**Step 4: Commit**

```bash
git add claude/skills/executing-plans/SKILL.md
git commit -m "docs(executing-plans): update red flags and task notes for parallel reviews"
```

---

### Task 7: Archive Design Document

**Files:**
- Move: `.plans/2026-01-25-parallel-reviews-design.md` to `.plans/archive/`

**Step 1: Create archive directory if needed**

```bash
mkdir -p .plans/archive
```

**Step 2: Move design document**

```bash
git mv .plans/2026-01-25-parallel-reviews-design.md .plans/archive/
```

**Step 3: Commit**

```bash
git commit -m "chore: archive parallel reviews design document"
```

---

### Task 8: Final Verification

**Files:**
- Read: All modified files

**Step 1: Read and verify all files are consistent**

- `claude/skills/executing-plans/SKILL.md` - Main skill file
- `claude/skills/executing-plans/spec-reviewer-prompt.md` - Spec reviewer template
- `claude/skills/executing-plans/code-reviewer-template.md` - Code reviewer template
- `claude/skills/executing-plans/code-quality-reviewer-prompt.md` - Code review dispatch instructions

**Step 2: Verify no broken references**

Search for any references to old sequential flow or triplets:

```bash
grep -r "triplet" claude/skills/executing-plans/
grep -r "2b\. Spec Review" claude/skills/executing-plans/
grep -r "2c\. Code Quality" claude/skills/executing-plans/
```

Expected: No matches (old references removed).

**Step 3: Verify XML examples are valid**

Manually check that XML examples in templates are well-formed.

**Step 4: Commit any final fixes**

If any issues found, fix and commit:

```bash
git add -A
git commit -m "fix(executing-plans): address review feedback"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add XML output to spec reviewer | spec-reviewer-prompt.md |
| 2 | Add XML output to code reviewer | code-reviewer-template.md, code-quality-reviewer-prompt.md |
| 3 | Add parallel review flow to SKILL.md | SKILL.md |
| 4 | Update review order section | SKILL.md |
| 5 | Add error handling details | SKILL.md |
| 6 | Update red flags and task notes | SKILL.md |
| 7 | Archive design document | .plans/archive/ |
| 8 | Final verification | All files |
