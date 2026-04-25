import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SpawnInvocation, SpawnOutcome } from "../../subagents/api.ts";
import { createRunLogger } from "./log.ts";
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
  logBaseDir?: string;
  cwd?: string;
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

      const logBaseDir =
        testOpts.logBaseDir ?? join(homedir(), ".pi", "workflow-runs");
      const cwd = testOpts.cwd ?? process.cwd();
      const slug = def.runSlug?.(parsed.args, preflightData) ?? null;

      const pipeline = async () => {
        // Create logger FIRST. It holds no live resources before its first
        // write — if it throws (e.g., filesystem error), there is nothing
        // to clean up and we must release the workflow lock so subsequent
        // /<name>-start invocations can proceed.
        let logger: Awaited<ReturnType<typeof createRunLogger>>;
        try {
          logger = await createRunLogger({
            baseDir: logBaseDir,
            workflow: def.name,
            slug,
            args: parsed.args,
            preflight: preflightData,
            retainRuns: def.retainRuns,
          });
        } catch (e) {
          ctx.ui.notify(
            `/${def.name}-start: failed to create run log: ${(e as Error).message}`,
            "error",
          );
          active = null;
          return;
        }

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

        let subagentCount = 0;
        let subagentRetries = 0;
        const subagent = createSubagent({
          cwd,
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
              subagentCount++;
              if (e.parentId !== undefined) subagentRetries++;
              widget._emitSubagentLifecycle({
                kind: "start",
                id: e.id,
                intent: e.spec.intent,
              });
              logger.recordSubagentStart({
                id: e.id,
                intent: e.spec.intent,
                schema: e.spec.schemaName ?? "<anonymous>",
                tools: e.spec.tools,
                extensions: e.spec.extensions ?? [],
                prompt: e.spec.prompt,
                parentId: e.parentId,
                model: e.spec.model,
                thinking: e.spec.thinking,
                timeoutMs: e.spec.timeoutMs,
                retry: e.spec.retry,
              });
            } else {
              widget._emitSubagentLifecycle({ kind: "end", id: e.id });
              logger.recordSubagentEnd({
                id: e.id,
                ok: e.result.ok,
                durationMs: e.durationMs,
                output: e.result.ok ? e.result.data : undefined,
                reason: e.result.ok ? undefined : e.result.reason,
                error: e.result.ok ? undefined : e.result.error,
              });
            }
          },
        });

        let outcome: "success" | "cancelled" | "crashed" = "success";
        let error: string | null = null;
        let lines: string[] | null = null;
        try {
          try {
            lines = await def.run({
              args: parsed.args,
              signal: controller.signal,
              preflight: preflightData,
              cwd,
              ui: pi,
              startedAt,
              subagent,
              widget,
              log: (type: string, payload?: Record<string, unknown>) =>
                logger.logWorkflow(type, payload),
              workflowDir: logger.workflowDir,
            });
            if (controller.signal.aborted) outcome = "cancelled";
          } catch (e) {
            outcome = "crashed";
            error = (e as Error).message;
            lines = [`/${def.name}: run crashed: ${error}`];
          }

          if (lines !== null) {
            let text = lines.join("\n");
            if (def.emitLogPath !== false) {
              text = `${text}\nLog:     ${logger.runDir}`;
            }
            pi.sendMessage({
              customType: `${def.name}-report`,
              content: [{ type: "text", text }],
              display: true,
              details: {},
            });
            logger.writeFinalReport(text);
          }

          await logger.close({
            outcome,
            error,
            subagentCount,
            subagentRetries,
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
