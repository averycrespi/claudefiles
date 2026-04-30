import type { TodoItem, TodoStatus } from "./state.ts";

export function glyphForStatus(status: TodoStatus): string {
  switch (status) {
    case "todo":
      return "[ ]";
    case "in_progress":
      return "[~]";
    case "done":
      return "[✓]";
    case "blocked":
      return "[!]";
  }
}

export function renderWidgetLines(items: TodoItem[]): string[] {
  return items.map((item) => {
    const suffix = item.notes ? ` · ${item.notes}` : "";
    return `${glyphForStatus(item.status)} ${item.text}${suffix}`;
  });
}
