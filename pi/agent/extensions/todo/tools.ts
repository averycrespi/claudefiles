import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import {
  formatTodoList,
  isTodoStatus,
  type TodoStatus,
  type TodoStore,
} from "./state.ts";

const todoStatusSchema = StringEnum([
  "todo",
  "in_progress",
  "done",
  "blocked",
] as const);

const todoItemInputSchema = Type.Object({
  text: Type.String({ description: "Task text" }),
  status: Type.Optional(todoStatusSchema),
  notes: Type.Optional(Type.String({ description: "Optional task notes" })),
});

const todoParamsSchema = Type.Object({
  action: StringEnum([
    "list",
    "set",
    "add",
    "update",
    "remove",
    "clear",
  ] as const),
  items: Type.Optional(
    Type.Array(todoItemInputSchema, { description: "Items for set" }),
  ),
  id: Type.Optional(Type.Number({ description: "TODO id for update/remove" })),
  text: Type.Optional(Type.String({ description: "TODO text for add/update" })),
  status: Type.Optional(todoStatusSchema),
  notes: Type.Optional(
    Type.String({ description: "TODO notes for add/update" }),
  ),
});

type TodoParams = Static<typeof todoParamsSchema>;

function textResult(text: string, items: ReturnType<TodoStore["list"]>) {
  return {
    content: [{ type: "text" as const, text }],
    details: { items },
  };
}

function errorResult(message: string, store: TodoStore) {
  return textResult(`Error: ${message}`, store.list());
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStatus(value: unknown): TodoStatus | undefined {
  return isTodoStatus(value) ? value : undefined;
}

function validateSetItems(items: unknown):
  | {
      ok: true;
      items: Array<{ text: string; status?: TodoStatus; notes?: string }>;
    }
  | { ok: false; message: string } {
  if (!Array.isArray(items)) {
    return { ok: false, message: "items is required for action set." };
  }

  const normalized: Array<{
    text: string;
    status?: TodoStatus;
    notes?: string;
  }> = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      return { ok: false, message: "set items must be objects." };
    }

    const text = normalizeText((item as { text?: unknown }).text);
    if (!text) {
      return { ok: false, message: "set items must include non-empty text." };
    }

    const statusValue = (item as { status?: unknown }).status;
    if (statusValue !== undefined && !isTodoStatus(statusValue)) {
      return {
        ok: false,
        message: `invalid status \"${String(statusValue)}\".`,
      };
    }

    const notesValue = (item as { notes?: unknown }).notes;
    normalized.push({
      text,
      ...(statusValue !== undefined ? { status: statusValue } : {}),
      ...(typeof notesValue === "string" ? { notes: notesValue } : {}),
    });
  }

  return { ok: true, items: normalized };
}

export function registerTodoTool(pi: ExtensionAPI, store: TodoStore): void {
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Create, replace, update, remove, clear, or list the active TODO list.",
    promptSnippet: "Manage the current ordered TODO list",
    promptGuidelines: [
      "Use todo when you want to create or update a short working plan for the current session.",
      "After changing a task, rely on the returned list to see current ids and ordering.",
    ],
    parameters: todoParamsSchema,
    async execute(_toolCallId, params: TodoParams, _signal, _onUpdate, _ctx) {
      switch (params.action) {
        case "list":
          return textResult(formatTodoList(store.list()), store.list());

        case "set": {
          const validated = validateSetItems(params.items);
          if (!validated.ok) return errorResult(validated.message, store);
          const items = store.set(validated.items);
          return textResult(formatTodoList(items), items);
        }

        case "add": {
          const text = normalizeText(params.text);
          if (!text)
            return errorResult("text is required for action add.", store);
          if (params.status !== undefined && !isTodoStatus(params.status)) {
            return errorResult(
              `invalid status \"${String(params.status)}\".`,
              store,
            );
          }
          store.add(text, normalizeStatus(params.status), params.notes);
          const items = store.list();
          return textResult(formatTodoList(items), items);
        }

        case "update": {
          if (params.id === undefined) {
            return errorResult("id is required for action update.", store);
          }
          if (params.status !== undefined && !isTodoStatus(params.status)) {
            return errorResult(
              `invalid status \"${String(params.status)}\".`,
              store,
            );
          }
          const patch: { text?: string; status?: TodoStatus; notes?: string } =
            {};
          if (params.text !== undefined) {
            const text = normalizeText(params.text);
            if (!text)
              return errorResult(
                "text must be non-empty when provided for action update.",
                store,
              );
            patch.text = text;
          }
          if (params.status !== undefined) patch.status = params.status;
          if (params.notes !== undefined) patch.notes = params.notes;
          const updated = store.update(params.id, patch);
          if (!updated)
            return errorResult(`TODO #${params.id} not found.`, store);
          return textResult(formatTodoList(store.list()), store.list());
        }

        case "remove": {
          if (params.id === undefined) {
            return errorResult("id is required for action remove.", store);
          }
          if (!store.remove(params.id)) {
            return errorResult(`TODO #${params.id} not found.`, store);
          }
          return textResult(formatTodoList(store.list()), store.list());
        }

        case "clear":
          store.clear();
          return textResult(formatTodoList(store.list()), store.list());
      }
    },
  });
}
