# todo

Session-scoped Pi extension that adds a lightweight `todo` tool plus a compact sticky widget above the editor.

## What it does

- registers one agent-facing `todo` tool with `list`, `set`, `add`, `update`, `remove`, and `clear`
- keeps TODOs in memory for the current session
- shows the ordered list in a compact widget when at least one item exists
- provides `/todo-clear` as a manual reset command

## Data model

```ts
interface TodoItem {
  id: number;
  text: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  notes?: string;
}
```

## Inspiration / References

This extension adapts Moonpi's lightweight TODO UX into this repo's standalone Pi extension model.

Primary reference:

- Moonpi repository: [galatolofederico/moonpi](https://github.com/galatolofederico/moonpi)

The goal here is narrower than Moonpi: keep the low-friction TODO surface without reintroducing Moonpi's broader mode system or this repo's archived workflow stack.
