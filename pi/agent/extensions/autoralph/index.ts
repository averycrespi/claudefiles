import { execFile } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  appendHistory,
  readHistory,
  type IterationRecord,
} from "./lib/history.ts";
import { isBootstrap, readHandoff, writeHandoff } from "./lib/handoff.ts";
import { parseArgs } from "./lib/args.ts";
import { formatAutoralphReport, type FinalOutcome } from "./lib/report.ts";
import {
  createStatusWidget,
  type SubagentHandle,
} from "./lib/status-widget.ts";
import {
  createSubagent,
  type CreateSubagentOpts,
} from "../_workflow-core/api.ts";
import { runIteration } from "./phases/iterate.ts";
import { preflight } from "./preflight.ts";

const execFileP = promisify(execFile);

const AUTORALPH_DIR = ".autoralph";
const MAX_CONSECUTIVE_TIMEOUTS = 3;

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

function designBasename(designPath: string): string {
  return basename(designPath, extname(designPath));
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("autoralph-cancel", {
    description: "Cancel the currently running /autoralph loop.",
    handler: async (_args, ctx) => {
      if (!activeRun) {
        ctx.ui.notify("/autoralph-cancel: no autoralph run is active", "info");
        return;
      }
      ctx.ui.notify(
        "/autoralph-cancel: cancelling — will stop after current iteration",
        "warning",
      );
      activeRun.controller.abort();
    },
  });

  pi.registerCommand("autoralph", {
    description:
      "Run the autonomous Ralph-style iteration loop on a design document.",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();

      const parsed = parseArgs(args);
      if ("error" in parsed) {
        ctx.ui.notify(
          `/autoralph: ${parsed.error} (usage: /autoralph <design.md> [--reflect-every N] [--max-iterations N] [--iteration-timeout-mins N])`,
          "error",
        );
        return;
      }

      if (activeRun) {
        ctx.ui.notify(
          "/autoralph: a run is already active — use /autoralph-cancel to stop it first",
          "error",
        );
        return;
      }

      const cwd = process.cwd();
      const pre = await preflight({ designPath: parsed.designPath, cwd });
      if (!pre.ok) {
        ctx.ui.notify(`/autoralph: ${pre.reason}`, "error");
        return;
      }

      const controller = new AbortController();
      const startedAt = Date.now();
      activeRun = { controller, startedAt };

      const widget = createStatusWidget({
        ui: ctx.hasUI ? ctx.ui : undefined,
        theme: ctx.hasUI ? ctx.ui.theme : undefined,
      });
      widget.setIteration(0, parsed.maxIterations);

      // Slot-map: tracks the legacy widget.subagent(intent) handle per
      // in-flight subagent id so lifecycle callbacks can drive it.
      const slots = new Map<number, SubagentHandle>();

      const subagent = createSubagent({
        cwd,
        signal: controller.signal,
        onSubagentEvent: (id: number, ev: unknown) => {
          slots.get(id)?.onEvent(ev);
        },
        onSubagentLifecycle: (
          e: Parameters<
            NonNullable<CreateSubagentOpts["onSubagentLifecycle"]>
          >[0],
        ) => {
          if (e.kind === "start") {
            const slot = widget.subagent(e.spec.intent);
            slots.set(e.id, slot);
          } else {
            slots.get(e.id)?.finish();
            slots.delete(e.id);
          }
        },
      });

      const getHead = makeGetHead(cwd);

      const slug = designBasename(parsed.designPath);
      const taskFilePath = join(cwd, AUTORALPH_DIR, `${slug}.md`);
      const handoffPath = join(cwd, AUTORALPH_DIR, `${slug}.handoff.json`);
      const historyPath = join(cwd, AUTORALPH_DIR, `${slug}.history.json`);

      ctx.ui.notify(
        `/autoralph: started (base ${pre.baseSha.slice(0, 7)})`,
        "info",
      );

      const pipeline = async () => {
        let outcome: FinalOutcome = "max-iterations";
        let consecutiveTimeouts = 0;
        let finalHandoff: string | null = await readHandoff(handoffPath);

        try {
          for (let i = 1; i <= parsed.maxIterations; i++) {
            if (controller.signal.aborted) {
              outcome = "cancelled";
              break;
            }
            widget.setIteration(i, parsed.maxIterations);

            const bootstrap = await isBootstrap(handoffPath);
            const priorHandoff = bootstrap
              ? null
              : await readHandoff(handoffPath);
            const isReflection =
              parsed.reflectEvery > 0 &&
              i > 1 &&
              (i - 1) % parsed.reflectEvery === 0;

            const result = await runIteration({
              iteration: i,
              maxIterations: parsed.maxIterations,
              designPath: parsed.designPath,
              taskFilePath: taskFilePath,
              priorHandoff,
              isReflection,
              timeoutMs: parsed.timeoutMins * 60_000,
              cwd,
              subagent,
              getHead,
            });

            const record: IterationRecord = {
              iteration: i,
              outcome: result.outcome,
              summary: result.summary,
              headBefore: result.headBefore,
              headAfter: result.headAfter,
              durationMs: result.durationMs,
              reflection: isReflection,
            };
            await appendHistory(historyPath, record);
            widget.setHistory(await readHistory(historyPath));

            if (result.handoff !== null) {
              await writeHandoff(handoffPath, result.handoff);
              finalHandoff = result.handoff;
            }

            if (result.outcome === "timeout") {
              consecutiveTimeouts++;
              if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
                outcome = "stuck";
                break;
              }
              continue;
            }
            consecutiveTimeouts = 0;

            if (controller.signal.aborted) {
              outcome = "cancelled";
              break;
            }
            if (result.outcome === "complete") {
              outcome = "complete";
              break;
            }
            if (result.outcome === "failed") {
              outcome = "failed";
              break;
            }
            // in_progress, parse_error, dispatch_error → continue loop
          }

          const history = await readHistory(historyPath);
          const [branchName, commitsAhead] = await Promise.all([
            resolveBranch(cwd),
            resolveCommitsAhead(cwd, pre.baseSha),
          ]);
          const text = formatAutoralphReport({
            designPath: parsed.designPath,
            branchName,
            commitsAhead,
            taskFilePath: resolve(taskFilePath),
            finalHandoff,
            totalElapsedMs: Date.now() - startedAt,
            outcome,
            history,
          }).join("\n");
          pi.sendMessage({
            customType: "autoralph-report",
            content: [{ type: "text", text }],
            display: true,
            details: {},
          });
        } finally {
          widget.dispose();
          activeRun = null;
        }
      };

      const run = pipeline().catch((err) => {
        ctx.ui.notify(
          `/autoralph: pipeline crashed — ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      });
      if (!ctx.hasUI) await run;
      else void run;
    },
  });
}
