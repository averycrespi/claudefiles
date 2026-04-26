import { readFile } from "node:fs/promises";
import { taskList } from "../../task-list/api.ts";
import { ImplementReportSchema, type ImplementReport } from "../lib/schemas.ts";
import type { Subagent } from "../../workflow-core/lib/subagent.ts";
import type { DispatchResult } from "../../workflow-core/lib/types.ts";

const PROMPT_PATH = new URL("../prompts/implement.md", import.meta.url);

/**
 * Cached prompt template. Loaded on first call, reused after.
 */
let cachedTemplate: string | null = null;
async function loadTemplate(): Promise<string> {
  if (cachedTemplate === null) {
    cachedTemplate = await readFile(PROMPT_PATH, "utf8");
  }
  return cachedTemplate;
}

export interface RunImplementArgs {
  archNotes: string;
  subagent: Subagent;
  /**
   * Resolves the current HEAD SHA. Called before and after each task
   * dispatch; a task is considered to have produced a commit iff HEAD
   * moves between the two calls. Injected so tests don't need a real
   * git repo.
   */
  getHead: () => Promise<string>;
  /** Run-level abort signal; prevents retry after /autopilot-cancel. */
  signal?: AbortSignal;
}

export interface RunImplementResult {
  ok: boolean;
  haltedAtTaskId?: number;
}

/**
 * Sequentially dispatches one subagent per pending task and verifies
 * each task landed a new commit. Stops at the first failure.
 */
export async function runImplement(
  args: RunImplementArgs,
): Promise<RunImplementResult> {
  const template = await loadTemplate();

  const allTasks = taskList.all();

  for (const task of allTasks) {
    if (task.status !== "pending") continue;

    taskList.start(task.id);
    taskList.setActivity(task.id, "dispatching subagent…");

    const prompt = template
      .replace("{ARCHITECTURE_NOTES}", args.archNotes)
      .replace("{TASK_TITLE}", task.title)
      .replace("{TASK_DESCRIPTION}", task.description);

    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      try {
        taskList.setActivity(task.id, `in progress (${elapsed}s elapsed)`);
      } catch {
        // Task may have transitioned out of in_progress; ignore.
      }
    }, 5000);

    let headBefore: string;
    let dispatchResult: DispatchResult<typeof ImplementReportSchema>;
    try {
      headBefore = await args.getHead();
      dispatchResult = await args.subagent.dispatch({
        intent: `Implement: ${task.title}`,
        prompt,
        schema: ImplementReportSchema,
        tools: ["read", "edit", "write", "bash"],
        extensions: ["autoformat"],
      });
    } finally {
      clearInterval(heartbeat);
    }

    if (!dispatchResult.ok) {
      const msg =
        dispatchResult.reason === "parse" || dispatchResult.reason === "schema"
          ? `invalid subagent report: ${dispatchResult.error}`
          : `dispatch failed: ${dispatchResult.error ?? "unknown error"}`;
      taskList.fail(task.id, msg);
      return { ok: false, haltedAtTaskId: task.id };
    }

    if (dispatchResult.data.outcome === "failure") {
      taskList.fail(
        task.id,
        `subagent reported failure: ${dispatchResult.data.summary}`,
      );
      return { ok: false, haltedAtTaskId: task.id };
    }

    // outcome === "success": verify a commit actually landed.
    const headAfter = await args.getHead();
    if (headAfter === headBefore) {
      taskList.fail(
        task.id,
        "subagent reported success but no new commit was made",
      );
      return { ok: false, haltedAtTaskId: task.id };
    }

    taskList.complete(task.id, dispatchResult.data.summary);
  }

  return { ok: true };
}
