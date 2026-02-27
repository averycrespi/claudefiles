# CCO Branch Name Completion

## Context

CCO commands `add`, `rm`, and `attach` all take a branch name as an argument. Currently there's no tab completion, so users must type branch names manually.

## Design

Use Cobra's built-in completion support to suggest local git branch names for all branch-accepting commands.

### Components

1. **`git.Client.ListBranches(repoRoot string) ([]string, error)`** - New method that runs `git branch --list --format='%(refname:short)'` and returns all local branch names.

2. **`ValidArgsFunction` on `add`, `rm`, `attach`** - Each command registers a `ValidArgsFunction` that calls `ListBranches` from the current working directory and returns the results as completion suggestions.

3. **Cobra's built-in `completion` subcommand** - Cobra automatically generates `cco completion bash|zsh|fish|powershell`. No extra code needed.

### User activation

Users add to their shell rc:

```bash
source <(cco completion bash)   # or zsh/fish
```

### Notes

- All three commands get the same completions (all local branches). No filtering by workspace state.
- `ValidArgsFunction` suggests but doesn't restrict — users can still type any branch name freely (important for `add` which creates new branches).
- Completion errors are silently ignored (standard Cobra behavior) — if git fails, the user just gets no suggestions.
