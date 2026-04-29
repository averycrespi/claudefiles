import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { taskList } from "./api.ts";
import { renderStyledWidgetLines, renderWidgetLines } from "./render.ts";
import type { WidgetTheme } from "./render.ts";
import type { TaskListState } from "./state.ts";
import { registerTools } from "./tools.ts";

const WIDGET_KEY = "task-list";

function renderWidget(ctx: ExtensionContext, state: TaskListState) {
  if (!ctx.hasUI) return;
  const theme = (ctx.ui as { theme?: WidgetTheme }).theme;
  const lines = theme
    ? renderStyledWidgetLines(state, theme)
    : renderWidgetLines(state);
  ctx.ui.setWidget(WIDGET_KEY, lines.length === 0 ? undefined : lines, {
    placement: "belowEditor",
  });
}

/**
 * Task-list extension: persists a task list for the life of a session
 * and renders it as a sticky widget below the editor.
 */
export default function (pi: ExtensionAPI) {
  registerTools(pi);

  pi.registerCommand("task-list-clear", {
    description:
      "Drop all tasks from the task list immediately, without confirmation.",
    handler: async (_args, ctx) => {
      taskList.clear();
      ctx.ui.notify("/task-list-clear: task list cleared", "info");
    },
  });

  let unsubscribe: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    unsubscribe?.();
    unsubscribe = taskList.subscribe((state) => {
      renderWidget(ctx, state as TaskListState);
    });
    renderWidget(ctx, { tasks: [...taskList.all()], createdAt: Date.now() });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    unsubscribe?.();
    unsubscribe = undefined;
    if (ctx.hasUI) {
      ctx.ui.setWidget(WIDGET_KEY, undefined, { placement: "belowEditor" });
    }
    taskList.clear();
  });
}
