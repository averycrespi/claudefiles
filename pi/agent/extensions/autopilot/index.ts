import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { taskList } from "../task-list/api.ts";
import { dispatch as rawDispatch } from "./lib/dispatch.ts";
import type { DispatchOptions, DispatchResult } from "./lib/dispatch.ts";
import { formatReport } from "./lib/report.ts";
import { createStatusWidget, type StatusWidget } from "./lib/status-widget.ts";
import { runImplement } from "./phases/implement.ts";
import { runPlan } from "./phases/plan.ts";
import { runVerify, type RunVerifyResult } from "./phases/verify.ts";
import { preflight } from "./preflight.ts";

const execFileP = promisify(execFile);

interface ActiveRun {
  controller: AbortController;
  startedAt: number;
}
let activeRun: ActiveRun | null = null;

function makeGetHead(cwd: string): () => Promise<string> {
  return async () => {
    const { stdout } = await execFileP("git", ["rev-parse", "HEAD"], { cwd });
    return stdout.trim();
  };
}

function makeCommitTracker(getHead: () => Promise<string>): {
  map: Record<number, string>;
  unsubscribe: () => void;
} {
  const map: Record<number, string> = {};
  const captured = new Set<number>();
  const unsubscribe = taskList.subscribe((state) => {
    for (const t of state.tasks) {
      if (t.status === "completed" && !captured.has(t.id)) {
        captured.add(t.id);
        getHead()
          .then((sha) => {
            map[t.id] = sha;
          })
          .catch(() => {
            /* ignore */
          });
      }
    }
  });
  return { map, unsubscribe };
}

async function resolveBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileP("git", ["branch", "--show-current"], {
      cwd,
    });
    return stdout.trim() || "(detached)";
  } catch {
    return "(unknown)";
  }
}

async function resolveCommitsAhead(
  cwd: string,
  baseSha: string,
): Promise<number> {
  try {
    const { stdout } = await execFileP(
      "git",
      ["rev-list", "--count", `${baseSha}..HEAD`],
      { cwd },
    );
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

interface EmitReportArgs {
  pi: ExtensionAPI;
  designPath: string;
  cwd: string;
  baseSha: string;
  verify: RunVerifyResult | null;
  commitShas: Record<number, string>;
  cancelled?: { elapsedMs: number };
}

async function emitReport(args: EmitReportArgs): Promise<void> {
  const [branchName, commitsAhead] = await Promise.all([
    resolveBranch(args.cwd),
    resolveCommitsAhead(args.cwd, args.baseSha),
  ]);
  const text = formatReport({
    designPath: args.designPath,
    branchName,
    commitsAhead,
    tasks: taskList.all(),
    verify: args.verify,
    commitShas: args.commitShas,
    cancelled: args.cancelled,
  });
  args.pi.sendMessage({
    customType: "autopilot-report",
    content: [{ type: "text", text }],
    display: true,
    details: {},
  });
}

/**
 * Wraps `rawDispatch` so every subagent call:
 *   1. Inherits the run-level abort signal (unless the caller supplies one).
 *   2. Creates a live subagent handle on the status widget and forwards
 *      Pi subagent events to it.
 */
function makeWrappedDispatch(
  widget: StatusWidget,
  signal: AbortSignal,
): (opts: DispatchOptions) => Promise<DispatchResult> {
  return async (opts) => {
    const intent = opts.intent ?? "subagent";
    const handle = widget.subagent(intent);
    try {
      return await rawDispatch({
        ...opts,
        signal: opts.signal ?? signal,
        onEvent: (event) => {
          opts.onEvent?.(event);
          handle.onEvent(event);
        },
      });
    } finally {
      handle.finish();
    }
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("autopilot-cancel", {
    description: "Cancel the currently running /autopilot pipeline.",
    handler: async (_args, ctx) => {
      if (!activeRun) {
        ctx.ui.notify("/autopilot-cancel: no autopilot run is active", "info");
        return;
      }
      ctx.ui.notify(
        "/autopilot-cancel: cancelling — will stop after current step",
        "warning",
      );
      activeRun.controller.abort();
    },
  });

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

      if (activeRun) {
        ctx.ui.notify(
          "/autopilot: a run is already active — use /autopilot-cancel to stop it first",
          "error",
        );
        return;
      }

      const pre = await preflight({ designPath, cwd: process.cwd() });
      if (!pre.ok) {
        ctx.ui.notify(`/autopilot: ${pre.reason}`, "error");
        return;
      }

      const cwd = process.cwd();
      const getHead = makeGetHead(cwd);
      const controller = new AbortController();
      const startedAt = Date.now();
      activeRun = { controller, startedAt };

      const widget = createStatusWidget({
        ui: ctx.hasUI ? ctx.ui : undefined,
        theme: ctx.hasUI ? ctx.ui.theme : undefined,
      });
      const dispatch = makeWrappedDispatch(widget, controller.signal);
      const commitTracker = makeCommitTracker(getHead);

      const isCancelled = () => controller.signal.aborted;
      const cancelledInfo = (): { elapsedMs: number } => ({
        elapsedMs: Date.now() - startedAt,
      });

      ctx.ui.notify(
        `/autopilot: started (base ${pre.baseSha.slice(0, 7)})`,
        "info",
      );

      // Detach the pipeline so the command handler returns immediately.
      // Pi's interactive loop awaits each command handler before reading the
      // next user input — if we awaited the pipeline here, `/autopilot-cancel`
      // could never be dispatched.
      const pipeline = async () => {
        try {
          widget.setStage("plan");
          const plan = await runPlan({
            designPath,
            dispatch,
            cwd,
            signal: controller.signal,
          });

          if (isCancelled()) {
            await emitReport({
              pi,
              designPath,
              cwd,
              baseSha: pre.baseSha,
              verify: null,
              commitShas: {},
              cancelled: cancelledInfo(),
            });
            return;
          }
          if (!plan.ok) {
            ctx.ui.notify(`/autopilot: plan failed — ${plan.error}`, "error");
            await emitReport({
              pi,
              designPath,
              cwd,
              baseSha: pre.baseSha,
              verify: null,
              commitShas: {},
            });
            return;
          }

          taskList.clear();
          taskList.create(plan.data.tasks);

          widget.setStage("implement");
          const implementResult = await runImplement({
            archNotes: plan.data.architecture_notes,
            dispatch,
            getHead,
            cwd,
            signal: controller.signal,
          });

          if (isCancelled()) {
            await emitReport({
              pi,
              designPath,
              cwd,
              baseSha: pre.baseSha,
              verify: null,
              commitShas: commitTracker.map,
              cancelled: cancelledInfo(),
            });
            return;
          }

          if (!implementResult.ok) {
            ctx.ui.notify(
              `/autopilot: implement halted at task ${implementResult.haltedAtTaskId ?? "?"}`,
              "error",
            );
            await emitReport({
              pi,
              designPath,
              cwd,
              baseSha: pre.baseSha,
              verify: null,
              commitShas: commitTracker.map,
            });
            return;
          }

          widget.setStage("verify");
          const taskListSummary = taskList
            .all()
            .map((t) => `[${t.status}] ${t.title}`)
            .join("\n");
          const verifyResult = await runVerify({
            dispatch,
            getDiff: async () => {
              const { stdout } = await execFileP(
                "git",
                ["diff", `${pre.baseSha}...HEAD`],
                { cwd },
              );
              return stdout;
            },
            archNotes: plan.data.architecture_notes,
            taskListSummary,
            cwd,
          });

          if (isCancelled()) {
            await emitReport({
              pi,
              designPath,
              cwd,
              baseSha: pre.baseSha,
              verify: verifyResult,
              commitShas: commitTracker.map,
              cancelled: cancelledInfo(),
            });
            return;
          }

          await emitReport({
            pi,
            designPath,
            cwd,
            baseSha: pre.baseSha,
            verify: verifyResult,
            commitShas: commitTracker.map,
          });
        } finally {
          widget.dispose();
          commitTracker.unsubscribe();
          activeRun = null;
        }
      };

      // In interactive mode we detach the pipeline so Pi's input loop unblocks
      // and `/autopilot-cancel` can be accepted. In headless / print mode there
      // is no input loop and no way to cancel — if we detached, Pi would exit
      // as soon as the handler returned, killing the pipeline. Await instead.
      const run = pipeline().catch((err) => {
        ctx.ui.notify(
          `/autopilot: pipeline crashed — ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      });
      if (!ctx.hasUI) {
        await run;
      } else {
        void run;
      }
    },
  });
}
