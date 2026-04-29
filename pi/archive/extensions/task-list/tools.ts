/**
 * Agent tools for the task-list extension:
 *   - task_list_set: atomic bulk-replace of the task list via reconcile()
 *   - task_list_get: read the current task list
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { taskList } from "./api.ts";
import type { Task } from "./state.ts";

// ── Result-text helpers ───────────────────────────────────────────────

function statusCounts(tasks: Task[]): string {
  let done = 0;
  let failed = 0;
  let active = 0;
  let pending = 0;
  for (const t of tasks) {
    if (t.status === "completed") done++;
    else if (t.status === "failed") failed++;
    else if (t.status === "in_progress") active++;
    else if (t.status === "pending") pending++;
  }
  return `${done} done, ${failed} failed, ${active} in progress, ${pending} pending`;
}

export function formatList(tasks: Task[]): string {
  const header =
    tasks.length === 0
      ? "0 tasks"
      : `${tasks.length} task${tasks.length === 1 ? "" : "s"} (${statusCounts(tasks)})`;

  if (tasks.length === 0) return header;

  const rows = tasks.map((t) => {
    let row = `${t.id}. ${t.title} — ${t.status}`;
    if (t.status === "completed" && t.summary) {
      row += ` (summary: "${t.summary}")`;
    } else if (t.status === "failed" && t.failureReason) {
      row += ` (reason: "${t.failureReason}")`;
    }
    return row;
  });

  return [header, "", ...rows].join("\n");
}

export function formatErrors(errors: string[], current: Task[]): string {
  const bullets = errors.map((e) => `- ${e}`).join("\n");
  const currentList = formatList(current);
  return [
    "task_list_set rejected — fix all of these and retry:",
    "",
    bullets,
    "",
    "Current list (unchanged):",
    currentList,
  ].join("\n");
}

// ── Schemas ───────────────────────────────────────────────────────────

const TASK_ITEM = Type.Object({
  id: Type.Optional(
    Type.Number({
      description:
        "Id of an existing task to update. Omit for new tasks — a new id will be assigned.",
    }),
  ),
  title: Type.String({
    description:
      "Required. When `id` is set, the stored title is authoritative and this field is informational (titles are immutable after creation). Otherwise this is the new task's title (human-readable, concise).",
  }),
  status: Type.Optional(
    Type.Union(
      [
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("completed"),
        Type.Literal("failed"),
      ],
      {
        description:
          'Task status. Defaults to "pending" for new tasks. Transitions must follow the state machine: pending→in_progress, in_progress→completed|failed, failed→pending|in_progress.',
      },
    ),
  ),
  summary: Type.Optional(
    Type.String({
      description:
        'Required when status is "completed". Brief outcome summary.',
    }),
  ),
  failure_reason: Type.Optional(
    Type.String({
      description:
        'Required when status is "failed". Concise reason the task failed.',
    }),
  ),
});

const SET_PARAMS = Type.Object({
  tasks: Type.Array(TASK_ITEM, {
    description:
      "The complete desired task list. Tasks in the current list that are omitted are dropped if terminal (completed/failed) or cause a rejection if live (pending/in_progress).",
  }),
});

const GET_PARAMS = Type.Object({});

// ── Tool registration ─────────────────────────────────────────────────

export function registerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "task_list_set",
    label: "Task List Set",
    description:
      "Atomically replace the task list. Pass the complete desired list — the system reconciles additions, updates, and removals in one step. Use this to create tasks, update statuses, or mark work done. Omitting a live (pending/in_progress) task rejects the whole call; omitting a terminal (completed/failed) task silently drops it.",
    parameters: SET_PARAMS,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const payload = params.tasks.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        summary: item.summary,
        failureReason: item.failure_reason,
      }));

      const result = taskList.reconcile(payload);

      if (result.ok) {
        return {
          content: [{ type: "text" as const, text: formatList(result.tasks) }],
          details: { taskCount: result.tasks.length },
        };
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: formatErrors(result.errors, taskList.all()),
            },
          ],
          details: { rejected: true, errorCount: result.errors.length },
        };
      }
    },
  });

  pi.registerTool({
    name: "task_list_get",
    label: "Task List Get",
    description:
      "Read the current task list. Use before task_list_set to see existing task ids and statuses. Returns the same format as task_list_set success.",
    parameters: GET_PARAMS,
    async execute(_id, _params, _signal, _onUpdate, _ctx) {
      const tasks = taskList.all();
      return {
        content: [{ type: "text" as const, text: formatList(tasks) }],
        details: { taskCount: tasks.length },
      };
    },
  });
}
