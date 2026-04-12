import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { taskList } from "./api.ts";
import { renderTaskListMessage, summarizeCounts } from "./render.ts";
import type { TaskListState } from "./state.ts";

const CUSTOM_TYPE = "task-list";
const DEBOUNCE_MS = 100;

/**
 * Task-list extension: persists a task list for the life of a session
 * and renders it as an inline custom message. Only inline rendering is
 * provided for v1 — the footer `ctx.ui.setStatus` hook is deferred
 * because the renderer has no access to `ExtensionContext` (see
 * NOTES in the accompanying README).
 */
export default function (pi: ExtensionAPI) {
  pi.registerMessageRenderer<TaskListState>(
    CUSTOM_TYPE,
    (message, _options, theme) => {
      const state = message.details;
      if (!state) return undefined;
      const rows =
        typeof process.stdout.rows === "number" ? process.stdout.rows : 40;
      return renderTaskListMessage(state, { rows }, theme);
    },
  );

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let latest: TaskListState | null = null;

  const flush = () => {
    debounceTimer = null;
    if (!latest) return;
    const snapshot = latest;
    latest = null;
    pi.sendMessage<TaskListState>({
      customType: CUSTOM_TYPE,
      content: [{ type: "text", text: summarizeCounts(snapshot.tasks) }],
      display: true,
      details: snapshot,
    });
  };

  const unsubscribe = taskList.subscribe((state) => {
    // Snapshot the state so later mutations don't leak into the
    // pending message payload.
    latest = { tasks: [...state.tasks], createdAt: state.createdAt };
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);
  });

  pi.on("session_shutdown", () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    unsubscribe();
    if (taskList.all().length > 0) {
      taskList.clear();
    }
  });
}
