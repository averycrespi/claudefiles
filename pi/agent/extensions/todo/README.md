# todo

Session-scoped Pi extension that adds a lightweight `todo` tool plus a compact sticky widget above the editor.

## What it does

- registers one agent-facing `todo` tool with `list`, `set`, `add`, `update`, `remove`, and `clear`
- persists TODO state in the Pi session so reload, resume, and branch navigation restore the current list
- provides `/todo-clear` as a manual reset command, and persists that clear across reloads too
- shows the ordered list in a compact widget when at least one item exists
- renders status-specific glyphs for `todo`, `in_progress`, `done`, and `blocked`
- caps the widget to the first five items and shows a `+N more` overflow line when needed

## Data model

```ts
interface TodoItem {
  id: number;
  text: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  notes?: string;
}

interface TodoState {
  items: TodoItem[];
  nextTodoId: number;
}
```

IDs stay stable once assigned. If an item is removed, later items keep their existing IDs, and reload restores the next ID from persisted state instead of renumbering.

## Persistence model

- Tool-driven mutations persist snapshots in `toolResult.details` using the `{ items, nextTodoId }` state shape.
- `/todo-clear` persists the same snapshot shape through a custom session entry because commands do not emit `toolResult` messages.
- On `session_start` and `session_tree`, the extension scans the current branch and restores the latest valid snapshot.

This keeps normal tool usage aligned with Pi's recommended stateful-tool pattern while still making manual clears survive reloads.

## Inspiration / References

This extension adapts Moonpi's lightweight TODO UX into this repo's standalone Pi extension model.

Primary reference:

- Moonpi repository: [galatolofederico/moonpi](https://github.com/galatolofederico/moonpi)

The goal here is narrower than Moonpi: keep the low-friction TODO surface without reintroducing Moonpi's broader mode system or this repo's archived workflow stack.
