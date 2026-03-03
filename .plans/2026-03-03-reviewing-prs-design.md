# Reviewing PRs Skill Design

## Overview

A Claude Code skill (`/reviewing-prs`) that performs holistic PR reviews by dispatching 6 specialized reviewer agents in parallel, then synthesizing their findings with confidence scoring and severity tiers.

## Input

Two modes (user must provide one):

1. **PR URL** — e.g., `/reviewing-prs https://github.com/org/repo/pull/123`
   - Extracts PR number from URL
   - Fetches diff via `gh pr diff`
   - Fetches PR description via `gh pr view`
   - Fetches PR comments via `gh api`

2. **Branch name** — e.g., `/reviewing-prs feature-branch`
   - Runs `git diff main...feature-branch`
   - No PR metadata available

## Review Dimensions

6 parallel reviewer agents:

| Agent | Focus | What it looks for |
|-------|-------|-------------------|
| **Bug Hunter** | Correctness | Logic errors, edge cases, null/undefined handling, race conditions, off-by-one errors, broken error handling |
| **Security Reviewer** | Security | Injection risks, auth issues, credential exposure, input validation gaps, OWASP top 10 |
| **Codebase Alignment** | Consistency | Follows existing patterns, naming conventions, architecture decisions from CLAUDE.md, doesn't reinvent existing utilities |
| **Code Quality** | Design | Complexity, duplication, abstraction level, separation of concerns, readability, dead code |
| **Test Quality** | Testing | Coverage of changed code, test behavior vs. implementation, edge cases tested, test readability |
| **Performance** | Efficiency | N+1 queries, unnecessary allocations, blocking operations, algorithmic complexity, missing caching |

## Skill Flow

### 1. Gather Context (sequential)

- Parse input: determine if PR URL or branch name
- If PR URL: extract number, fetch diff + description + comments
- If branch: run `git diff main...<branch>`
- Identify changed files, read their full contents
- Read CLAUDE.md and relevant project docs
- Build context package: diff, full files, project conventions, PR metadata (if available)

### 2. Dispatch Reviewers (parallel, 6 Task subagents)

- Each reviewer gets the context package + its specialized prompt
- Each returns findings as structured output: file, line range, severity, confidence, description
- Each agent only reviews changed code, not pre-existing issues
- Each agent ignores issues linters would catch
- Each agent respects PR comments (don't flag things already discussed)

### 3. Synthesize (sequential)

- Filter: drop findings below 80 confidence
- Deduplicate: if multiple agents flag the same line, merge into one finding with highest severity
- Group by severity: Blockers > Important > Suggestions
- Produce final verdict: **Ready to Merge**, **Needs Attention**, or **Needs Work**
- Present findings with file:line references
- Show filtering stats (raw findings vs. surfaced)

## Output Format

```
## PR Review: <PR title or branch name>

**Verdict: Needs Attention** (2 blockers, 3 important, 1 suggestion)

---

### Blockers

**[Bug] Off-by-one in pagination logic** (confidence: 95)
`src/api/paginate.ts:42` — Security Reviewer, Bug Hunter
The loop uses `<=` instead of `<`, which could return one extra item
and expose data the user shouldn't see.

### Important

**[Quality] Duplicates existing `formatDate` utility** (confidence: 88)
`src/components/Header.tsx:15` — Codebase Alignment
`src/utils/dates.ts` already exports `formatDate` with the same behavior.

### Suggestions

**[Perf] Consider memoizing expensive filter** (confidence: 82)
`src/hooks/useSearch.ts:67` — Performance
This filter runs on every render. With large datasets it could cause jank.

---

6 agents reviewed 12 files. 14 raw findings → 6 surfaced (80+ confidence).
```

## Confidence Scoring

- **90-100**: Concrete evidence — can point to the exact bug, vulnerability, or violation
- **80-89**: Strong suspicion with partial evidence — likely issue but not 100% certain
- **Below 80**: Don't report — not confident enough to surface

## Severity Tiers

- **Blocker**: Must fix before merge. Bugs, security vulnerabilities, data loss risks.
- **Important**: Should fix. Code quality issues, missing tests, pattern violations.
- **Suggestion**: Optional improvement. Performance hints, style preferences, minor enhancements.

## File Structure

```
claude/skills/reviewing-prs/
├── SKILL.md                      # Main skill: orchestration logic
├── bug-hunter-prompt.md          # Correctness reviewer prompt
├── security-reviewer-prompt.md   # Security reviewer prompt
├── codebase-alignment-prompt.md  # Consistency reviewer prompt
├── code-quality-prompt.md        # Design/quality reviewer prompt
├── test-quality-prompt.md        # Test reviewer prompt
└── performance-reviewer-prompt.md # Performance reviewer prompt
```

## Scope Rules (All Agents)

- Only review changed code, not pre-existing issues
- Don't flag issues that linters/formatters catch
- Don't flag things already discussed in PR comments
- Don't nitpick style when it matches project conventions
- Focus on the diff, use full file context only for understanding
