# Workflow Shell Modes for Pi

## Summary

Build a lightweight Pi extension that adapts Moonpi-style mode UX into this repo's modular workflow stack. The extension should provide explicit `Plan`, `Execute`, and `Verify` modes, short phase commands, Moonpi-style tool gating and guardrails, a versioned plan artifact, and custom compaction so long-running work does not lose workflow state. Plan mode should subsume brainstorming: it should support collaborative clarification, approach comparison, and convergence into the durable workflow brief.

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

Moonpi is strongest where it offers a cohesive shell: mode-specific tool gating, visible status, read-before-write enforcement, and low-friction task flow. This repo is strongest where it offers modular architecture, reusable extensions, richer verification, and durable workflow artifacts.

The recommended hybrid keeps:

- Moonpi's shell ideas: explicit modes, tool gating, cwd-only and read-before-write guards, compact status surfaces.
- This repo's harness ideas: versioned workflow artifacts, acceptance criteria as the contract, explicit verification, and custom compaction tied to durable state.

This follows the repo's agent-engineering principles:

- plan as intent, not diff
- deterministic boundaries between phases
- acceptance criteria as the load-bearing artifact
- durable notes on disk instead of relying on long chat history
- no open-ended verify → implement loop

## Mode model

The extension should expose three modes:

1. **Plan**
2. **Execute**
3. **Verify**

`Complete` is not a mode. It is a terminal report/reset outcome.

### Why not one mode per phase?

The earlier brainstorm/plan split is not useful enough to justify either an extra mode or a separate artifact in v1. Discovery, clarification, approach comparison, and brief authoring are all part of Plan mode. Plan mode should support conversational back-and-forth when the task is under-specified, then converge into the durable workflow brief once the user confirms the direction. Execute and Verify do have meaningfully different permissions and success criteria, so they deserve separate modes.

## Commands

The user-facing command surface should stay short:

- `/plan [context]`
- `/execute`
- `/verify`
- `/next`
- `/workflow-status`
- `/workflow-reset`

### Command semantics

#### `/plan [context]`

`/plan` enters Plan mode and may optionally accept context after the command.

- **No arguments:** if a workflow is already active, resume it. Otherwise ask the user to create a new workflow or select an existing plan artifact.
- **Plan path or link argument:** open that existing plan artifact and enter Plan mode for it.
- **Free-text argument:** treat the text as planning context. The agent may create a new plan, resume a likely matching plan, or ask a focused clarifying question before deciding.
- When interpreting free-text context, prefer a short clarifying question over silently attaching the request to the wrong existing plan.
- `/plan` should mean "take me to planning," whether that means resuming a brief, clarifying an idea, or starting a new workflow.

#### `/execute`

- Enter Execute mode for the active workflow.
- Fail with a short actionable error if no active workflow exists.

#### `/verify`

- Enter Verify mode for the active workflow.
- Fail with a short actionable error if no active workflow exists.

#### `/next`

Advance only if preconditions pass:

- Plan → Execute requires a valid plan artifact with acceptance criteria and ordered high-level tasks.
- Execute → Verify requires an active plan and some execution progress.
- Verify does not auto-advance into a separate Complete mode; it ends in pass, known issues, or explicit return to Execute.

#### `/workflow-status`

Show:

- current mode
- active plan path
- current high-level task or focus
- TODO summary
- verify summary/findings state

#### `/workflow-reset`

- Clear workflow session state.
- Clear tactical TODO state.
- Keep the plan artifact on disk.

## Tool gating

Use fixed tool sets per mode. Change the active tool set only on explicit mode transitions.

## Thinking level policy

The workflow shell should also set a default thinking level per mode, but only on explicit mode transitions. Do not continuously reapply it every turn.

### Why tie thinking to modes?

Planning and verification benefit from more reasoning; execution-heavy work benefits from lower reasoning and faster action. This matches the repo's agent-engineering guidance to vary reasoning effort by phase rather than setting one global level.

### V1 defaults for the current GPT-5.4 setup

- **Plan:** `high`
- **Execute:** `low`
- **Verify:** `high`

These defaults are intentionally tuned for the current GPT-5.4 setup. Revisit them when upgrading models, especially if the default workhorse changes to GPT-5.5 or a Claude model with different reasoning behavior.

### Application rules

- Apply the mode's default thinking level when entering Plan, Execute, or Verify.
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

## Guardrails

Bring over Moonpi's practical runtime guardrails:

- **cwd-only access** for read/write/edit-style file tools
- **read-before-write** enforcement for modifying existing files

These should be implemented as tool-call guards, not just prompt guidance.

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

- **Plan → Execute:** replace the TODO list with execution-focused tasks
- **Execute → Verify:** keep the current TODO state visible, but it no longer defines workflow truth
- **Verify → Execute:** replace TODOs with focused remediation items derived from findings
- **Verify → Complete / reset:** clear TODOs

This matches Moonpi's general pattern of clearing tactical TODO state at fresh workflow boundaries.

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

Moonpi's sprint loop handles long-running work by writing state to files and compacting at phase boundaries. This design should go further by adding custom compaction behavior for all modes.

### Custom compaction

Implement `session_before_compact` and always provide a mode-aware workflow summary when compaction occurs.

That summary should rebuild state from:

- current mode
- active plan artifact path
- plan contents
- current high-level task/focus
- tactical TODO state
- last verify state/findings
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

## Explicit phase compaction

In addition to custom auto-compaction, the extension may trigger explicit compaction at selected phase boundaries when useful.

Recommended default:

- **Plan → Execute:** compact only when Plan was long or context usage is high
- **Execute → Verify:** usually compact, because Verify should operate from artifacts and current repo state
- **Verify → Execute:** compact after findings have been persisted into artifact/TODO state

The rule is: compact when the next mode can run from durable artifacts rather than needing long chat memory.

## UI visible to the user

The UI should stay ambient and lightweight.

### Footer status

Show a short status line, for example:

- `workflow plan · auth-refactor · AC ready`
- `workflow execute · auth-refactor · 1 in progress, 2 pending`
- `workflow verify · auth-refactor · tests failing`

### Sticky workflow widget

Render a small sticky widget above the editor, separate from the existing TODO widget.

Example in Plan mode:

```txt
workflow · plan › execute › verify
plan: .plans/2026-04-30-auth-refactor.md
focus: Clarify constraints and confirm approach
next: /next
```

Example in Execute mode:

```txt
workflow · plan › execute › verify
plan: .plans/2026-04-30-auth-refactor.md
task: Wire auth middleware into request pipeline
verify: not run
```

Example in Verify mode:

```txt
workflow · plan › execute › verify
plan: .plans/2026-04-30-auth-refactor.md
checks: tests passing · typecheck failing
findings: 2 important
```

### Widget responsibilities

- workflow widget = phase state
- TODO widget = tactical checklist

Do not duplicate the TODO list inside the workflow widget.

## Recovery and resume

On `session_start` and `session_tree`, reconstruct workflow state from:

1. persisted workflow session snapshot
2. active `.plans/...md` artifact
3. current TODO state

If state is inconsistent, prefer the plan artifact and fail soft:

- notify the user
- reset back to Plan mode instead of guessing

## V1 implementation layout

Create a new extension, for example:

- `pi/agent/extensions/workflow-shell/`

Suggested internal files:

- `index.ts` — commands, event hooks, mode transitions
- `state.ts` — persisted workflow state
- `artifact.ts` — plan artifact create/load/validate helpers
- `modes.ts` — tool allowlists and transition helpers
- `guards.ts` — cwd-only and read-before-write enforcement
- `compaction.ts` — custom compaction summary builder
- `render.ts` — workflow widget rendering

## Failure handling

Keep failure handling explicit and lightweight:

- `/execute` or `/verify` without an active plan should fail with a short actionable error
- `/next` should say exactly what requirement is missing when advancement is blocked
- if persisted state and artifact disagree, prefer artifact state and return to Plan mode
- Verify findings should never silently mutate code in v1; they should become explicit state for a return to Execute

## Deferred work

Do not build these in v1 unless needed:

- automatic phase transitions
- verifier auto-fix loops
- sidecar machine-readable files like `ac.json`
- a revived autonomous `autopilot`-style runner
- extra commands beyond the short mode commands plus status/reset
- a second task engine

## Recommended v1 scope

Build one extension that does four things well:

1. mode state + short commands
2. mode-specific tool gating + Moonpi-style guardrails
3. versioned plan artifact management
4. custom compaction that preserves workflow state across all modes

This is intentionally a workflow shell, not an autonomous orchestrator.

## Acceptance Criteria

**AC-1: Phase shell commands exist and switch modes correctly**  
Given the extension is loaded, when the user runs `/plan`, `/execute`, or `/verify`, then the workflow enters that mode, updates the visible workflow status/widget, and persists the active mode across session reload/tree restore.  
**Verifies via:** command behavior in tests; restored state visible after `session_start` / `session_tree`.

**AC-2: `/plan` accepts flexible planning context**  
Given the extension is loaded, when the user runs `/plan` with no arguments, a plan path/link, or free text, then the extension resumes the active workflow, opens the referenced plan, or treats the text as planning context according to the command contract.  
**Verifies via:** command parsing/dispatch tests and visible artifact selection in `/workflow-status`.

**AC-3: Plan mode manages the single versioned workflow brief**  
Given no active workflow exists, when the user enters `/plan`, then the extension creates or resumes a `.plans/YYYY-MM-DD-<slug>.md` brief and uses it as the sole active workflow artifact for planning and execution handoff.  
**Verifies via:** file creation/load tests and visible artifact path in `/workflow-status`.

**AC-4: Plan mode includes collaborative discovery guidance**  
Given the workflow enters Plan mode, when the extension prepares the mode-specific agent contract, then that contract instructs the agent to clarify ambiguous requests, ask focused questions, compare approaches when needed, and seek user confirmation before converging on the chosen approach in the workflow brief.  
**Verifies via:** tests over the Plan-mode prompt/contract builder.

**AC-5: Plan artifact requires acceptance criteria and high-level tasks before advancing**  
Given the user is in Plan mode, when `/next` is invoked without an `Acceptance Criteria` section or without ordered high-level tasks, then the extension blocks advancement to Execute and reports the missing requirement.  
**Verifies via:** artifact validation tests and command error output.

**AC-6: Tool gating changes only at mode boundaries**  
Given a workflow is active, when the mode is Plan, Execute, or Verify, then each mode exposes its fixed tool set and those tool sets change only on explicit mode transitions.  
**Verifies via:** tests over active tool lists per mode.

**AC-7: Thinking defaults change only at mode boundaries**  
Given the workflow enters Plan, Execute, or Verify, when the extension applies mode defaults for the current GPT-5.4 setup, then it sets thinking to `high`, `low`, or `high` respectively, and does not keep reapplying those defaults on every turn within the same mode.  
**Verifies via:** tests over mode-transition handlers and thinking-level updates.

**AC-8: Moonpi-style guardrails are enforced in writable modes**  
Given the extension is active, when the agent tries to read/write outside cwd or edit/write an existing file it has not read first, then the tool call is blocked with a clear reason.  
**Verifies via:** guard tests for cwd-only and read-before-write enforcement.

**AC-9: Custom compaction preserves workflow state across all modes**  
Given Pi auto-compacts or the user triggers compaction, when the session resumes, then the summary preserves current mode, active plan artifact, current task/focus, and next intended action.  
**Verifies via:** `session_before_compact` tests that inspect generated summary/details per mode.

**AC-10: TODO state remains tactical, not durable workflow truth**  
Given a workflow transitions Plan→Execute, Verify→Execute, or Verify→Complete, then TODO state is replaced or cleared according to phase policy while the `.plans/...md` brief remains the durable source of truth.  
**Verifies via:** transition tests over TODO lifecycle and unchanged plan artifact state.
