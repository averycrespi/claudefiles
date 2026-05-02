---
name: reviewing-prs
description: Use when reviewing a pull request or branch holistically across correctness, security, codebase alignment, code quality, test quality, and performance. Accepts a GitHub PR URL or local branch name as argument.
---

# Reviewing PRs

## Overview

Announce: "I'm using the reviewing-prs skill to perform a holistic review."

Perform six parallel specialized reviews of a pull request or branch, then synthesize findings with confidence scoring and severity tiers. Each review dimension runs as an independent `review` subagent through `spawn_agents`; results are merged, deduplicated, and presented as one structured report.

## Input Parsing

The user MUST provide either a GitHub PR URL or a branch name as argument.

### Mode 1: GitHub PR URL

Matches pattern: `https://github.com/<owner>/<repo>/pull/<number>`

1. Extract `<owner>`, `<repo>`, and `<number>` from the URL.
2. Use MCP broker GitHub tools for remote PR data. Prefer direct `mcp_call` when the tools are listed in the system prompt; otherwise use `mcp_search` / `mcp_describe` first.
3. Fetch PR context:
   - `github.gh_view_pr` for title, body, and metadata
   - `github.gh_diff_pr` for file summary and unified diff; request a large `max_bytes` value when needed, up to the tool limit
   - `github.gh_list_pr_files` for changed files and add/delete counts
   - `github.gh_list_pr_comments` for conversation comments
   - `github.gh_list_pr_reviews` for review summaries
   - `github.gh_list_pr_review_comments` for inline review comments
4. If MCP broker returns a configuration or authentication error, report that remote PR review requires broker access and stop.
5. If the diff is truncated, continue with available context but mark truncation as a review gap in the final report.
6. Do not use the `gh` CLI for PR URL mode.

### Mode 2: Local Branch Name

Any input that does not match the PR URL pattern.

1. Determine the default branch with local git:
   ```bash
   git symbolic-ref --short refs/remotes/origin/HEAD
   ```
   Fall back to `origin/main`, then `main`, if the command fails.
2. Fetch the diff with merge-base semantics:
   ```bash
   git diff <default-branch>...<branch>
   ```
3. Fetch changed file names:
   ```bash
   git diff --name-only <default-branch>...<branch>
   ```
4. No PR metadata is available in this mode unless the user provides it.

## Gather Context

After obtaining the diff:

1. Parse the changed files from the PR file list, `git diff --name-only`, or diff headers (`+++ b/` and `--- a/`).
2. Read full local file contents for changed files when the workspace appears to be a checkout of the reviewed code. If a file is missing or local content may not match the PR branch, rely on the diff and record the limitation.
3. Read relevant project guidance files when present, especially `AGENTS.md`, `CLAUDE.md`, and nearby repository docs that define review or code conventions.
4. In PR URL mode, include PR title, description, conversation comments, review summaries, and inline review comments.
5. Assemble a context package for reviewers with:
   - review target and input mode
   - PR metadata if available
   - prior comments/reviews if available
   - changed file list
   - unified diff
   - relevant full-file context where available
   - project guidance files
   - explicit gaps such as truncated diff or missing local files

## Dispatch Reviewers

Read each prompt file from this skill directory at dispatch time, then launch all six reviewers in one `spawn_agents` call. Use the `review` agent type for every reviewer. Each agent prompt is the relevant prompt file content plus the full context package.

| #   | Reviewer           | Prompt File                      | Intent example       |
| --- | ------------------ | -------------------------------- | -------------------- |
| 1   | Bug Hunter         | `bug-hunter-prompt.md`           | `bug hunt`           |
| 2   | Security Reviewer  | `security-reviewer-prompt.md`    | `security review`    |
| 3   | Codebase Alignment | `codebase-alignment-prompt.md`   | `codebase alignment` |
| 4   | Code Quality       | `code-quality-prompt.md`         | `code quality`       |
| 5   | Test Quality       | `test-quality-prompt.md`         | `test quality`       |
| 6   | Performance        | `performance-reviewer-prompt.md` | `performance review` |

Each reviewer MUST return findings in this exact format when findings exist:

```text
FINDINGS:
- <file>:<line> | <severity> | <confidence> | <description>
```

If no findings meet the confidence threshold, the reviewer MUST return exactly:

```text
NO_FINDINGS
```

Where `<severity>` is one of: `blocker`, `important`, `suggestion`.
Where `<confidence>` is an integer from 0 to 100.

## Synthesize

After all six agents return:

1. Parse each response for `FINDINGS:` or `NO_FINDINGS`.
2. Treat malformed reviewer output conservatively: parse any usable finding lines, count the malformed response as a review gap, and do not invent missing findings.
3. Filter out any finding with confidence below 80.
4. Deduplicate findings that point to the same file and line range within 3 lines or describe the same root cause. Merge duplicates by keeping the highest severity and confidence, then note all contributing reviewers.
5. Group by severity: Blockers > Important > Suggestions.
6. Determine verdict:
   - **Ready to Merge** — 0 blockers, 0 important
   - **Needs Attention** — 0 blockers, 1+ important
   - **Needs Work** — 1+ blockers
7. Surface review gaps such as truncated diff, missing file context, unavailable PR comments, or malformed reviewer output.

## Output Format

Present results using this template. Omit empty severity sections.

```markdown
## PR Review: <PR title or branch name>

**Verdict: <verdict>** (<N> blockers, <N> important, <N> suggestions)

---

### Blockers

**[<Category>] <Title>** (confidence: <N>)
`<file>:<line>` — <Reviewer(s)>
<Description>

### Important

**[<Category>] <Title>** (confidence: <N>)
`<file>:<line>` — <Reviewer(s)>
<Description>

### Suggestions

**[<Category>] <Title>** (confidence: <N>)
`<file>:<line>` — <Reviewer(s)>
<Description>

---

<N> agents reviewed <N> files. <N> raw findings → <N> surfaced (80+ confidence).

Review gaps: <none or concise list>
```

## Pi Notes

- `review` subagents inherit the active Pi model unless the agent definition overrides it.
- Remote PR review depends on the `mcp-broker` extension and authenticated GitHub broker tools.
- Large PR diffs may be truncated by `github.gh_diff_pr`; use changed-file summaries, available full-file context, and review-gap reporting rather than pretending the review is complete.
- `spawn_agents` reviewers start with fresh context and read-only tools, so brief them with all relevant context and constraints.
