# Workflow Shell Modes for Pi

## Summary

Build a lightweight Pi extension that adapts Moonpi-style mode UX into this repo's modular workflow stack. The extension should provide an explicit `Normal` mode alongside `Plan`, `Execute`, and `Verify`, short phase commands, mode-specific tool gating, a versioned plan artifact, and custom compaction so long-running work does not lose workflow state. Plan mode should subsume brainstorming: it should support collaborative clarification, approach comparison, and convergence into the durable workflow brief.

The extension is intentionally a workflow shell, not a full autonomous orchestrator. It should layer on top of the existing `todo`, `ask-user`, `subagents`, and other extensions instead of replacing them.

## Goals

- Give Pi a coherent day-to-day workflow shell with explicit phase boundaries.
- Align with the user's Claude Code / autopilot mental model without copying it exactly.
- Keep the UX lightweight and visible, more like Moonpi than archived `autopilot`.
- Preserve this repo's stronger workflow rigor around acceptance criteria, verification, and durable artifacts.
- Survive auto-compaction and long Execute sessions without losing track of the task.

## Non-Goals

- Do not reintroduce archived `autopilot` as a full autonomous runner.
- Do not create a second task engine; reuse the existing `todo` extension for tactical state.
- Do not make Verify silently edit code in v1.
- Do not require multiple first-class artifacts for a single workflow in v1.
- Do not keep a separate brainstorming skill or separate design artifact for routine workflow-shell usage.
- Do not auto-create PRs, branches, or remote state.

## Why this shape

Moonpi is strongest where it offers a cohesive shell: mode-specific tool gating, visible status, and low-friction task flow. This repo is strongest where it offers modular architecture, reusable extensions, richer verification, and durable workflow artifacts.

The recommended hybrid keeps:

- Moonpi's shell ideas: explicit modes, tool gating, compact status surfaces.
- This repo's harness ideas: versioned workflow artifacts, acceptance criteria as the contract, explicit verification, and custom compaction tied to durable state.

This follows the repo's agent-engineering principles:

- plan as intent, not diff
- deterministic boundaries between phases
- acceptance criteria as the load-bearing artifact
- durable notes on disk instead of relying on long chat history
- no open-ended verify → implement loop

## Mode model

The extension should expose four modes:

1. **Normal**
2. **Plan**
3. **Execute**
4. **Verify**

`Normal` means ordinary Pi behavior with no workflow shell active. `Complete` is not a mode. It is a terminal outcome or report state, not a persistent shell mode.

### Why not one mode per phase?

The earlier brainstorm/plan split is not useful enough to justify either an extra mode or a separate artifact in v1. Discovery, clarification, approach comparison, and brief authoring are all part of Plan mode. Plan mode should support conversational back-and-forth when the task is under-specified, then converge into the durable workflow brief once the user confirms the direction. Execute and Verify do have meaningfully different permissions and success criteria, so they deserve separate modes.

## Commands

The user-facing command surface should stay short:

- `/normal`
- `/plan [context]`
- `/execute [context]`
- `/verify [context]`

### Command semantics

#### `/normal`

`/normal` exits workflow-shell mode and returns the session to ordinary Pi behavior.

- Clear the active workflow mode for the current session.
- Hide the workflow widget.
- Restore the session's default tool access and default thinking behavior.
- Keep the persisted active plan path unchanged so the user can later resume with `/plan`, `/execute`, or `/verify`.

#### `/plan [context]`

`/plan` enters Plan mode and may optionally accept context after the command.

- **No arguments:** if a workflow is already active, resume it. Otherwise ask the user to create a new workflow or select an existing plan artifact.
- **Plan path or link argument:** open that existing plan artifact and enter Plan mode for it.
- **Free-text argument:** treat the text as planning context. The agent may create a new plan, resume a likely matching plan, or ask a focused clarifying question before deciding.
- When interpreting free-text context, prefer a short clarifying question over silently attaching the request to the wrong existing plan.
- `/plan` should mean "take me to planning," whether that means resuming a brief, clarifying an idea, or starting a new workflow.

#### `/execute [context]`

`/execute` enters Execute mode and may optionally accept context after the command.

- **No arguments:** if a workflow is already active, resume it in Execute mode. Otherwise ask the user to select an existing plan artifact or provide execution context.
- **Plan path or link argument:** open that existing plan artifact and enter Execute mode for it.
- **Free-text argument:** treat the text as execution context. The agent may resume a likely matching workflow, attach the request to a referenced plan, or ask a focused clarifying question before deciding.
- `/execute` should support direct entry into implementation work; it should not require that the current session already passed through Plan mode.

#### `/verify [context]`

`/verify` enters Verify mode and may optionally accept context after the command.

- **No arguments:** if a workflow is already active, resume it in Verify mode. Otherwise ask the user to select an existing plan artifact or provide verification context.
- **Plan path or link argument:** open that existing plan artifact and enter Verify mode for it.
- **Free-text argument:** treat the text as verification context. The agent may resume a likely matching workflow, attach the request to a referenced plan, or ask a focused clarifying question before deciding.
- `/verify` should support direct entry into verification work; it should not require that the current session already passed through Execute mode.

## Tool gating

Use fixed tool sets per mode. Change the active tool set only on explicit mode transitions.

### Normal mode behavior

Normal mode should leave Pi in its ordinary operating state:

- no workflow-specific tool gating
- no workflow-specific prompt contract
- no workflow widget
- no workflow-specific thinking override

## Thinking level policy

The workflow shell should also set a default thinking level per mode, but only on explicit mode transitions. Do not continuously reapply it every turn.

### Why tie thinking to modes?

Planning and verification benefit from more reasoning; execution-heavy work benefits from lower reasoning and faster action. This matches the repo's agent-engineering guidance to vary reasoning effort by phase rather than setting one global level.

### V1 defaults for the current GPT-5.4 setup

- **Normal:** no workflow-specific default
- **Plan:** `high`
- **Execute:** `low`
- **Verify:** `high`

These defaults are intentionally tuned for the current GPT-5.4 setup. Revisit them when upgrading models, especially if the default workhorse changes to GPT-5.5 or a Claude model with different reasoning behavior.

### Application rules

- Apply the mode's default thinking level when entering Plan, Execute, or Verify.
- Entering Normal mode should restore the session's default thinking behavior rather than applying a workflow-specific override.
- Do not change thinking level mid-turn.
- Do not keep reapplying the mode default on every agent start within the same mode.
- If the user manually changes thinking level during a mode, let that override stand until the next explicit mode transition.
- If the current model does not support the requested thinking level, rely on Pi's normal clamping behavior.

### Plan mode tools

- read-only file/navigation tools
- `todo`
- `ask_user`
- optional read-only `spawn_agents`

Plan mode should not expose general editing tools.

### Plan mode behavior

Plan mode should adapt to task clarity:

- If the task is already clear, draft or refine the workflow brief directly.
- If the task is ambiguous, begin with collaborative discovery before drafting the final brief.

During discovery, Plan mode should:

- ask one focused question at a time
- prefer multiple choice when helpful
- read relevant repo context before proposing a plan
- propose 2–3 approaches when the trade-offs matter
- recommend one approach with reasoning
- confirm the chosen direction with the user before solidifying it in the brief

Once the direction is clear, Plan mode should converge the discussion into the `.plans/...md` brief.

### Execute mode tools

- editing tools (`edit`, `write`, `bash`, `read`)
- `todo`

Execute mode may use tactical TODO decomposition, but the durable plan remains the source of truth.

### Verify mode tools

- `read`
- `bash` for deterministic checks
- optional read-only `spawn_agents` for review
- `todo` only if needed to represent remediation work after findings

Verify mode should stay read-mostly in v1. It should not silently fix code.

## Plan artifact

### Location

Write the durable workflow artifact to:

- `.plans/YYYY-MM-DD-<slug>.md`

This should be a first-class repo artifact, versionable by default.

### Why `.plans/`

The user wants these artifacts versionable, so a hidden runtime-only `.pi/workflows/` location is the wrong default. `.plans/` is a clearer fit than `.designs/` because the output is not only design; it is the executable workflow brief.

For workflow-shell usage, do not create a separate `.designs/...md` document. The `.plans/...md` brief is the single source of truth for clarified requirements, chosen approach, acceptance criteria, and ordered execution tasks.

### Lifecycle

- Plan mode creates or updates the `.plans/...md` brief.
- Execute mode reads it and may append limited workflow notes.
- Verify mode reads it and may append findings, known issues, or verification outcomes.
- The plan brief remains the canonical artifact for the workflow.

## Plan artifact contents

The plan artifact should be a single combined brief, not separate design and plan documents. For routine workflow-shell usage, this combined brief replaces any standalone brainstorming or design artifact.

Recommended structure:

```md
# Workflow Brief

## Goal

## Constraints

## Acceptance Criteria

## Chosen Approach

## Assumptions / Open Questions

## Ordered Tasks

## Verification Checklist

## Known Issues / Follow-ups
```

### Why one combined brief?

One file keeps the workflow low-friction while still preserving the durable artifacts recommended by modern harness design. It avoids drift between separate "design" and "plan" documents while still giving later phases a structured source of truth.

## Plan-mode output quality bar

Plan mode should produce:

- explicit acceptance criteria
- a chosen approach
- assumptions/open questions
- a short ordered list of high-level tasks
- a practical verification checklist

It should **not** produce a hyper-detailed procedural checklist.

### Task granularity

The ordered tasks in the plan brief should be high-level and durable, closer to intent than procedure.

Good examples:

1. Add workflow-shell state machine
2. Gate tools by mode
3. Persist and validate plan brief
4. Add verify-mode checks
5. Add custom compaction summaries

Bad examples are line-by-line or command-by-command instructions.

### Tactical TODO split

- **Plan artifact** = durable, high-level, versioned
- **TODO tool state** = tactical, short-lived, editable

Execute may decompose one high-level task into smaller TODOs for the current session. Those substeps should not bloat the versioned plan brief.

## TODO lifecycle across phases

The TODO list should be tactical workflow state, not the durable source of truth.

Recommended policy:

- the `.plans/...md` brief remains the durable workflow artifact
- entering a mode may replace, preserve, or clear TODOs depending on what best supports the current task
- TODOs should stay short-lived and should not be treated as authoritative workflow state

## Prompt and context strategy

The extension should append a minimal, stable mode contract in `before_agent_start`.

### Prompt role

The prompt should provide:

- current mode
- success criteria for that mode
- reminder of the active plan artifact path
- instructions to use the plan artifact and TODO state correctly
- the expected Plan-mode output: a single `.plans/...md` workflow brief
- Plan-mode guidance to clarify ambiguous requests, compare approaches when needed, and confirm the chosen direction before converging on the brief
- awareness that the workflow shell may set a mode-specific thinking default on phase transitions

### What not to inject every turn

Do **not** inject highly variable runtime state into the system prompt each turn, such as:

- the full evolving TODO list
- changing counters
- changing findings lists
- large inline status dumps

### Rationale

Changing tool sets, thinking config, and constantly changing prompt prefixes hurt prompt-cache reuse. The extension should preserve cache where possible by:

- changing tools only at mode boundaries
- changing thinking level only at mode boundaries
- keeping the per-mode prompt mostly static
- storing volatile state in artifacts and tools rather than re-inlining it into the system prompt

## Compaction strategy

### Default principle

Use durable workflow artifacts so the workflow can survive compaction without depending on raw conversation history.

Moonpi's sprint loop handles long-running work by writing state to files and compacting at phase boundaries. This design should go further by adding custom compaction behavior for all workflow modes.

### Custom compaction

Implement `session_before_compact` and provide a mode-aware workflow summary when compaction occurs while a workflow mode is active.

That summary should rebuild state from:

- current mode
- active plan artifact path
- plan contents
- tactical TODO state
- recent command/test outcomes when available
- file operations from Pi's compaction preparation data

### Mode-specific compaction summaries

#### Plan mode summary

Preserve:

- goal
- constraints
- AC status
- chosen approach
- remaining planning questions
- ordered tasks drafted so far

#### Execute mode summary

Most important for v1. Preserve:

- active plan file
- current high-level task being executed
- completed changes so far
- remaining work for the current task
- blockers
- last important command/test result
- next immediate action on resume

#### Verify mode summary

Preserve:

- checks already run
- pass/fail results
- findings gathered
- whether next step is pass, known issues, or return to Execute

### Execute-mode resumability note

To make compaction safer, the plan artifact may include a small resumability section or sibling note, for example:

```md
## Current Execution State

- Active task:
- Last completed substep:
- Remaining work:
- Blockers:
- Last verification command/result:
```

This lets the compaction hook rebuild a deterministic resume summary rather than trusting raw chat memory.

## UI visible to the user

The UI should stay ambient and lightweight.

### Sticky workflow widget

Render a small sticky widget above the editor, separate from the existing TODO widget. In v1 it should be a single line and only appear in Plan, Execute, or Verify.

Example in Plan mode:

```txt
workflow · plan · .plans/2026-04-30-auth-refactor.md · clarifying constraints
```

Example in Execute mode:

```txt
workflow · execute · .plans/2026-04-30-auth-refactor.md · wiring auth middleware
```

Example in Verify mode:

```txt
workflow · verify · .plans/2026-04-30-auth-refactor.md · tests passing, typecheck failing
```

### Widget responsibilities

- workflow widget = phase state and current focus
- TODO widget = tactical checklist

Do not duplicate the TODO list inside the workflow widget.

## Recovery and resume

Persist only the active plan path in v1.

On `session_start` and `session_tree`, recover workflow context from:

1. persisted active plan path
2. the referenced `.plans/...md` artifact
3. current TODO state

Do not persist the current mode or a richer workflow snapshot. New or restored sessions should start in Normal mode. Workflow mode should be re-entered explicitly via `/plan`, `/execute`, or `/verify`.

If the persisted active plan path is missing or invalid, fail soft:

- notify the user
- clear the invalid reference
- wait for the user to enter a mode command with new context

## V1 implementation layout

Create a new extension, for example:

- `pi/agent/extensions/workflow-shell/`

Suggested internal files:

- `index.ts` — commands, event hooks, mode transitions
- `state.ts` — persisted active plan path only
- `artifact.ts` — plan artifact create/load/validate helpers
- `modes.ts` — tool allowlists and transition helpers
- `compaction.ts` — custom compaction summary builder
- `render.ts` — workflow widget rendering

## Failure handling

Keep failure handling explicit and lightweight:

- if a mode command cannot resolve a plan artifact or enough context to proceed, fail with a short actionable error
- if the persisted active plan path is missing or invalid, clear it and ask the user for new context
- Verify findings should never silently mutate code in v1; they should become explicit state for a return to Execute

## Deferred work

Do not build these in v1 unless needed:

- automatic phase transitions
- verifier auto-fix loops
- sidecar machine-readable files like `ac.json`
- a revived autonomous `autopilot`-style runner
- extra commands beyond the short mode commands
- a second task engine

## Recommended v1 scope

Build one extension that does four things well:

1. mode state + short commands
2. mode-specific tool gating
3. versioned plan artifact management
4. custom compaction that preserves workflow context across workflow modes

This is intentionally a workflow shell, not an autonomous orchestrator.

## Acceptance Criteria

**AC-1: Shell commands exist and switch modes correctly**  
Given the extension is loaded, when the user runs `/normal`, `/plan`, `/execute`, or `/verify`, then the session enters that mode, updates workflow UI visibility appropriately, and applies that mode's tools and thinking behavior for the current session.  
**Verifies via:** command behavior in tests and visible widget updates.

**AC-2: Mode commands accept flexible context**  
Given the extension is loaded, when the user runs `/plan`, `/execute`, or `/verify` with no arguments, a plan path/link, or free text, then the extension resumes the active workflow, opens the referenced plan, or treats the text as mode-specific context according to each command contract.  
**Verifies via:** command parsing/dispatch tests and visible artifact selection in the workflow widget.

**AC-3: Plan mode manages the single versioned workflow brief**  
Given no active workflow exists, when the user enters `/plan`, then the extension creates or resumes a `.plans/YYYY-MM-DD-<slug>.md` brief, persists that active plan path, and uses it as the sole active workflow artifact for planning, execution, and verification handoff.  
**Verifies via:** file creation/load tests, persisted active-plan-path tests, and visible artifact path in the workflow widget.

**AC-4: Plan mode includes collaborative discovery guidance**  
Given the workflow enters Plan mode, when the extension prepares the mode-specific agent contract, then that contract instructs the agent to clarify ambiguous requests, ask focused questions, compare approaches when needed, and seek user confirmation before converging on the chosen approach in the workflow brief.  
**Verifies via:** tests over the Plan-mode prompt/contract builder.

**AC-5: Tool behavior changes only at mode boundaries**  
Given the session is in Normal, Plan, Execute, or Verify, when the mode changes, then workflow-specific tool behavior changes only on that explicit mode transition, with Normal restoring ordinary Pi behavior and workflow modes applying their fixed tool sets.  
**Verifies via:** tests over active tool behavior per mode.

**AC-6: Thinking behavior changes only at mode boundaries**  
Given the session enters Normal, Plan, Execute, or Verify, when the extension applies mode behavior for the current GPT-5.4 setup, then it uses no workflow-specific override in Normal and sets thinking to `high`, `low`, or `high` in Plan, Execute, or Verify respectively, without reapplying those defaults on every turn within the same mode.  
**Verifies via:** tests over mode-transition handlers and thinking-level updates.

**AC-7: Custom compaction preserves workflow context across workflow modes**  
Given Pi auto-compacts or the user triggers compaction while a workflow mode is active, when the session resumes, then the summary preserves current mode, active plan artifact, relevant TODO context, and next intended action.  
**Verifies via:** `session_before_compact` tests that inspect generated summary/details per mode.

**AC-8: TODO state remains tactical, not durable workflow truth**  
Given the user enters or resumes different modes during a workflow, when TODO state is updated for the current task, then the `.plans/...md` brief remains the durable source of truth and TODO state remains short-lived tactical state.  
**Verifies via:** transition tests over TODO lifecycle and unchanged plan artifact state.
