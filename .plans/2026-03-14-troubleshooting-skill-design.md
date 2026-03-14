# Troubleshooting Skill Design

## Overview

A "battle buddy" skill for incident response and system troubleshooting. Claude acts as an interactive partner that investigates alongside the user during incidents, pursuing multiple hypotheses in parallel via subagents while maintaining a fluid dialogue.

## Core Design Decisions

- **Interaction model:** Fluid dialogue with parallel research (not rigid phases)
- **Session start:** User describes the problem in whatever form they have; Claude fills gaps through conversation
- **Investigation:** Parallel subagents investigate 2-4 hypotheses simultaneously
- **Findings tracking:** Hypothesis board with status (investigating/supported/eliminated) and confidence levels
- **No postmortem generation** — skill stays focused on active troubleshooting

## Session Flow

### 1. Problem Intake

User describes the problem — whatever they know, however messy. Examples:
- "API is returning 500s"
- "Users can't log in since 2pm"
- A pasted error message or alert

Claude asks 1-2 clarifying questions — only what's needed to form initial hypotheses:
- When did it start?
- Any recent deploys or changes?
- What's the blast radius (all users? one region? one service?)

### 2. Hypothesis Generation

Claude generates 3-5 initial hypotheses and presents them as a hypothesis board:

```
## Hypothesis Board
1. 🔍 Recent deploy broke auth middleware  [Investigating]  confidence: medium
2. 🔍 Database connection pool exhausted   [Investigating]  confidence: medium
3. ⏳ Upstream dependency degraded          [Queued]
```

### 3. Parallel Investigation

Claude dispatches 2-4 subagents, each assigned a specific hypothesis and toolset.

**Subagent contract:**
- Input: hypothesis to test, what evidence to look for, which tools to use
- Output: structured finding — `SUPPORTED`, `ELIMINATED`, or `INCONCLUSIVE` with evidence summary
- Subagents are read-only investigators — no mutating actions

**Available investigation tools:**
- **Code & git** — `git log`, `git diff`, grep codebase for relevant code paths
- **Datadog** — `Skill(searching-datadog-logs)` for logs by service, time range, error patterns
- **Jira/Confluence** — Atlassian MCP via subagents for related incidents, runbooks, known issues
- **Web/status pages** — `WebFetch` for dependency status pages
- **User context** — Ask user for things Claude can't access (dashboards, Slack threads, customer reports)

### 4. Synthesize & Iterate

Main agent synthesizes subagent findings:
- Update hypothesis board (promote, eliminate, or refine hypotheses)
- New hypotheses may emerge from evidence found
- User shares their own findings — Claude incorporates them
- Dispatch follow-up subagents to dig deeper on promising branches

This cycle repeats until root cause is identified or the user has enough to act on.

### 5. Resolution

Once root cause is identified:
1. **Claude proposes mitigation** — code fix, config change, rollback, or manual action with rationale and risks
2. **User approves and acts** — Claude never takes mutating production actions autonomously. For code fixes, Claude writes the fix. For operational actions, Claude provides commands but user executes.
3. **Verification** — Claude helps verify the fix by checking the same signals that showed the problem

### 6. Open-Ended Sessions

Not every session has a clean resolution. The skill handles:
- "We mitigated but don't know root cause yet"
- "Still investigating, picking this up tomorrow"
- Partial progress is fine — no forced closure

## Safety Rules

- **Read-only by default** — subagents only investigate, never mutate
- **Explicit approval for actions** — any mutating action (restart, rollback, deploy, config change) requires user approval in the main conversation
- **Context-aware safety** — "is this action safe in THIS context?" not just generally

## Skill Trigger

```
Use when troubleshooting a system issue, investigating an outage, debugging a production problem, or responding to an incident. Activated by describing a problem, error, or unexpected system behavior that needs investigation.
```
