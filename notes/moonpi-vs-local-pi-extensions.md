# Moonpi vs. My Pi Extensions

## Summary

After exploring both this repo's Pi configuration and [`galatolofederico/moonpi`](https://github.com/galatolofederico/moonpi), the clearest difference is this:

- **This repo** is a modular, test-heavy toolkit for building and comparing agent workflows.
- **Moonpi** is a single opinionated workflow shell optimized for day-to-day use.

They overlap in a few workflow primitives — task tracking, planning, interaction tools, long-running loops — but they make very different bets about how a coding agent should be steered.

## What this repo is optimizing for

The Pi side of this repo is explicitly organized as a set of independent extensions plus shared libraries rather than one monolithic package. See `pi/README.md:21` and `pi/README.md:38`.

Core pieces:

- **`subagents`** — first-class delegation to isolated child Pi processes, including parallel execution and typed agent roles (`pi/agent/extensions/subagents/README.md:20`)
- **`_workflow-core`** — reusable primitives for structured workflows built around subagents (`pi/agent/extensions/_workflow-core/README.md:3`)
- **`autopilot`** — deterministic `plan → implement → verify` orchestration from a design doc (`pi/agent/extensions/autopilot/README.md:48`)
- **`autoralph`** — an intentionally different, agent-driven iterative loop for comparison against autopilot (`pi/agent/extensions/autoralph/README.md:7`)
- **`task-list`** — session-scoped task state with an explicit state machine and sticky widget (`pi/agent/extensions/task-list/README.md:60`)
- **`mcp-broker`** — broker-backed access to remote git and GitHub operations through stable meta-tools (`pi/agent/extensions/mcp-broker/README.md:5`)
- **`web-access`** — web search, fetch, GitHub repo cloning, and PDF extraction (`pi/agent/extensions/web-access/README.md:14`)
- **`ask-user`** — structured multiple-choice user clarification (`pi/agent/extensions/ask-user/README.md:7`)

### The local philosophy

This repo leans toward:

- **composability** — many narrow extensions instead of one umbrella extension
- **workflow experimentation** — e.g. `autopilot` and `autoralph` are deliberately comparable (`pi/agent/extensions/autoralph/README.md:7`)
- **subagent specialization** — the system treats delegation as a core capability, not an escape hatch (`pi/agent/extensions/subagents/README.md:35`)
- **verification and observability** — especially in `autopilot`, whose verify phase includes validation, multiple reviewers, synthesis, and capped fix loops (`pi/agent/extensions/autopilot/README.md:135`)

In short: this repo is closer to an **agent harness lab** than a single-product UX.

## What Moonpi is optimizing for

Moonpi is packaged as one extension entrypoint that installs its tools, guards, context injection, sprint workflow, and Synthetic provider support from `src/index.ts` (`/tmp/pi-github-repos/galatolofederico/moonpi/package.json:14`, `/tmp/pi-github-repos/galatolofederico/moonpi/src/index.ts:17`).

Its README is unusually explicit about its opinions:

- subagents are not worth the cost (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:19`)
- planning is only useful if the planning context is retained into execution (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:23`)
- reads and writes should stay inside the working directory (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:27`)
- read-before-write should be enforced (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:32`)

Core pieces:

- **Mode system** — `plan`, `act`, `auto`, and `fast`, each with different active tools (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:67`, `/tmp/pi-github-repos/galatolofederico/moonpi/src/modes.ts:123`)
- **Auto mode** — plans first, then switches to act while retaining the full planning conversation (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:83`, `/tmp/pi-github-repos/galatolofederico/moonpi/src/index.ts:105`)
- **Hard guardrails** — blocks reads/writes outside cwd and blocks editing a file that has not been read (`/tmp/pi-github-repos/galatolofederico/moonpi/src/guards.ts:45`)
- **Context file injection** — recursively injects `README.md`, `SPECS.md`, and `SPRINT.md` into context (`/tmp/pi-github-repos/galatolofederico/moonpi/src/context-files.ts:68`)
- **Sprint loop** — a file-driven phased workflow around `SPRINT.md` and `TASKS.md` (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:147`)

In short: Moonpi is trying to be a **coherent default operating mode** for Pi.

## Side-by-side comparison

## 1. Subagents

This is the biggest philosophical split.

- **This repo:** subagents are central. `spawn_agents` is a first-class tool with built-in agent types like `explore`, `review`, `research`, `deep-research`, and `code` (`pi/agent/extensions/subagents/README.md:20`, `pi/agent/extensions/subagents/README.md:35`). `autopilot` also routes all LLM work through subagents (`pi/agent/extensions/autopilot/README.md:50`).
- **Moonpi:** explicitly argues against subagents in principle (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:19`).

This repo treats isolation, specialization, and parallelism as worth the cost. Moonpi treats them as overhead.

## 2. Planning

- **This repo:** planning is usually represented as a structured artifact for later isolated execution. In `autopilot`, a plan subagent emits architecture notes plus an ordered task list, then implement runs task-by-task in fresh contexts (`pi/agent/extensions/autopilot/README.md:68`, `pi/agent/extensions/autopilot/README.md:92`).
- **Moonpi:** planning is valuable only if the same conversation continues into execution, which is the core point of Auto mode (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:87`).

This repo prefers **artifact handoff**. Moonpi prefers **history continuity**.

## 3. Task tracking

- **This repo:** `task-list` is more formal. It has explicit statuses, sticky completion, atomic reconciliation, and a reusable public API (`pi/agent/extensions/task-list/README.md:16`, `pi/agent/extensions/task-list/README.md:87`, `pi/agent/extensions/task-list/README.md:154`).
- **Moonpi:** TODOs are simpler and more tightly coupled to the mode system and act as the steering mechanism for plan→act handoff (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:104`, `/tmp/pi-github-repos/galatolofederico/moonpi/src/index.ts:111`).

This repo has the stronger task engine. Moonpi has the lower-friction default flow.

## 4. Safety and guardrails

- **This repo:** the agent instructions strongly push read-before-edit and careful repo-scoped behavior, but enforcement tends to happen through workflow boundaries, tool separation, and read-only agent types rather than universal hard blocks.
- **Moonpi:** enforces cwd-only access and read-before-write in code, at runtime, for key file tools (`/tmp/pi-github-repos/galatolofederico/moonpi/src/guards.ts:50`).

Moonpi is stronger on **hard steering constraints**.

## 5. Verification depth

- **This repo:** `autopilot` has a substantial verify phase with validation, three parallel review passes, synthesis, and capped fix loops (`pi/agent/extensions/autopilot/README.md:137`).
- **Moonpi:** deliberately keeps loops simple and does not present an equivalent verification subsystem in its core workflow (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:36`).

This repo is much stronger on **post-implementation quality control**.

## 6. Context strategy

- **This repo:** relies more on explicit reading, skills, and specialized prompts.
- **Moonpi:** automatically injects project docs into the prompt and tells the model to keep them current (`/tmp/pi-github-repos/galatolofederico/moonpi/src/context-files.ts:76`).

Moonpi is stronger on **automatic ambient project context**.

## Where this repo is stronger

### Reusable architecture

`_workflow-core` makes the local system feel like a platform for building workflows, not just a collection of features (`pi/agent/extensions/_workflow-core/README.md:5`).

### Capability breadth

The combination of `mcp-broker`, `web-access`, `subagents`, `task-list`, and workflow orchestration provides a much wider extension surface than Moonpi's single package (`pi/agent/extensions/mcp-broker/README.md:5`, `pi/agent/extensions/web-access/README.md:14`).

### Workflow sophistication

`autopilot` in particular is much more advanced than Moonpi's core loop, especially around verification and structured failure handling (`pi/agent/extensions/autopilot/README.md:208`).

### Testing maturity

The local repo currently has extensive extension tests, while Moonpi appears to ship without automated tests.

- Local extension test files found: **51**
- Moonpi test files found: **0**

That is the single biggest maturity gap I saw.

## Where Moonpi is stronger

### Cohesive UX

Moonpi feels like one product. The mode system, visible status, tool gating, and TODO flow all reinforce the same mental model (`/tmp/pi-github-repos/galatolofederico/moonpi/src/modes.ts:82`).

### Hard behavioral constraints

Its guards are simple but effective: stay inside the project and read the file before modifying it (`/tmp/pi-github-repos/galatolofederico/moonpi/src/guards.ts:57`).

### Lower-friction planning loop

For interactive work, its Plan/Act/Auto/Fast modes are probably easier to understand and use than a toolbox of independent extensions (`/tmp/pi-github-repos/galatolofederico/moonpi/README.md:69`).

### Automatic project-doc awareness

Moonpi's context-file injection is a clean solution for projects that already maintain `README.md`, `SPECS.md`, or `SPRINT.md` as living docs (`/tmp/pi-github-repos/galatolofederico/moonpi/src/context-files.ts:76`).

## Ideas worth borrowing

### From Moonpi into this repo

- An optional global **mode shell** for ad hoc use: something like Plan / Act / Fast on top of the existing toolbox
- **Hard read-before-write enforcement** as a complement to the written policy
- Opt-in **context file injection** for projects with stable design docs

### From this repo into Moonpi

- Stronger **automated tests**
- A more reusable internal core, similar to `_workflow-core`
- Optional **verification/review phases** for users who want stricter quality gates
- Modular external capability layers like `mcp-broker` and `web-access`

## Bottom line

These two codebases are not direct substitutes.

- **This repo** is better if the goal is to build, test, and compare advanced Pi agent harness patterns.
- **Moonpi** is better if the goal is to give Pi a clear, opinionated default operating model with visible modes and hard guardrails.

The strongest combined design would probably keep this repo's modular architecture, workflow rigor, and subagent tooling while borrowing Moonpi's guardrails and lightweight day-to-day UX.
