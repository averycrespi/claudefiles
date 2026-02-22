# Executing Plans in Sandbox — Design

## Context

The structured development workflow currently offers two execution modes after writing a plan:

1. **Execute with subagents** — Full isolation via subagent dispatch on the host
2. **Execute quickly** — Inline execution in main context on the host

Both run on the host machine. The sandbox VM (`cco box push/pull`) already supports autonomous plan execution, but invoking it requires manual CLI commands. This design adds a third execution mode that wraps the sandbox workflow as a skill.

## Design

### New Skill: `executing-plans-in-sandbox`

A thin host-side skill that delegates plan execution to the sandbox VM, then reintegrates results. Located at `claude/skills/executing-plans-in-sandbox/SKILL.md`.

**Flow:**

```
1. Validate plan file path exists
2. Run: cco box push <plan-path> → capture job ID from stdout
3. Run: cco box pull <job-id> (blocks up to 30 min)
4. Use Skill(completing-work)
```

The skill does no task tracking, no reviews, and no subagent dispatch — the sandbox's own `executing-plans` skill handles all of that autonomously inside the VM.

### Updated Writing-Plans Handoff

The `AskUserQuestion` at the end of the writing-plans skill gets a third execution option:

```
- Execute with subagents (Recommended) — Full isolation, best for complex plans
- Execute quickly — Faster, does implementation and reviews in main context
- Execute in sandbox — Runs autonomously in a sandbox VM
- Don't execute — Stop here, execute manually later
```

### What the Skill Does NOT Do

- **No task tracking** — sandbox handles that internally
- **No error.txt handling** — separate concern for `cco box pull` later
- **No review phases** — sandbox skill runs its own reviews
- **No timeout configuration** — uses `cco box pull` default (30 min)

## Changes

1. **Create** `claude/skills/executing-plans-in-sandbox/SKILL.md` — the new skill
2. **Update** `claude/skills/writing-plans/SKILL.md` — add sandbox option to execution handoff
3. **Update** `claude/CLAUDE.md` — add skill to workflow skills table
