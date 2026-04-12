import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { taskList } from "../task-list/api.ts";
import { dispatch } from "./lib/dispatch.ts";
import { runImplement } from "./phases/implement.ts";
import { runPlan } from "./phases/plan.ts";
import { preflight } from "./preflight.ts";

const execFileP = promisify(execFile);

/**
 * Resolves the current HEAD SHA of the repo at `cwd` via `git rev-parse`.
 * Used by the implement phase to verify each task produces a new commit.
 */
function makeGetHead(cwd: string): () => Promise<string> {
  return async () => {
    const { stdout } = await execFileP("git", ["rev-parse", "HEAD"], { cwd });
    return stdout.trim();
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("autopilot", {
    description:
      "Run the autonomous plan → implement → verify pipeline on a design document.",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();

      const designPath = args.trim();
      if (!designPath) {
        ctx.ui.notify(
          "/autopilot requires a design file path (usage: /autopilot <path>)",
          "error",
        );
        return;
      }

      const pre = await preflight({ designPath, cwd: process.cwd() });
      if (!pre.ok) {
        ctx.ui.notify(`/autopilot: ${pre.reason}`, "error");
        return;
      }

      ctx.ui.notify(
        `/autopilot: preflight ok (base ${pre.baseSha.slice(0, 7)}). Planning…`,
        "info",
      );

      const plan = await runPlan({
        designPath,
        dispatch,
        cwd: process.cwd(),
      });
      if (!plan.ok) {
        ctx.ui.notify(`/autopilot: plan failed — ${plan.error}`, "error");
        return;
      }

      taskList.clear();
      taskList.create(plan.data.tasks);

      ctx.ui.notify(
        `/autopilot: plan ok — ${plan.data.tasks.length} task(s) created. Implementing…`,
        "info",
      );

      const implementResult = await runImplement({
        archNotes: plan.data.architecture_notes,
        dispatch,
        getHead: makeGetHead(process.cwd()),
        cwd: process.cwd(),
      });

      if (!implementResult.ok) {
        ctx.ui.notify(
          `/autopilot: implement halted at task ${implementResult.haltedAtTaskId ?? "?"}`,
          "error",
        );
        return;
      }

      ctx.ui.notify(
        `/autopilot: implement ok — all ${plan.data.tasks.length} task(s) completed. Verify phase lands in a subsequent task.`,
        "info",
      );

      // Verify phase wired in a later task.
    },
  });
}
