import { truncateToWidth } from "@mariozechner/pi-tui";
import type { TodoItem, TodoStatus } from "./state.ts";

const WIDGET_SEPARATOR = "─";

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

export function renderWidgetLines(items: TodoItem[], width: number): string[] {
  if (items.length === 0) return [];

  const safeWidth = Math.max(0, width);
  return [
    WIDGET_SEPARATOR.repeat(safeWidth),
    ...items.map((item) => {
      const suffix = item.notes ? ` · ${item.notes}` : "";
      return truncateToWidth(
        `${glyphForStatus(item.status)} ${item.text}${suffix}`,
        safeWidth,
      );
    }),
  ];
}

export function createTodoWidget(items: TodoItem[]) {
  return () => ({
    render(width: number) {
      return renderWidgetLines(items, width);
    },
    invalidate() {},
  });
}
