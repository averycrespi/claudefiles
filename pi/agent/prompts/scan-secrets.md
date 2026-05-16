---
description: Scan branch or unpushed commits for secrets and personal information
---

Perform a pre-merge/pre-push leak scan for the current git repository. The goal is to prevent secrets, credentials, tokens, private URLs, and personal information from being merged or pushed.

Use read-only commands only. Do not edit files, rewrite history, stage changes, commit, push, or fetch unless the user explicitly asks.

## Scope selection

1. Confirm this is a git repository and identify:
   - repo root
   - current branch
   - short status, including staged, unstaged, and untracked files
   - configured upstream/default remote refs available locally
2. Choose the scan scope:
   - If on a feature branch, scan commits and changes introduced by the branch compared with the default branch. Prefer the merge base with `origin/HEAD`, then `origin/main`, then `origin/master`, then local `main`, then local `master`.
   - If on `main` or `master`, scan commits and changes ahead of the upstream branch. Prefer `@{upstream}`, then `origin/<current-branch>`.
   - Always include staged and unstaged working-tree changes in the review. Include untracked files that are not obviously generated/vendor output.
3. If no suitable base/upstream ref exists, say so and fall back to scanning the working tree plus recent commits only if that still gives useful coverage. Be explicit about the limitation.

## Required tool checks

Use `bash` for local git and scanner commands.

Prefer `gitleaks` when installed:

- For committed history in scope, run `gitleaks git` with `--redact` and a `--log-opts` range matching the selected scope, for example `BASE..HEAD`.
- For working-tree/staged/untracked content, run the most targeted available gitleaks command for the installed version. Prefer scanning a generated patch or explicit changed files over scanning the entire repo. Use `gitleaks --help` / subcommand help if needed.

If `gitleaks` is not installed, do not install it automatically. Fall back to manual grep/ripgrep scans over the selected diffs and changed/untracked files.

## Manual review checklist

Whether or not gitleaks runs, manually inspect the selected diffs for:

- API keys, tokens, OAuth credentials, JWTs, private keys, certificates, passwords, session cookies, webhook secrets, database URLs, cloud credentials, SSH keys, and `.env`-style assignments
- Internal hostnames, private repository URLs, customer names, project names, issue tracker URLs, private package registries, or proprietary examples
- Personal information such as personal email addresses, phone numbers, home paths, usernames embedded in config, real names in fixtures, and location/address data
- High-entropy strings or long base64/hex blobs that are not clearly test fixtures
- New or modified ignore rules that might allow secrets to be committed later
- Binary files, archives, screenshots, logs, notebooks, database dumps, HAR files, crash dumps, and generated artifacts that can hide secrets

Use targeted commands such as:

- `git diff --name-status BASE...HEAD`
- `git log --oneline BASE..HEAD`
- `git diff --stat BASE...HEAD`
- `git diff BASE...HEAD -- <path>` for suspicious files
- `git diff --cached` and `git diff` for staged/unstaged changes
- `git ls-files --others --exclude-standard` for untracked files
- `rg` over changed/untracked text files for secret-like patterns and personal data indicators

## Subagents

Use subagents only when the scan scope is large enough to benefit from parallel review, such as many changed files, generated-looking artifacts, or mixed domains. If used, spawn read-only review agents with narrow assignments, for example:

- one agent reviews gitleaks/manual scanner output and suspicious high-entropy findings
- one agent reviews diffs for private/internal information and personal data
- one agent reviews binary/generated/untracked artifacts and ignore-rule changes

Do not send raw secrets to subagents unnecessarily. Redact values in prompts whenever possible and keep all subagent tasks read-only.

## Reporting

Return a concise report with:

1. Scope scanned: branch, base/upstream ref, commit range, and whether staged/unstaged/untracked changes were included.
2. Tools run: exact commands or a clear summary, including whether gitleaks was available.
3. Findings:
   - `BLOCKER` for likely real secrets or sensitive personal/private data
   - `REVIEW` for suspicious but unconfirmed values
   - `OK` when no leaks are found
4. For each finding, include file path and line or diff context when available, but redact secret values. Show only short prefixes/suffixes if needed for identification.
5. State limitations, such as missing upstream refs, skipped binary files, unavailable gitleaks, or unscanned large/generated files.

If any `BLOCKER` is found, clearly say not to merge or push until it is removed and, if already exposed beyond the local machine, rotated/revoked.
