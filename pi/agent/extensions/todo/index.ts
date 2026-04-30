import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createTodoWidget } from "./render.ts";
import { createTodoStore, type TodoItem } from "./state.ts";
import { registerTodoTool } from "./tools.ts";

const WIDGET_KEY = "todo";

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

export default function (pi: ExtensionAPI) {
  const store = createTodoStore();
  registerTodoTool(pi, store);

  pi.registerCommand("todo-clear", {
    description: "Drop all TODO items from the current session.",
    handler: async (_args, ctx) => {
      store.clear();
      ctx.ui.notify("/todo-clear: cleared all TODO items", "info");
    },
  });

  let unsubscribe: (() => void) | undefined;

  pi.on("session_start", async (_event, ctx) => {
    unsubscribe?.();
    unsubscribe = store.subscribe((state) => {
      renderTodoWidget(pi, ctx, state.items);
    });
    renderTodoWidget(pi, ctx, store.list());
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    unsubscribe?.();
    unsubscribe = undefined;
    store.clear();
    setTodoWidget(pi, ctx, undefined);
  });
}
