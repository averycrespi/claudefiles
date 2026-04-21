import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("autoralph-cancel", {
    description: "Cancel the currently running /autoralph pipeline.",
    handler: async (_args, ctx) => {
      ctx.ui.notify("/autoralph-cancel: not yet implemented", "info");
    },
  });

  pi.registerCommand("autoralph", {
    description:
      "Run the autonomous Ralph-style iteration loop on a design document.",
    handler: async (_args, ctx) => {
      ctx.ui.notify("/autoralph: not yet implemented", "info");
    },
  });
}
