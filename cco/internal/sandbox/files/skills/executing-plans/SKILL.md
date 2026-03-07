---
name: executing-plans
description: Use when you have a written implementation plan file to execute - dispatches subagents for implementation and reviews to prevent context pollution
---

# Executing Plans

## Overview

Execute implementation plans by dispatching subagents for each phase: implementation, spec review, and code quality review. The main context only orchestrates while subagents do the heavy lifting, preventing context pollution that degrades model quality.

**Core principle:** Subagent per phase + controller orchestration = preserved model quality throughout long execution runs.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

## The Process

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

For each task triplet (Implement → Spec Review → Code Review):

1. Mark "Implement" in_progress
2. Dispatch implementer subagent with full task text
3. Implementer implements, tests, commits, self-reviews
4. Parse implementer report, capture agent ID and commit SHA
5. Mark "Implement" complete
6. Mark "Spec Review" in_progress
7. Dispatch spec reviewer subagent
8. If APPROVED → mark "Spec Review" complete
   If ISSUES → resume implementer to fix, re-dispatch spec reviewer
9. Mark "Code Review" in_progress
10. Dispatch code quality reviewer subagent
11. If APPROVED → mark "Code Review" complete
    If ISSUES → resume implementer to fix, re-dispatch code reviewer
12. Proceed to next triplet (now unblocked)

After all triplets:
Write output git bundle

### Step 1: Load Plan and Initialize Tasks

1. Read the plan file (path provided as argument)
2. Initialize task tracking: create all task triplets from the plan

**IMPORTANT:** Do NOT ask the user any questions. Do NOT use `AskUserQuestion`. If existing tasks are found, always continue from the first incomplete triplet.

### Creating Tasks from Plan

Parse the plan document and create a **task triplet** for each task:

**For each Task N in the plan:**

1. **Create Implementation task:**

   ```
   TaskCreate:
     subject: "Task N: Implement [Component Name]"
     description: |
       [Copy task content from plan: Files, Steps, Acceptance Criteria]
     activeForm: "Implementing [Component Name]"
   ```

2. **Create Spec Review task:**

   ```
   TaskCreate:
     subject: "Task N: Spec Review"
     description: |
       Review implementation of Task N for spec compliance.
       Verify all requirements are met, nothing extra added.
     activeForm: "Reviewing spec compliance for [Component Name]"
   ```

3. **Create Code Review task:**
   ```
   TaskCreate:
     subject: "Task N: Code Review"
     description: |
       Review implementation of Task N for code quality.
       Check tests, error handling, maintainability.
     activeForm: "Reviewing code quality for [Component Name]"
   ```

**After all tasks created, set blocking relationships:**

```
# Within each triplet:
TaskUpdate:
  taskId: [spec-review-id]
  addBlockedBy: [implement-id]

TaskUpdate:
  taskId: [code-review-id]
  addBlockedBy: [spec-review-id]

# Between triplets:
TaskUpdate:
  taskId: [task-N+1-implement-id]
  addBlockedBy: [task-N-code-review-id]
```

### Step 2: Execute Each Task Triplet

For each task triplet in order:

#### 2a. Implementation Phase

**Mark in progress:**

```
TaskUpdate:
  taskId: [implement-task-id]
  status: in_progress
```

**Dispatch implementer subagent:**

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: |
    You are implementing a task from a plan. Follow TDD: write failing test, verify it fails, implement, verify it passes, commit.

    ## Task
    [Full task text from plan]

    ## Instructions
    - Follow the plan steps exactly
    - Use TDD discipline
    - Commit after implementation with a conventional commit message
    - Report back with: commit SHA, files changed, test results

    ## Working Directory
    [Current working directory]
```

**Parse implementer report and mark complete.**

#### 2b. Spec Review Phase

**Dispatch spec reviewer subagent:**

```
Task tool (general-purpose):
  description: "Spec review Task N"
  prompt: |
    Review the implementation of this task for spec compliance.

    ## Task Requirements
    [Task text from plan]

    ## What to Check
    - All requirements from the plan are implemented
    - Nothing extra was added (YAGNI)
    - Tests cover the specified behavior
    - Code matches the plan's file paths and structure

    ## Output Format
    Start your response with exactly one of:
    - APPROVED: [brief reason]
    - ISSUES: [list of issues]
```

**If ISSUES:** Resume implementer to fix, re-dispatch spec reviewer. Repeat until APPROVED.

#### 2c. Code Quality Review Phase

**Dispatch code quality reviewer subagent:**

```
Task tool (general-purpose):
  description: "Code review Task N"
  prompt: |
    Review the implementation of this task for code quality.

    ## What Was Implemented
    [Brief summary]

    ## What to Check
    - Test quality (meaningful assertions, edge cases)
    - Error handling (appropriate, not excessive)
    - Code style (consistent with codebase)
    - No security issues
    - No unnecessary complexity

    ## Output Format
    Start your response with exactly one of:
    - APPROVED: [brief reason]
    - APPROVED_WITH_MINOR: [minor notes]
    - ISSUES: [list of issues]
```

**If ISSUES:** Resume implementer to fix, re-dispatch code reviewer. Repeat until APPROVED.

### Step 3: Write Output Bundle

After all tasks complete:

1. Run full test suite to verify everything works together
2. Determine the session ID from the workspace path:
   ```bash
   SESSION_ID=$(basename $(pwd))
   # This returns the session ID since workspace is /workspace/<session-id>
   ```
3. Create the output bundle:
   ```bash
   git bundle create "/exchange/${SESSION_ID}/output.bundle" HEAD
   ```

**IMPORTANT:** The output bundle MUST be written to exactly `/exchange/<session-id>/output.bundle`.

## Autonomous Operation Rules

- **NEVER** use `AskUserQuestion` — this runs unattended
- **NEVER** stop to ask for clarification — make reasonable decisions and proceed
- If a fundamental blocker prevents all progress, write a file `/exchange/<session-id>/error.txt` with the details and exit

## Red Flags

**Never:**

- Skip either review stage
- Proceed to code quality before spec compliance passes
- Ignore Critical or Important issues
- Prompt the user for input

**Always:**

- Follow plan steps exactly
- Use TDD for implementation
- Fix issues before proceeding to next task
- Commit after each task
- Write the output bundle as the very last step
