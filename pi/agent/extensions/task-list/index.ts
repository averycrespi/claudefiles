import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { taskList } from "./api.ts";
import { renderWidgetLines } from "./render.ts";
import { registerTools } from "./tools.ts";

const WIDGET_KEY = "task-list";

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

  // `setWidget` is a runtime method on pi but not exposed in the typed
  // ExtensionAPI interface — access it via cast, same pattern as run.ts.
  const piAny = pi as any;
  const setWidget = (content: string[] | undefined) => {
    if (typeof piAny.setWidget === "function") {
      piAny.setWidget(WIDGET_KEY, content, { placement: "belowEditor" });
    }
  };

  const unsubscribe = taskList.subscribe((state) => {
    const lines = renderWidgetLines(state);
    if (lines.length === 0) {
      setWidget(undefined);
    } else {
      setWidget(lines);
    }
  });

  pi.on("session_shutdown", () => {
    setWidget(undefined);
    taskList.clear();
    unsubscribe();
  });
}
