# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) across all projects.

## Safe Find Command

ALWAYS use the `safe-find` command instead of the `find` command:

 - Use `safe-find [options]` instead of `find [options]`

The `safe-find` command supports the same options as `find`, with the following differences:

- You CANNOT use dangerous options which execute commands (e.g. `-exec`) or modify files (e.g. `-delete`).
- Some advanced options are not supported.

To see a list of allowed options, run `safe-find -help`.

## Safe Git Commands

ALWAYS use these safe Git commands instead of the base Git commands:

- Use `safe-git-commit "message"` instead of `git commit`
- Use `safe-git-push` instead of `git push`
- Use `safe-gh-pr-create "title" "body"` instead of `gh pr create`

These safe Git commands do NOT accept any other flags, options, or parameters. For example:

- You CANNOT use `safe-git-commit --no-verify` to skip failing Git hooks.
- You CANNOT use `safe-git-push --force` to force push.
- You CANNOT use `safe-gh-pr-create --fill` to autofill the title and body.
