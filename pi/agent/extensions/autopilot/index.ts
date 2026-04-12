import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { taskList } from "../task-list/api.ts";
import { dispatch } from "./lib/dispatch.ts";
import { runPlan } from "./phases/plan.ts";
import { preflight } from "./preflight.ts";

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
        `/autopilot: plan ok — ${plan.data.tasks.length} task(s) created. Implement/verify phases land in subsequent tasks.`,
        "info",
      );

      // Implement and verify phases wired in later tasks.
    },
  });
}
