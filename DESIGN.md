# Design Decisions

This document explains key design decisions and rationale for this repository.

## Inline Implementation vs Subagents

The original [superpowers](https://github.com/obra/superpowers) repository uses a **subagent for each task** during plan execution: one subagent implements, another reviews for spec compliance, another reviews for code quality. This provides fresh context per task but is slow and token-intensive.

This repository uses a **hybrid approach**:

- **Implementation happens inline** (in the main context) - faster, no subagent startup overhead
- **Reviews still use subagents** (spec compliance + code quality) - maintains independent perspective

This reduces subagents per task from 3 to 2. The context pollution from inline implementation is worth the significant performance improvement.

## Why Design and Plan Before Execution

Planning before coding prevents costly rewrites and forces architectural thinking upfront. Key benefits:

- **Easier to change plans than code** - Reviewing and modifying a plan takes minutes; refactoring mid-implementation takes much longer
- **Reduces debugging time** - Upfront design thinking can reduce debugging time by up to 60%
- **Creates shared understanding** - Both human and agent have a clear mental model before committing resources
- **Prevents scope creep** - Breaking work into task chunks provides clear boundaries
- **Persistent reference** - Plan files serve as documentation for future features and can be accessed by humans and agents alike

The 2 minutes spent planning saves 20 minutes of refactoring later.

## Why Bash Scripts Over MCPs

This repository uses Bash scripts for integrations (Jira, Confluence, worktree management) rather than MCP servers. Reasons:

- **Agents are excellent at Bash** - Claude Code naturally understands how to invoke and interpret shell scripts
- **Simpler setup** - Provide a script and let the agent figure out usage vs configuring a finicky MCP server
- **Lower context overhead** - MCPs consume tokens with tool definitions and intermediate results; scripts are lightweight
- **Self-contained** - Scripts are version-controlled, easy to debug, and require no additional infrastructure
- **Stability** - MCP is still maturing and requires ongoing maintenance as the protocol evolves

## User-Managed Worktrees

The original [superpowers](https://github.com/obra/superpowers) repository allows Claude Code to manage Git worktrees directly. This repository takes a different approach: **you run the worktree scripts yourself**, then start a Claude Code session within that worktree.

The reason is Claude Code's permission model. Permissions are scoped to the directory where the session starts. If Claude tried to manage worktrees across different paths, it would either:

1. Constantly prompt for new permissions as it accesses different directories
2. Require running with `--dangerously-skip-permissions`

Neither is acceptable. The simpler solution is a clean separation of concerns:

- **You** control the worktree lifecycle (create, switch, destroy)
- **Claude** works within whichever directory you start it in

This means you can spin up multiple worktrees in separate tmux windows, each with its own Claude Code session working in parallel on different branches.

## Asking Questions: Patterns vs Prescriptions

The `asking-questions` skill teaches **how** to format questions (AskUserQuestion structure, when to use decision vs exploratory patterns, general guidelines). However, workflow skills still contain inline `AskUserQuestion` examples that show **what** specific questions to ask.

This is intentional:

- **asking-questions** = patterns (how to format, when to use each type)
- **Inline examples** = prescriptions (exact wording, specific options)

For example, `completing-work` prescribes exactly two options: "Push and create PR" and "Keep branch as-is". Without the inline example, Claude might word these differently each session, creating inconsistent UX.

The exception is `brainstorming`, which only references the asking-questions skill because its approach-selection options are dynamic (depends on what approaches were discussed).

**Rule of thumb:** If the exact wording matters, keep the inline example. If the options are dynamic, just reference the skill.
