---
name: architecting
description: Use when exploring a large set of changes that span multiple features or components and need high-level structural thinking before designing individual pieces
---

# Architecting Ideas Into Architectures

## Overview

Help turn large, cross-cutting ideas into structured system descriptions through collaborative dialogue. Unlike the brainstorming skill (which designs a single component), this skill describes the shape of a broader system — what components exist, how they relate, what responsibilities they have, and why key decisions were made.

**Describe the system, don't plan the build.** The architecture document answers "what does this system look like?" not "how do we build it?" If you find yourself writing about ordering, sequencing, or steps — stop and reframe as structure.

Start by surveying the current system, then ask questions one at a time to understand the scope and constraints. Once the system shape is understood, present the architecture in sections, checking after each section whether it looks right so far.

**Announce at start:** "I'm using the architecting skill to describe the shape of this system."

## The Process

**Surveying the landscape:**
- Check out the current project state first (files, docs, recent commits, established patterns)
- Understand what exists before proposing changes
- Identify relevant architectural patterns already in use

**Framing the problem:**
- Ask questions one at a time to understand what should exist that doesn't today
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message
- Focus on understanding: what the system should look like, what's in scope vs. out

**Drawing boundaries:**
- Define what's inside the system and what's outside
- Surface hidden connections — "this component also needs to talk to Y — is that intentional?"
- Establish explicit non-goals to prevent scope creep

**Exploring approaches:**
- Propose 2-3 different system shapes with trade-offs
- Focus on how each shape interacts with the existing system
- Call out which established patterns each shape follows or breaks, and why
- Lead with the recommended shape and explain the reasoning
- Then use `AskUserQuestion` to capture the decision
- If user selects "Other", ask follow-up questions to understand their alternative

**Surfacing constraints:**
- Identify things that shape or bound the design
- Call out limitations that must be accepted intentionally
- Note constraints from the existing system that the design must respect

**Presenting the architecture:**
- Once the shape is chosen, present the architecture in sections of 200-300 words
- Ask after each section whether it looks right so far
- Cover: system overview, components, decisions, constraints
- Be ready to go back and revise if something doesn't fit

## Architecture Document

**Save to:** `.plans/YYYY-MM-DD-<topic>-architecture.md`

The architecture document describes the system's shape, not how to build it. Use this outline, omitting sections that don't apply:

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

## After the Architecture

**Documentation:**
- Write the validated architecture to `.plans/YYYY-MM-DD-<topic>-architecture.md` in the project root
- Commit the architecture document to git

**Designing components (if continuing):**

Ask which component to design first using `AskUserQuestion`, listing the components from the architecture as options. Then use Skill(brainstorming) to design the selected component, passing relevant context from the architecture document.

## Key Principles

- **Descriptive, not prescriptive** - Describe what the system looks like, not how to build it
- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Faster for user, clearer communication
- **Start from what exists** - Always survey the current system before proposing changes
- **Stay structural** - Resist the pull toward implementation details; that's what /brainstorm and /write-plan are for
- **Non-goals matter** - Defining what's out of scope is as important as what's in
- **Challenge assumptions** - Surface hidden constraints and question whether they still hold
- **Be flexible** - Go back and revise when something doesn't fit
