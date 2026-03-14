# Structured Development Workflow

A workflow for reliably turning ideas into pull requests, adapted from [superpowers](https://github.com/obra/superpowers).

## Overview

```mermaid
flowchart TD
    subgraph Brainstorming["Skill(brainstorming)"]
        B1[Ask clarifying questions] --> B2[Explore 2-3 approaches]
        B2 --> B3[Present design for validation]
        B3 --> B4[Write design document]
    end

    subgraph Planning["Skill(writing-plans)"]
        P1[Break work into tasks] --> P2[Specify detailed instructions for each task]
        P2 --> P3[Write implementation plan]
    end

    subgraph Executing["Skill(executing-plans)"]
        E1[Pick next task] --> E2[Implement with TDD]
        E2 --> E3[Commit changes]
        E3 --> E4[Spec + code review]
        E4 -->|fail| E2
        E4 -->|pass| E5{More tasks?}
        E5 -->|yes| E1
        E5 -->|no| E6[Done]
    end

    subgraph Completing["Skill(completing-work)"]
        C1[Verify tests pass] --> C2[Reflect on learnings]
        C2 --> C3[Create draft PR]
    end

    Brainstorming --> Planning --> Executing --> Completing
```

## How to Use

Ask Claude to brainstorm your idea:

```
> You: Brainstorm how we can implement ticket ABC-123.
> Claude: Using Skill(brainstorming) ...
```

Answer Claude's questions as you proceed through the workflow.

## When to Use This Workflow

**Use the structured workflow** when:
- Building a significant feature that spans multiple files
- You want independent code reviews after each task
- The implementation would benefit from upfront design discussion
- You want a written plan you can review before execution

**Use Claude Code's built-in planning mode** when:
- Making smaller, well-defined changes
- The scope is clear and doesn't need exploration
- You want faster iteration with less ceremony
