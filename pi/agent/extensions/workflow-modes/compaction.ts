import type { TodoItem, TodoStatus, WorkflowMode } from "./types.ts";

export function buildWorkflowCompactionSummary(options: {
  mode: Exclude<WorkflowMode, "normal">;
  activePlanPath: string;
  planGoal?: string;
  todos: TodoItem[];
  recentOutcome?: string;
  nextAction?: string;
}): string {
  const lines = [
    "Workflow shell checkpoint",
    `Mode: ${options.mode}`,
    `Active plan: ${options.activePlanPath}`,
  ];

  if (options.planGoal) {
    lines.push(`Goal: ${options.planGoal}`);
  }

  if (options.todos.length > 0) {
    lines.push("TODOs:");
    for (const todo of options.todos) {
      lines.push(`- ${formatTodo(todo)}`);
    }
  }

  if (options.recentOutcome) {
    lines.push(`Recent outcome: ${options.recentOutcome}`);
  }

  if (options.nextAction) {
    lines.push(`Next action: ${options.nextAction}`);
  }

  return lines.join("\n");
}

export function extractTodoItemsFromBranch(
  branchEntries: unknown[],
): TodoItem[] {
  let latest: TodoItem[] = [];

  for (const entry of branchEntries) {
    if (!entry || typeof entry !== "object") continue;

    if ((entry as { type?: unknown }).type === "message") {
      const message = (entry as { message?: any }).message;
      if (message?.role === "toolResult" && message.toolName === "todo") {
        latest = normalizeTodoItems(message.details?.items);
      }
      continue;
    }

    if (
      (entry as { type?: unknown }).type === "custom" &&
      (entry as { customType?: unknown }).customType === "todo-state"
    ) {
      latest = normalizeTodoItems((entry as { data?: any }).data?.items);
    }
  }

  return latest;
}

export function deriveNextAction(options: {
  focus?: string;
  todos: TodoItem[];
  mode: WorkflowMode;
}): string | undefined {
  const activeTodo = options.todos.find(
    (item) => item.status === "in_progress" || item.status === "todo",
  );
  if (activeTodo) return activeTodo.text;
  if (options.focus?.trim()) return options.focus.trim();
  if (options.mode === "plan") return "Refine the workflow brief.";
  if (options.mode === "execute")
    return "Continue implementing the active workflow.";
  if (options.mode === "verify")
    return "Run or review the next verification step.";
  return undefined;
}

export function summarizeToolResultText(content: unknown): string | undefined {
  if (typeof content === "string") {
    return firstLine(content);
  }
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      return firstLine((block as { text: string }).text);
    }
  }
  return undefined;
}

function normalizeTodoItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return [];
  const items: TodoItem[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    const text = (item as { text?: unknown }).text;
    const status = (item as { status?: unknown }).status;
    const notes = (item as { notes?: unknown }).notes;
    if (
      !Number.isInteger(id) ||
      typeof text !== "string" ||
      !isTodoStatus(status)
    ) {
      continue;
    }
    items.push({
      id: id as number,
      text,
      status,
      ...(typeof notes === "string" && notes.length > 0 ? { notes } : {}),
    });
  }

  return items;
}

function isTodoStatus(value: unknown): value is TodoStatus {
  return (
    value === "todo" ||
    value === "in_progress" ||
    value === "done" ||
    value === "blocked"
  );
}

function formatTodo(item: TodoItem): string {
  const marker =
    item.status === "done"
      ? "[x]"
      : item.status === "in_progress"
        ? "[~]"
        : item.status === "blocked"
          ? "[!]"
          : "[ ]";
  return `${marker} ${item.text}`;
}

function firstLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}
