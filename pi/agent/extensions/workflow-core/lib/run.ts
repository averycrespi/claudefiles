import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface WorkflowDefinition<Args, Pre = unknown> {
  name: string;
  description: string;
  parseArgs(
    raw: string,
  ): { ok: true; args: Args } | { ok: false; error: string };
  preflight?(
    cwd: string,
    args: Args,
    signal: AbortSignal,
  ): Promise<{ ok: true; data: Pre } | { ok: false; error: string }>;
  run(
    ctx: any /* RunContext — completed in later tasks */,
  ): Promise<string[] | null>;
  runSlug?(args: Args, preflight: Pre): string;
  retainRuns?: number;
  emitLogPath?: boolean;
}

export interface RegisterWorkflowOpts {
  // (test seams added in later tasks)
}

interface ActiveRun {
  controller: AbortController;
  startedAt: number;
}

export function registerWorkflow<Args, Pre>(
  pi: ExtensionAPI,
  def: WorkflowDefinition<Args, Pre>,
  _testOpts: RegisterWorkflowOpts = {},
): void {
  let active: ActiveRun | null = null;

  pi.registerCommand(`${def.name}-cancel`, {
    description: `Cancel the currently running /${def.name}-start.`,
    handler: async (_args, ctx) => {
      if (!active) {
        ctx.ui.notify(`/${def.name}-cancel: no run is active`, "info");
        return;
      }
      ctx.ui.notify(`/${def.name}-cancel: cancelling`, "warning");
      active.controller.abort();
    },
  });

  pi.registerCommand(`${def.name}-start`, {
    description: def.description,
    handler: async (args, ctx) => {
      await ctx.waitForIdle?.();
      if (active) {
        ctx.ui.notify(
          `/${def.name}-start: a run is already active — use /${def.name}-cancel to stop it first`,
          "error",
        );
        return;
      }
      const parsed = def.parseArgs(args);
      if (!parsed.ok) {
        ctx.ui.notify(`/${def.name}-start: ${parsed.error}`, "error");
        return;
      }
      const controller = new AbortController();
      active = { controller, startedAt: Date.now() };
      const pipeline = async () => {
        try {
          await def.run({ args: parsed.args, signal: controller.signal });
        } finally {
          active = null;
        }
      };
      // Detach: do NOT await
      void pipeline();
    },
  });
}
