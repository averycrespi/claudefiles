# Reviewing PRs Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Create a `/reviewing-prs` skill that performs holistic PR reviews by dispatching 6 specialized reviewer agents in parallel, synthesizing findings with confidence scoring and severity tiers.

**Architecture:** A single SKILL.md orchestrates the review: it parses input (PR URL or branch name), gathers context (diff, changed files, CLAUDE.md, PR metadata), dispatches 6 specialized reviewer subagents in parallel via the Task tool, then synthesizes their findings by filtering at 80+ confidence, deduplicating, and presenting grouped by severity with a final verdict.

**Tech Stack:** Claude Code skills (markdown), `gh` CLI for PR metadata, `git diff` for branch diffs, Task tool for parallel subagent dispatch.

---

### Task 1: Initialize skill directory

**Files:**
- Create: `claude/skills/reviewing-prs/` (via init_skill.py)

**Step 1: Run init_skill.py to scaffold the skill directory**

```bash
python3 claude/skills/creating-skills/scripts/init_skill.py reviewing-prs --path claude/skills/
```

This creates `claude/skills/reviewing-prs/` with a template SKILL.md and example directories.

**Step 2: Clean up generated scaffolding**

Delete any example directories and files that aren't needed (scripts/, references/, assets/, and their example contents). Keep only SKILL.md.

**Step 3: Commit**

```bash
git add claude/skills/reviewing-prs/
git commit -m "chore: scaffold reviewing-prs skill directory"
```

---

### Task 2: Write SKILL.md

**Files:**
- Modify: `claude/skills/reviewing-prs/SKILL.md`

**Step 1: Write the SKILL.md with full orchestration logic**

Replace the template SKILL.md with the complete skill definition. The frontmatter should be:

```yaml
---
name: reviewing-prs
description: Use when reviewing a pull request or branch holistically across multiple dimensions (correctness, security, codebase alignment, code quality, test quality, performance). Accepts a PR URL or branch name as argument.
---
```

The body should contain these sections:

**Overview section** — Announce: "I'm using the reviewing-prs skill to perform a holistic review." Explain the skill performs 6 parallel specialized reviews and synthesizes findings.

**Input Parsing section** — Two modes:
1. PR URL (e.g., `https://github.com/org/repo/pull/123`): Extract PR number using regex. Fetch diff via `gh pr diff <number>`. Fetch PR description via `gh pr view <number> --json title,body`. Fetch PR comments via `gh api repos/{owner}/{repo}/pulls/{number}/comments` and `gh pr view <number> --json reviews,comments`.
2. Branch name (e.g., `feature-branch`): Run `git diff main...<branch>` to get the diff. No PR metadata.

If input matches `https://github.com/.*/pull/[0-9]+`, treat as PR URL. Otherwise treat as branch name.

**Gather Context section** — After getting the diff:
1. Parse the diff to identify changed files
2. Read full contents of each changed file using the Read tool
3. Read the project's CLAUDE.md if it exists
4. If PR URL mode, include PR title, description, and review comments as context
5. Package everything into a context block for reviewers

**Dispatch Reviewers section** — Launch 6 Task subagents in parallel (all in a single message). Each gets:
- The diff
- Full contents of changed files
- CLAUDE.md contents (if available)
- PR metadata (if available)
- Their specialized prompt (read from the corresponding prompt file in the skill directory)

Use `Task tool (general-purpose)` for each, with model `haiku` for cost efficiency. Read the prompt files at dispatch time.

The 6 agents:
1. Bug Hunter — read `bug-hunter-prompt.md`
2. Security Reviewer — read `security-reviewer-prompt.md`
3. Codebase Alignment — read `codebase-alignment-prompt.md`
4. Code Quality — read `code-quality-prompt.md`
5. Test Quality — read `test-quality-prompt.md`
6. Performance — read `performance-reviewer-prompt.md`

Each agent prompt gets the context package appended after the prompt template content.

**Synthesize section** — After all 6 agents return:
1. Parse each agent's response. Each returns findings in this format:
   ```
   FINDINGS:
   - file:line | severity | confidence | description
   - file:line | severity | confidence | description
   NO_FINDINGS (if nothing to report)
   ```
2. Filter: drop findings below 80 confidence
3. Deduplicate: if multiple agents flag the same file:line range (within 3 lines), merge into one finding keeping the highest severity and noting all contributing agents
4. Group by severity: Blockers > Important > Suggestions
5. Determine verdict:
   - **Ready to Merge** — 0 blockers, 0 important
   - **Needs Attention** — 0 blockers, 1+ important
   - **Needs Work** — 1+ blockers
6. Present output in the format from the design doc

**Output Format section** — Show the exact template:

```
## PR Review: <PR title or branch name>

**Verdict: <verdict>** (<N> blockers, <N> important, <N> suggestions)

---

### Blockers

**[<Category>] <Title>** (confidence: <N>)
`<file>:<line>` — <Agent(s)>
<Description>

### Important
...

### Suggestions
...

---

<N> agents reviewed <N> files. <N> raw findings → <N> surfaced (80+ confidence).
```

Omit empty severity sections (e.g., if no blockers, skip the Blockers heading).

**Step 2: Verify SKILL.md is well-formed**

Read back the file and confirm:
- Frontmatter has `name` and `description`
- All sections are present
- Writing style is imperative/infinitive (not second person)
- References to prompt files use correct filenames

**Step 3: Commit**

```bash
git add claude/skills/reviewing-prs/SKILL.md
git commit -m "feat: add reviewing-prs SKILL.md with orchestration logic"
```

---

### Task 3: Write reviewer prompt files

**Files:**
- Create: `claude/skills/reviewing-prs/bug-hunter-prompt.md`
- Create: `claude/skills/reviewing-prs/security-reviewer-prompt.md`
- Create: `claude/skills/reviewing-prs/codebase-alignment-prompt.md`
- Create: `claude/skills/reviewing-prs/code-quality-prompt.md`
- Create: `claude/skills/reviewing-prs/test-quality-prompt.md`
- Create: `claude/skills/reviewing-prs/performance-reviewer-prompt.md`

All 6 prompt files follow the same structure. Each file is a template that SKILL.md reads and appends context to when dispatching a reviewer subagent.

**Shared structure for all prompts:**

```markdown
# <Agent Name>

## Role

<1-2 sentences defining the reviewer's specialty>

## Scope Rules

- Only review changed code (the diff), not pre-existing issues
- Do not flag issues that linters or formatters would catch
- Do not flag issues already discussed in PR comments (if PR metadata is provided)
- Do not nitpick style when it matches project conventions
- Use full file context only to understand the changes, not to review unchanged code

## What to Look For

<Bulleted list specific to this reviewer's domain>

## Confidence Scoring

Score each finding 0-100:
- **90-100**: Concrete evidence — can point to the exact problem with certainty
- **80-89**: Strong suspicion with partial evidence — likely issue but not 100% certain
- **Below 80**: Do not report — not confident enough to surface

## Severity

Categorize each finding:
- **blocker**: Must fix before merge. Bugs, security vulnerabilities, data loss risks.
- **important**: Should fix. Code quality issues, missing tests, pattern violations.
- **suggestion**: Optional improvement. Performance hints, style preferences, minor enhancements.

## Output Format

Return findings in EXACTLY this format (for parsing):

```
FINDINGS:
- <file>:<line> | <severity> | <confidence> | <description>
- <file>:<line> | <severity> | <confidence> | <description>
```

If no findings meet the 80+ confidence threshold, return:

```
NO_FINDINGS
```

Do not include any other text before FINDINGS: or NO_FINDINGS.
```

**Step 1: Write bug-hunter-prompt.md**

Role: Correctness reviewer specializing in logic errors and bugs.

What to Look For:
- Logic errors and incorrect conditionals
- Off-by-one errors in loops and array indexing
- Null/undefined reference risks
- Unhandled error cases and missing error propagation
- Race conditions and concurrency issues
- Incorrect type conversions or coercions
- Edge cases not handled (empty inputs, boundary values, overflow)
- Broken control flow (unreachable code, missing breaks, fall-throughs)
- Incorrect function signatures or mismatched parameters
- State mutations that could cause unexpected behavior

**Step 2: Write security-reviewer-prompt.md**

Role: Security reviewer specializing in vulnerability detection.

What to Look For:
- Injection vulnerabilities (SQL, command, XSS, template injection)
- Authentication and authorization flaws
- Credential exposure (hardcoded secrets, tokens, API keys)
- Input validation gaps (unsanitized user input reaching sensitive operations)
- Insecure cryptographic practices (weak algorithms, hardcoded IVs/salts)
- Path traversal and file access vulnerabilities
- Insecure deserialization
- SSRF (server-side request forgery)
- Missing security headers or CORS misconfiguration
- Information leakage (verbose errors, debug info in production)

**Step 3: Write codebase-alignment-prompt.md**

Role: Consistency reviewer ensuring changes align with existing codebase patterns.

What to Look For:
- Deviations from naming conventions used elsewhere in the codebase
- Reinventing utilities that already exist in the project
- Architectural pattern violations (e.g., putting logic in wrong layer)
- Inconsistent error handling compared to rest of codebase
- Ignoring conventions documented in CLAUDE.md or project docs
- Import patterns that differ from established style
- File/directory placement that breaks existing structure
- Using different libraries/approaches for problems already solved in the codebase

**Step 4: Write code-quality-prompt.md**

Role: Design and quality reviewer assessing code craftsmanship.

What to Look For:
- Unnecessary complexity (could be simpler and still correct)
- Code duplication (copy-pasted logic that should be extracted)
- Poor abstraction level (too abstract or too concrete)
- Weak separation of concerns (mixing responsibilities)
- Poor readability (unclear variable names, convoluted logic)
- Dead code or unreachable branches
- Missing or misleading comments on non-obvious logic
- Functions that are too long or do too many things
- Deep nesting that could be flattened
- Premature optimization at the expense of clarity

**Step 5: Write test-quality-prompt.md**

Role: Testing reviewer ensuring adequate and well-designed test coverage.

What to Look For:
- Changed code paths that lack test coverage
- Tests that verify implementation details instead of behavior
- Missing edge case tests for new logic
- Tests that would pass even if the feature were broken (tautological tests)
- Brittle tests coupled to implementation (will break on refactor)
- Missing error/failure path tests
- Test descriptions that don't match what's being tested
- Shared mutable state between tests
- Tests that depend on execution order
- Overly complex test setup that obscures what's being tested

**Step 6: Write performance-reviewer-prompt.md**

Role: Performance reviewer identifying efficiency concerns.

What to Look For:
- N+1 query patterns (database or API calls in loops)
- Unnecessary memory allocations (creating objects in hot loops)
- Blocking operations in async contexts
- Missing pagination for potentially large result sets
- Algorithmic complexity issues (O(n^2) where O(n) is possible)
- Missing caching for expensive repeated computations
- Unnecessary re-renders or recomputations (in UI code)
- Large payloads being transferred unnecessarily
- Missing debouncing/throttling on frequent operations
- Resource leaks (unclosed connections, file handles, subscriptions)

**Step 7: Commit all prompt files**

```bash
git add claude/skills/reviewing-prs/bug-hunter-prompt.md \
        claude/skills/reviewing-prs/security-reviewer-prompt.md \
        claude/skills/reviewing-prs/codebase-alignment-prompt.md \
        claude/skills/reviewing-prs/code-quality-prompt.md \
        claude/skills/reviewing-prs/test-quality-prompt.md \
        claude/skills/reviewing-prs/performance-reviewer-prompt.md
git commit -m "feat: add 6 reviewer prompt templates for reviewing-prs"
```

---

### Task 4: Update documentation and settings

**Files:**
- Modify: `CLAUDE.md:49-70` (Skills tables)
- Modify: `claude/settings.json:87-94` (permissions allow list)

**Step 1: Update CLAUDE.md**

Add `reviewing-prs` to the Workflow Skills table. Insert a new row after `completing-work`:

```markdown
| `reviewing-prs`              | Holistic PR review across 6 parallel dimensions              |
```

**Step 2: Update settings.json**

Add the skill permission to the allow list. Insert after the `Skill(writing-plans)` entry:

```json
"Skill(reviewing-prs)",
```

Also add `gh api` to the allow list if not already present (needed for fetching PR comments):

```json
"Bash(gh api:*)",
```

**Step 3: Run setup.sh to apply changes via stow**

```bash
./setup.sh
```

**Step 4: Verify the skill is registered**

Read back `~/.claude/skills/reviewing-prs/SKILL.md` to confirm the symlink was created correctly.

**Step 5: Commit**

```bash
git add CLAUDE.md claude/settings.json
git commit -m "chore: register reviewing-prs skill in docs and settings"
```

<!-- No additional documentation updates needed beyond the CLAUDE.md skills table -->
