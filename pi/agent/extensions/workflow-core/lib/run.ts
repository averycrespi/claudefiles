import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SpawnInvocation, SpawnOutcome } from "../../subagents/api.ts";
import { createSubagent } from "./subagent.ts";
import { createWidget, type WidgetUi } from "./widget.ts";

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
  spawn?: (inv: SpawnInvocation) => Promise<SpawnOutcome>;
  widgetUi?: WidgetUi;
}

interface ActiveRun {
  controller: AbortController;
  startedAt: number;
}

export function registerWorkflow<Args, Pre>(
  pi: ExtensionAPI,
  def: WorkflowDefinition<Args, Pre>,
  testOpts: RegisterWorkflowOpts = {},
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
      const startedAt = Date.now();
      active = { controller, startedAt };

      let preflightData: any = {};
      if (def.preflight) {
        try {
          const pre = await def.preflight(
            process.cwd(),
            parsed.args,
            controller.signal,
          );
          if (!pre.ok) {
            ctx.ui.notify(`/${def.name}-start: ${pre.error}`, "error");
            active = null;
            return;
          }
          preflightData = pre.data;
        } catch (e) {
          ctx.ui.notify(
            `/${def.name}-start: preflight crashed: ${(e as Error).message}`,
            "error",
          );
          active = null;
          return;
        }
      }

      const pipeline = async () => {
        const piAny = pi as any;
        const widgetUi: WidgetUi =
          testOpts.widgetUi ??
          (piAny.hasUI && typeof piAny.setWidget === "function"
            ? {
                setWidget: (key: string, lines: string[] | undefined) =>
                  piAny.setWidget(key, lines),
              }
            : { setWidget: () => {} });
        const widget = createWidget({
          key: def.name,
          ui: widgetUi,
          theme: piAny.hasUI ? piAny.ui?.theme : undefined,
        });
        const subagent = createSubagent({
          cwd: process.cwd(),
          spawn: testOpts.spawn,
          signal: controller.signal,
          onSubagentEvent: (id, ev) =>
            widget._emitSubagentLifecycle({
              kind: "event",
              id,
              event: ev,
            }),
          onSubagentLifecycle: (e) => {
            if (e.kind === "start") {
              widget._emitSubagentLifecycle({
                kind: "start",
                id: e.id,
                intent: e.spec.intent,
              });
            } else {
              widget._emitSubagentLifecycle({ kind: "end", id: e.id });
            }
          },
        });
        try {
          await def.run({
            args: parsed.args,
            signal: controller.signal,
            preflight: preflightData,
            cwd: process.cwd(),
            ui: pi,
            startedAt,
            subagent,
            widget,
          });
        } finally {
          widget.dispose();
          active = null;
        }
      };
      // Detach: do NOT await
      void pipeline();
    },
  });
}
