import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createTodoWidget } from "./render.ts";
import {
  createTodoStore,
  isTodoStatus,
  type TodoItem,
  type TodoState,
} from "./state.ts";
import { registerTodoTool } from "./tools.ts";

const WIDGET_KEY = "todo";
const STATE_ENTRY_TYPE = "todo-state";

function setTodoWidget(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  content: string[] | ReturnType<typeof createTodoWidget> | undefined,
): void {
  const piAny = pi as any;
  if (piAny.hasUI && typeof piAny.setWidget === "function") {
    piAny.setWidget(WIDGET_KEY, content);
    return;
  }
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(WIDGET_KEY, content as any, { placement: "aboveEditor" });
}

function renderTodoWidget(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  items: TodoItem[],
) {
  setTodoWidget(
    pi,
    ctx,
    items.length > 0 ? createTodoWidget(items) : undefined,
  );
}

function parsePersistedState(value: unknown): TodoState | undefined {
  if (!value || typeof value !== "object") return undefined;

  const itemsValue = (value as { items?: unknown }).items;
  if (!Array.isArray(itemsValue)) return undefined;

  const items: TodoItem[] = [];
  let maxId = 0;
  for (const item of itemsValue) {
    if (!item || typeof item !== "object") return undefined;

    const id = (item as { id?: unknown }).id;
    const text = (item as { text?: unknown }).text;
    const status = (item as { status?: unknown }).status;
    const notes = (item as { notes?: unknown }).notes;
    if (
      !Number.isInteger(id) ||
      typeof text !== "string" ||
      !isTodoStatus(status)
    ) {
      return undefined;
    }

    const todoId = id as number;
    items.push({
      id: todoId,
      text,
      status,
      ...(typeof notes === "string" && notes.length > 0 ? { notes } : {}),
    });
    maxId = Math.max(maxId, todoId);
  }

  const nextTodoIdValue = (value as { nextTodoId?: unknown }).nextTodoId;
  const nextTodoId = Number.isInteger(nextTodoIdValue)
    ? (nextTodoIdValue as number)
    : maxId + 1;

  return {
    items,
    nextTodoId: Math.max(nextTodoId, maxId + 1, 1),
  };
}

function restoreStore(
  store: ReturnType<typeof createTodoStore>,
  ctx: ExtensionContext,
) {
  let restored: TodoState | undefined;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message") {
      const message = entry.message;
      if (message.role === "toolResult" && message.toolName === "todo") {
        restored = parsePersistedState(message.details) ?? restored;
      }
      continue;
    }

    if (entry.type === "custom" && entry.customType === STATE_ENTRY_TYPE) {
      restored = parsePersistedState(entry.data) ?? restored;
    }
  }

  if (restored) {
    store.replaceState(restored);
    return;
  }

  store.clear();
}

export default function (pi: ExtensionAPI) {
  const store = createTodoStore();
  registerTodoTool(pi, store);

  pi.registerCommand("todo-clear", {
    description: "Drop all TODO items from the current session.",
    handler: async (_args, ctx) => {
      store.clear();
      pi.appendEntry(STATE_ENTRY_TYPE, store.getState());
      ctx.ui.notify("/todo-clear: cleared all TODO items", "info");
    },
  });

  let unsubscribe: (() => void) | undefined;

  pi.on("session_start", async (_event, ctx) => {
    unsubscribe?.();
    restoreStore(store, ctx);
    unsubscribe = store.subscribe((state) => {
      renderTodoWidget(pi, ctx, state.items);
    });
    renderTodoWidget(pi, ctx, store.list());
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreStore(store, ctx);
    renderTodoWidget(pi, ctx, store.list());
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    unsubscribe?.();
    unsubscribe = undefined;
    store.clear();
    setTodoWidget(pi, ctx, undefined);
  });
}
