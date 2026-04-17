import { readFile } from "node:fs/promises";
import { taskList } from "../../task-list/api.ts";
import { parseJsonReport } from "../lib/parse.ts";
import { ImplementReportSchema } from "../lib/schemas.ts";
import {
  dispatchWithOneRetry,
  type DispatchFn,
  type DispatchResult,
} from "../lib/dispatch.ts";

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
  dispatch: DispatchFn;
  /**
   * Resolves the current HEAD SHA. Called before and after each task
   * dispatch; a task is considered to have produced a commit iff HEAD
   * moves between the two calls. Injected so tests don't need a real
   * git repo.
   */
  getHead: () => Promise<string>;
  cwd: string;
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

    let dispatchResult: DispatchResult;
    let headBefore: string;
    try {
      headBefore = await args.getHead();
      dispatchResult = await dispatchWithOneRetry(
        args.dispatch,
        {
          prompt,
          tools: ["read", "edit", "write", "bash"],
          extensions: ["autoformat"],
          cwd: args.cwd,
          intent: `Implement: ${task.title}`,
        },
        args.signal,
      );
    } finally {
      clearInterval(heartbeat);
    }

    if (!dispatchResult.ok) {
      taskList.fail(
        task.id,
        `dispatch failed: ${dispatchResult.error ?? "unknown error"}`,
      );
      return { ok: false, haltedAtTaskId: task.id };
    }

    const parsed = parseJsonReport(
      dispatchResult.stdout,
      ImplementReportSchema,
    );
    if (!parsed.ok) {
      taskList.fail(task.id, `invalid subagent report: ${parsed.error}`);
      return { ok: false, haltedAtTaskId: task.id };
    }

    if (parsed.data.outcome === "failure") {
      taskList.fail(
        task.id,
        `subagent reported failure: ${parsed.data.summary}`,
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

    taskList.complete(task.id, parsed.data.summary);
  }

  return { ok: true };
}
