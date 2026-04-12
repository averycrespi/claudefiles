import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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

      // Phases (plan → implement → verify) wired in later tasks.
      // For now, surface a placeholder so the user knows preflight passed.
      ctx.ui.notify(
        `/autopilot: preflight ok (base ${pre.baseSha.slice(0, 7)}). Pipeline wiring lands in subsequent tasks.`,
        "info",
      );
    },
  });
}
