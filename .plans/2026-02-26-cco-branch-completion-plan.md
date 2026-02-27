# CCO Branch Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add shell tab completion for branch names on CCO commands that accept a branch argument.

**Architecture:** Add a `ListBranches` method to the git client, then register Cobra `ValidArgsFunction` on the `add`, `rm`, and `attach` commands. Extract the shared completion logic into a helper in `cmd/` to avoid repetition.

**Tech Stack:** Go, Cobra (ValidArgsFunction), git CLI

---

### Task 1: Add `ListBranches` to git client

**Files:**
- Modify: `orchestrator/internal/git/git.go:55` (after `BranchExists`)
- Modify: `orchestrator/internal/git/git_test.go:89` (after `BranchNotExists` test)

**Step 1: Write the failing tests**

Add these tests after `TestClient_BranchNotExists` in `orchestrator/internal/git/git_test.go`:

```go
func TestClient_ListBranches(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"branch", "--list", "--format=%(refname:short)"}).Return([]byte("feat\nmain\n"), nil)

	client := NewClient(r)
	branches, err := client.ListBranches("/repo")

	require.NoError(t, err)
	assert.Equal(t, []string{"feat", "main"}, branches)
	r.AssertExpectations(t)
}

func TestClient_ListBranches_Empty(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"branch", "--list", "--format=%(refname:short)"}).Return([]byte(""), nil)

	client := NewClient(r)
	branches, err := client.ListBranches("/repo")

	require.NoError(t, err)
	assert.Empty(t, branches)
	r.AssertExpectations(t)
}

func TestClient_ListBranches_Error(t *testing.T) {
	r := new(mockRunner)
	r.On("RunDir", "/repo", "git", []string{"branch", "--list", "--format=%(refname:short)"}).Return([]byte("fatal: not a git repo"), assert.AnError)

	client := NewClient(r)
	_, err := client.ListBranches("/repo")

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "git branch list failed")
}
```

**Step 2: Run tests to verify they fail**

Run: `cd orchestrator && go test ./internal/git/ -run TestClient_ListBranches -v -count=1`
Expected: FAIL — `ListBranches` not defined

**Step 3: Write minimal implementation**

Add this method after `BranchExists` in `orchestrator/internal/git/git.go`:

```go
// ListBranches returns the names of all local branches.
func (c *Client) ListBranches(repoRoot string) ([]string, error) {
	out, err := c.runner.RunDir(repoRoot, "git", "branch", "--list", "--format=%(refname:short)")
	if err != nil {
		return nil, fmt.Errorf("git branch list failed: %s", strings.TrimSpace(string(out)))
	}
	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return nil, nil
	}
	return strings.Split(raw, "\n"), nil
}
```

**Step 4: Run tests to verify they pass**

Run: `cd orchestrator && go test ./internal/git/ -run TestClient_ListBranches -v -count=1`
Expected: PASS (all 3 tests)

**Step 5: Commit**

```bash
git add orchestrator/internal/git/git.go orchestrator/internal/git/git_test.go
git commit -m "feat(git): add ListBranches method"
```

---

### Task 2: Add branch completion to commands

**Files:**
- Create: `orchestrator/cmd/completion.go`
- Modify: `orchestrator/cmd/add.go:36-39` (init function)
- Modify: `orchestrator/cmd/rm.go:33-37` (init function)
- Modify: `orchestrator/cmd/attach.go:30-33` (init function)

**Step 1: Create the shared completion helper**

Create `orchestrator/cmd/completion.go`:

```go
package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

func completeBranches(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	if len(args) > 0 {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	cwd, err := os.Getwd()
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	branches, err := newGitClient().ListBranches(cwd)
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	return branches, cobra.ShellCompDirectiveNoFileComp
}
```

**Step 2: Register on `addCmd`**

In `orchestrator/cmd/add.go`, add to the `init()` function before `rootCmd.AddCommand(addCmd)`:

```go
addCmd.ValidArgsFunction = completeBranches
```

**Step 3: Register on `rmCmd`**

In `orchestrator/cmd/rm.go`, add to the `init()` function before `rootCmd.AddCommand(rmCmd)`:

```go
rmCmd.ValidArgsFunction = completeBranches
```

**Step 4: Register on `attachCmd`**

In `orchestrator/cmd/attach.go`, add to the `init()` function before `rootCmd.AddCommand(attachCmd)`:

```go
attachCmd.ValidArgsFunction = completeBranches
```

**Step 5: Verify it compiles**

Run: `cd orchestrator && go build ./cmd/cco`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add orchestrator/cmd/completion.go orchestrator/cmd/add.go orchestrator/cmd/rm.go orchestrator/cmd/attach.go
git commit -m "feat(cli): add branch name completion for add, rm, attach"
```

---

### Task 3: Update README with completion setup

**Files:**
- Modify: `orchestrator/README.md:22` (after "Getting Started" heading)

**Step 1: Add shell completion section**

Insert the following after the `## Getting Started` line (line 22) and before the first code block (line 24) in `orchestrator/README.md`:

```markdown
**Enable tab completion (optional):**

```sh
# Bash
source <(cco completion bash)

# Zsh
source <(cco completion zsh)

# Fish
cco completion fish | source
```

Add the appropriate line to your shell's rc file to enable it permanently.

```

**Step 2: Commit**

```bash
git add orchestrator/README.md
git commit -m "docs: add shell completion setup to README"
```
