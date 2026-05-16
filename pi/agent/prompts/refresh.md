---
description: Reconstruct current branch context from git history and open PR
argument-hint: "[focus]"
---

Refresh yourself on the current work in this repository so a new session can quickly understand what is happening on the branch. Treat this as a read-only orientation pass, not implementation.

If the user supplied extra focus, prioritize it without ignoring the standard refresh scope: `$ARGUMENTS`.

Use read-only commands only. Do not edit files, stage changes, commit, push, pull, fetch, rewrite history, run destructive commands, or post GitHub comments unless the user explicitly asks.

## Local repository context

1. Confirm this is a git repository and identify:
   - repo root
   - current branch
   - current commit
   - short status, including staged, unstaged, and untracked files
   - configured remotes and upstream branch, if any
2. Determine the comparison base:
   - If the current branch is not `main` or `master`, compare the branch against the default branch. Prefer the merge base with `origin/HEAD`, then `origin/main`, then `origin/master`, then local `main`, then local `master`.
   - If the current branch is `main` or `master`, summarize commits ahead of its upstream. Prefer `@{upstream}`, then `origin/<current-branch>`.
   - If no suitable base/upstream ref exists, say so and fall back to recent commits plus working-tree changes, clearly marking the limitation.
3. Inspect the local branch work using targeted commands such as:
   - `git status --short --branch`
   - `git log --oneline --decorate BASE..HEAD`
   - `git diff --name-status BASE...HEAD`
   - `git diff --stat BASE...HEAD`
   - `git diff BASE...HEAD -- <path>` for important or surprising files
   - `git diff --cached` and `git diff` for staged/unstaged changes
   - `git ls-files --others --exclude-standard` for untracked files

## Open PR context

If the current branch appears to have an open GitHub PR, inspect it with the MCP broker GitHub tools. Use `mcp_search` and `mcp_describe` as needed before `mcp_call`; do not assume tool schemas.

1. Infer the GitHub repository and branch name from local git metadata when possible.
2. Look for an open PR whose head branch matches the current branch. Prefer broker-backed GitHub tools such as PR list/search/view/file/comment/check tools over local `gh` commands.
3. If an open PR is found, read enough PR context to summarize:
   - title, number, URL, state, draft/readiness, author if available
   - PR description and acceptance criteria or checklist
   - changed files and notable diff themes
   - review comments, unresolved feedback, requested changes, or approvals
   - check/run status and failing jobs, if available
4. If no PR is found, state that clearly and continue with the local branch summary.

## What to extract

Build a concise working-memory summary that answers:

- What is this branch trying to accomplish?
- What has already changed locally and in commits?
- What files or subsystems are central to the work?
- What is still in progress, uncertain, failing, or awaiting review?
- What user instructions, constraints, or repository conventions matter for the next agent action?
- What verification has already happened, and what should be run next?

Avoid dumping full diffs or long logs. Prefer synthesis with file paths and concrete evidence. Mention commit hashes, PR numbers, and key commands only when they help the next session resume accurately.

## Reporting format

Return a compact refresh brief with these sections:

1. `Branch snapshot` — branch, base/upstream, commit range, working-tree status, and PR link if any.
2. `Goal inferred` — one or two sentences about the apparent purpose of the branch.
3. `What changed` — bullets grouped by subsystem or file area, with paths.
4. `Current state` — completed work, dirty files, open PR feedback, failing checks, and known gaps.
5. `Next useful actions` — the smallest concrete steps the next agent should consider.
6. `Evidence reviewed` — commands and MCP/GitHub records inspected, plus limitations.

Be explicit about uncertainty. If the evidence is thin, say what was missing instead of over-inferring.
