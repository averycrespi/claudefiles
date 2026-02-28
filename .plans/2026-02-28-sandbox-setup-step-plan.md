# Sandbox Setup Step Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Add a Step 0 (Environment Setup) to the sandbox executing-plans skill so Claude installs dependencies and verifies tests pass before starting plan work.

**Architecture:** Insert a new markdown section into the embedded SKILL.md file. Renumber existing steps from 1→2→3 to 1→2→3→4. No Go code changes.

**Tech Stack:** Markdown (embedded Go file via `//go:embed`)

---

### Task 1: Add Step 0 and renumber existing steps

**Files:**
- Modify: `orchestrator/internal/sandbox/files/skills/executing-plans/SKILL.md:15-38` (insert new step, renumber old steps)

**Step 1: Add the new Step 0 section**

Insert the following section after the `**Announce at start:**` line (line 14) and before the current `### Step 1: Load Plan and Initialize Tasks` (line 38):

```markdown
### Step 0: Environment Setup

Before executing the plan, ensure the project builds and all tests pass. You are running in a disposable sandbox VM with full root access — install anything you need without hesitation.

1. **Inspect the project** for dependency manifests and tooling config:
   - Language runtimes: `.tool-versions`, `.node-version`, `.python-version`, `.go-version`
   - Dependencies: `go.mod`, `package.json`, `pyproject.toml`, `Gemfile`, `Cargo.toml`
   - Build config: `Makefile`, `justfile`, `Taskfile.yml`, `setup.sh`

2. **Install missing runtimes and tools:**
   - Use `asdf` (pre-installed) for `.tool-versions` entries: `asdf plugin add <name> && asdf install`
   - Use `sudo apt-get install` for system packages
   - Download binaries directly if needed — this VM is disposable

3. **Install project dependencies:**
   - Run the appropriate install command (`go mod download`, `npm install`, `pip install`, etc.)

4. **Run the full test suite** and confirm all tests pass:
   - If tests fail due to missing dependencies or environment issues, fix the environment and retry
   - Do NOT proceed to Step 1 until all tests are green
   - If tests cannot be made to pass after reasonable effort, write `/exchange/<session-id>/error.txt` with details and exit

**Remember:** This is an isolated sandbox. You have full root access. Use `sudo` freely, install packages, modify system config, and change environment variables. Fix problems rather than working around them.
```

**Step 2: Renumber existing steps**

Rename the existing step headers:
- `### Step 1: Load Plan and Initialize Tasks` → `### Step 1: Load Plan and Initialize Tasks` (no change — stays Step 1)
- `### Step 2: Execute Each Task Triplet` → `### Step 2: Execute Each Task Triplet` (no change — stays Step 2)
- `### Step 3: Write Output Bundle` → `### Step 3: Write Output Bundle` (no change — stays Step 3)

The existing steps are already numbered 1-3 so no renumbering is needed — the new step is Step 0.

**Step 3: Verify the file is valid markdown**

Read the modified file and confirm:
- Step 0 appears between the overview and Step 1
- Steps 1, 2, 3 are unchanged
- No broken formatting

**Step 4: Commit**

```bash
git add orchestrator/internal/sandbox/files/skills/executing-plans/SKILL.md
git commit -m "feat(sandbox): add environment setup step to executing-plans skill"
```

<!-- No documentation updates needed — this is an embedded file, not user-facing docs -->
