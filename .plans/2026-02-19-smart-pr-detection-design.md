# Smart PR Detection in completing-work

## Context

The completing-work skill always presents "Push and create PR" as an option, even when a PR already exists for the current branch. This happens during iterative workflows where you brainstorm/plan/execute multiple times on the same branch. The skill should detect existing PRs and offer to update them instead.

## Design

### PR Detection (new logic in Step 3)

Before presenting options, run:

```bash
gh pr view --json url,title,number
```

Use the result to decide which option set to show.

### Flow 1: No Existing PR (unchanged)

Options:
- "Push and create PR" — push branch, create draft PR
- "Keep branch as-is" — do nothing

### Flow 2: Existing PR Found (new)

Question text includes PR context: "Implementation complete. PR #42 exists for this branch. What would you like to do?"

Options:
- "Push and update PR" — push the branch, then update PR title and body via `gh pr edit <number> --title "..." --body "..."`
- "Keep branch as-is" — do nothing

### PR Description on Update

The updated PR description follows the same template from the global CLAUDE.md (Context, Changes, Review Notes, Test Plan). The title and body are regenerated based on all commits on the branch relative to the base branch — same logic as creating a new PR, just applied as an edit.

## Decisions

- **Push + update description** chosen over push-only (PR description should reflect the latest iteration) and push + description + comment (comments add noise across iterations)
- **Detection via `gh pr view`** — simplest approach, exits non-zero when no PR exists
