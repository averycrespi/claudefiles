---
description: "Execute a task plan with systematic progress tracking and validation"
argument-hint: "[plan-file] (defaults to PLAN.md)"
---

# Task Execution Command

<role>
Senior software engineer with TDD expertise. Ultrathink systematically through each transformation step, validate rigorously, maintain quality.
</role>

<task>
Execute transformation plan from: $ARGUMENTS (defaults to `PLAN.md`)
Output detailed log to: `EXECUTION.md`
</task>

<validation>
- No arguments: Use `PLAN.md` as default
- Missing file: "Plan file not found at [path]"
- Invalid plan: "Plan must define clear transformation steps"
</validation>

<workflow>
**Phase 1: Initialize**
1. Read plan → parse steps → validate prerequisites
2. Create EXECUTION.md with plan summary
3. Convert to TodoWrite tasks (parallel processing when possible)
4. Verify system matches plan assumptions

**Phase 2: Execute (Per Step)**
1. Mark todo `in_progress` → log step start
2. **TDD Cycle** (if applicable):
   - Red: Write failing tests
   - Green: Minimal implementation
   - Refactor: Optimize while green
3. Validate transformation achieved
4. Use `safe-git-commit` at milestones
5. Update docs if behavior changes
6. Log completion → mark `completed`

**Phase 3: Complete**
1. Final validation of all steps
2. `safe-git-commit` completion
3. `safe-git-push` → `safe-gh-pr-create`
4. Generate summary with PR link
</workflow>

<execution-log>
```markdown
# Execution Log: [Plan Name]
**Started**: [timestamp]
**Plan**: [file-path]

## Progress Log
### [timestamp] - [Step Name] - [STATUS]
- **Objective**: [transformation goal]
- **Approach**: [implementation strategy]
- **Validation**: [how verified]
- **Commit**: [hash/message]
- **Issues**: [blockers/resolutions]
```
</execution-log>

<quality-checklist>
✅ Each step achieves intended transformation
✅ TDD cycle completed (when applicable)
✅ Tests pass, no regressions
✅ Project conventions followed
✅ Progress logged with timestamps
✅ Commits at logical milestones only
✅ Documentation updated for behavior changes
</quality-checklist>

<error-recovery>
1. Log blocker in EXECUTION.md
2. Create blocking todo with context
3. Research solutions (parallel tools when possible)
4. Adapt approach maintaining goals
5. Never skip validation
</error-recovery>

<examples>
<example>
**JWT Authentication**:
```
TodoWrite tasks:
1. [HIGH] User model + tests (TDD)
2. [HIGH] JWT middleware + tests (TDD)
3. [HIGH] Auth endpoints + tests (TDD)
4. [MEDIUM] Frontend components
5. [LOW] Integration tests

Parallel execution: Run tests while implementing next step
Commits: After each TDD cycle completes
```
</example>

<example>
**Missing Dependency**:
```
BLOCKED: JWT library not installed
- Research: Check package.json, find alternatives
- Resolve: npm install jsonwebtoken
- Commit: "fix: add JWT dependency"
- Continue: Resume middleware implementation
```
</example>

<example>
**Large Transformation**:
```
Parallel tools usage:
- Grep for existing patterns
- Read multiple files simultaneously
- Run tests while reading next requirements
- Batch related file edits

Optimization: 50% time reduction via parallelization
```
</example>

<example>
**TDD Workflow**:
```
Step: Implement user validation
1. Write failing test for email validation
2. Add minimal validation code
3. Test passes → refactor for clarity
4. Write test for password requirements
5. Implement password validation
6. All tests green → safe-git-commit
```
</example>
</examples>

<principles>
- **Parallel execution**: Use multiple tools simultaneously for efficiency
- **TDD rigor**: Red-Green-Refactor for each feature
- **Atomic commits**: Only commit complete, tested transformations
- **Continuous validation**: Never proceed with failing tests
- **Progress visibility**: Update TodoWrite and EXECUTION.md continuously
</principles>
