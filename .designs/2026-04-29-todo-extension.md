# Todo Extension Design

## Summary

Build a new standalone Pi extension at `pi/agent/extensions/todo/` that adapts Moonpi's lightweight TODO workflow into this repo's modular extension model.

The goal is to borrow Moonpi's low-friction task-steering UX without reintroducing the archived workflow stack (`task-list`, `_workflow-core`, `autopilot`, `autoralph`) or committing to a broader mode system.

## Goals

- Add a simple session-scoped todo surface for day-to-day agent steering.
- Keep the agent-facing API close to Moonpi's `todo` tool.
- Preserve this repo's extension modularity and test-first habits.
- Make Moonpi attribution explicit in the extension documentation.

## Non-goals

- Reintroducing the archived `task-list` state machine or reconcile API.
- Adding Plan / Act / Auto / Fast modes.
- Enforcing "must create todos before editing" behavior.
- Making todos file-backed in v1.
- Rebuilding `autopilot` around the new todo extension.

## Architecture

Create a new extension at `pi/agent/extensions/todo/` with this file layout:

- `index.ts` — extension entry point, session lifecycle hooks, widget mounting, slash commands
- `state.ts` — todo types, in-memory store, formatting helpers
- `tools.ts` — registers the `todo` agent tool
- `render.ts` — sticky widget rendering helpers
- `README.md` — public extension docs, usage, and Moonpi attribution

An `api.ts` file is intentionally out of scope for v1. The extension should own its own store and UI rather than advertising a reusable workflow primitive before the experiment proves worthwhile.

## Data model

Todo items use a deliberately small Moonpi-style shape:

```ts
interface TodoItem {
  id: number;
  text: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  notes?: string;
}
```

The store is an ordered in-memory array plus a `nextTodoId` counter.

Todos are session-scoped:

- They persist across turns within the current session.
- They reset on `todo clear`.
- They reset on `todo set` because that action replaces the list.
- They reset on `session_shutdown`.

They do not auto-clear when all items are `done`, and they do not reset on every new user prompt.

## Agent-facing tool

Register one agent-facing tool named `todo`.

Supported actions:

- `list`
- `set`
- `add`
- `update`
- `remove`
- `clear`

Parameter shape should stay minimal and action-oriented, following Moonpi's general pattern:

- `set` accepts a full ordered list of items (`text`, optional `status`, optional `notes`) and replaces the current list.
- `add` appends one new item.
- `update` patches one item by `id`.
- `remove` deletes one item by `id`.
- `clear` removes all items.
- `list` returns the current list unchanged.

The tool should always return the current formatted TODO list after a successful mutation so the agent can immediately see the new working plan.

## Behavior and lifecycle

This extension is intentionally passive in v1.

It provides a todo tool and a widget, but it does not:

- alter the active tool set,
- manage a mode system,
- gate tool usage,
- require todos before edits,
- auto-transition from planning to acting.

On `session_start`, the extension subscribes to store changes and renders the widget.

On every store mutation, the widget updates in place.

On `session_shutdown`, the extension:

- unsubscribes,
- clears the store,
- removes the widget.

Provide one slash command, `/todo-clear`, as an explicit user escape hatch.

## Widget design

The widget should be compact and always reflect the ordered todo list rather than grouping by status.

Placement: `aboveEditor`.

Visibility rules:

- When the list is empty, the widget is hidden.
- When at least one todo exists, the widget is shown.

Suggested row format:

- `[ ]` for `todo`
- `[~]` for `in_progress`
- `[✓]` for `done`
- `[!]` for `blocked`

Each row renders the item text and appends `notes` inline when present.

Unlike the archived `task-list` extension, v1 should not include:

- sectioned grouping,
- row-budget allocation,
- sticky completion semantics,
- summaries or failure reasons,
- reconcile-style reporting.

## Error handling

Validation should stay simple and local.

Typical tool errors:

- missing `text` for `add`,
- missing `id` for `update` or `remove`,
- unknown todo id,
- invalid status,
- malformed `set` items.

Errors should be returned as readable tool-result text so the agent can recover in the next tool call.

V1 should not implement multi-error reconciliation, atomic diffing, or advanced transition constraints.

## Testing

Add pure-logic tests that match the repo's existing extension style:

- store mutation tests in `state.test.ts`
- tool validation and result-text tests in `tools.test.ts`
- widget rendering tests in `render.test.ts`
- lifecycle tests in `index.test.ts` where practical

Before reporting implementation complete, run:

- `make typecheck`
- `make test`

## Inspiration / References

This extension should explicitly cite Moonpi in `pi/agent/extensions/todo/README.md`.

Primary inspiration:

- Moonpi repository: `galatolofederico/moonpi`
- Moonpi todo tool design: `src/tools.ts`
- Moonpi todo state and formatting: `src/state.ts`
- Moonpi todo widget and mode prompt integration: `src/modes.ts`
- Repo note comparing Moonpi with this config: `notes/moonpi-vs-local-pi-extensions.md`

The README should frame this extension as an adaptation of Moonpi's lightweight todo UX into a standalone Pi extension for this repo.

## Acceptance Criteria

AC-1: Standalone extension

- A new extension exists at `pi/agent/extensions/todo/` with its own `index.ts`, `state.ts`, `tools.ts`, `render.ts`, and `README.md`.
- Verifies via: file tree and successful extension typecheck.

AC-2: Single Moonpi-style `todo` tool

- The extension registers exactly one agent-facing `todo` tool supporting `list`, `set`, `add`, `update`, `remove`, and `clear` actions.
- Verifies via: tool schema/registration and tool tests covering each action.

AC-3: Moonpi todo data model

- Todo items use only `id`, `text`, `status`, and optional `notes`, with statuses limited to `todo`, `in_progress`, `done`, and `blocked`.
- Verifies via: store/type tests and invalid-status validation behavior.

AC-4: Session-scoped behavior

- Todos persist across turns within the current session and reset only on `todo clear`, `todo set`, or `session_shutdown`.
- Verifies via: state/tool tests for mutation behavior and session lifecycle hooks.

AC-5: Lightweight sticky widget

- When todos exist, a compact widget appears `aboveEditor`; when the list is empty, it is removed.
- Verifies via: render tests and extension lifecycle tests for mount/update/unmount behavior.

AC-6: Moonpi attribution in docs

- `pi/agent/extensions/todo/README.md` includes an explicit Inspiration/References section citing Moonpi and the specific repo/files adapted.
- Verifies via: README contents.
