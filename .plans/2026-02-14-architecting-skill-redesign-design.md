# Architecting Skill Redesign

## Problem

The architecting skill reliably produces prescriptive implementation plans — work streams, sequencing, build order — when it should produce descriptive system architectures. It answers "how do we build this?" when it should answer "what does this system look like?"

## Design Principles

**Descriptive, not prescriptive.** The architecture document describes the shape of a system: what components exist, what they're responsible for, how they connect, and why key decisions were made. It does not describe how to build it, in what order, or what to watch out for during construction.

**Separation of concerns across skills:**
- `/architect` — what the system looks like (descriptive)
- `/brainstorm` — design a specific component in detail
- `/write-plan` — how to build it (prescriptive)

## Document Template

```markdown
# [Topic] Architecture

## Context
What exists today. Current system state, relevant patterns,
established conventions that matter.

## Goals & Non-Goals
What this work achieves. What is explicitly out of scope.

## System Overview
High-level description of the system shape. How the pieces
fit together. A paragraph or two that someone could read and
understand the whole picture.

## Components
### [Component Name]
**Responsibility:** What this component does and why it exists.
**Interface:** What it exposes to other components.
**Dependencies:** What it needs from other components.

### [Component Name]
...

## Decisions
Key choices made and why. For each decision:
what was chosen, what alternatives were considered,
and the reasoning.

## Constraints & Limitations
Things that shape or bound the design. Known limitations
that are accepted intentionally.
```

### What changed from the current template

| Removed | Reason |
|---|---|
| Work Streams | Prescriptive — describes build decomposition |
| Sequencing | Prescriptive — describes build order |
| Approach | Replaced by Decisions — captures what was decided, not what strategy to follow |
| System Interaction | Folded into System Overview and Components |
| Trade-offs | Folded into Decisions (reasoning includes costs) |
| Risks & Rabbit Holes | Reframed as Constraints & Limitations — things that shape the design |

| Added | Reason |
|---|---|
| System Overview | The "big picture" paragraph — the most important section |
| Components (Responsibility/Interface/Dependencies) | Structured description of each piece |
| Decisions (with alternatives + reasoning) | Captures the "why" alongside the "what" |
| Constraints & Limitations | Reframe of risks as design-shaping forces |

## Process Changes

The conversational process shifts to match:

1. **Surveying the landscape** — unchanged, still essential
2. **Framing the problem** — reframed from "what's driving the change" to "what should exist that doesn't today"
3. **Drawing boundaries** (was "Mapping the scope") — focus on what's inside vs outside the system, not what areas of code get touched
4. **Exploring approaches** — approaches are different system shapes, not different implementation strategies
5. **Surfacing constraints** (was "Identifying risks") — things that shape the design rather than build concerns
6. **Presenting the architecture** — section-by-section validation of the system description

## Anti-drift Instruction

The skill needs an explicit guardrail because Claude naturally gravitates toward actionable plans:

> **Describe the system, don't plan the build.** The architecture document answers "what does this system look like?" not "how do we build it?" If you find yourself writing about ordering, sequencing, or steps — stop and reframe as structure.

## After the Architecture

Instead of "ask which work stream to start with," the handoff becomes "ask which component to design first" and passes to `/brainstorm`.
