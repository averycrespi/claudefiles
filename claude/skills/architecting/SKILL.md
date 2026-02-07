---
name: architecting
description: Use when exploring a large set of changes that span multiple features or work streams and need high-level structural thinking before designing individual features
---

# Architecting Ideas Into Architectures

## Overview

Help turn large, cross-cutting ideas into structured architectures through collaborative dialogue. Unlike the brainstorming skill (which designs a single feature), this skill maps a broader problem space — how changes interact with the existing system, what trade-offs to make, and how work decomposes into discrete streams.

Start by surveying the current system, then ask questions one at a time to understand the scope and constraints. Once the problem space is understood, present the architecture in sections, checking after each section whether it looks right so far.

**Announce at start:** "I'm using the architecting skill to explore the structure of this work."

## The Process

**Surveying the landscape:**
- Check out the current project state first (files, docs, recent commits, established patterns)
- Understand what exists before proposing changes
- Identify relevant architectural patterns already in use

**Framing the problem:**
- Ask questions one at a time to understand what's driving the change
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message
- Focus on understanding: high-level goals, constraints, what's in scope vs. out

**Mapping the scope:**
- Identify what areas of the system the changes touch
- Surface hidden connections — "changing X also affects Y — is that intentional?"
- Establish explicit non-goals to prevent scope creep

**Exploring approaches:**
- Propose 2-3 high-level strategies with trade-offs
- Focus on how each approach interacts with the existing system
- Call out which established patterns each approach follows or breaks, and why
- Lead with the recommended approach and explain the reasoning
- Then use `AskUserQuestion` to capture the decision
- If user selects "Other", ask follow-up questions to understand their alternative

**Identifying risks:**
- Surface things that might be harder than they look
- Call out rabbit holes to avoid
- Note ordering constraints and migration concerns
- Identify areas of uncertainty that need spikes or prototypes

**Presenting the architecture:**
- Once the approach is chosen, present the architecture in sections of 200-300 words
- Ask after each section whether it looks right so far
- Cover: system interaction, trade-offs, work stream decomposition, sequencing
- Be ready to go back and revise if something doesn't fit

## Architecture Document

**Save to:** `.plans/YYYY-MM-DD-<topic>-architecture.md`

The architecture document captures high-level structure, not implementation details. Use this outline, omitting sections that don't apply:

```markdown
# [Topic] Architecture

## Context
What exists today. Current system state, relevant patterns,
recent changes that matter.

## Goals & Non-Goals
What this work achieves. What is explicitly out of scope.

## Approach
The chosen high-level strategy and why. Alternatives considered
and why they were rejected.

## System Interaction
How the changes integrate with the existing system. Which
established patterns are followed, which are broken and why.

## Trade-offs
What is accepted in exchange for what. Explicit about the
costs of the chosen approach.

## Risks & Rabbit Holes
What could go wrong. What might be more complex than it looks.
What to avoid getting drawn into.

## Work Streams
### 1. [Stream Name]
Brief description, key decisions, dependencies.

### 2. [Stream Name]
Brief description, key decisions, dependencies.

## Sequencing
Suggested order and rationale. What can be parallelized.
What must happen first.
```

## After the Architecture

**Documentation:**
- Write the validated architecture to `.plans/YYYY-MM-DD-<topic>-architecture.md` in the project root
- Commit the architecture document to git

**Designing work streams (if continuing):**

Ask which work stream to start with using `AskUserQuestion`, listing the work streams from the architecture as options. Then use Skill(brainstorming) to design the selected work stream, passing relevant context from the architecture document.

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Faster for user, clearer communication
- **Start from what exists** - Always survey the current system before proposing changes
- **Stay high-level** - Resist the pull toward implementation details; that's what /brainstorm and /write-plan are for
- **Explicit trade-offs** - Every approach has costs; name them
- **Non-goals matter** - Defining what's out of scope is as important as what's in
- **Challenge assumptions** - Surface hidden constraints and question whether they still hold
- **Be flexible** - Go back and revise when something doesn't fit
