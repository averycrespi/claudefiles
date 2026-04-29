import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  registerWorkflow,
  type RegisterWorkflowOpts,
} from "../_workflow-core/api.ts";
import {
  requireFile,
  requireCleanTree,
  captureHead,
} from "../_workflow-core/preflight.ts";
import { setupAutoralphWidget } from "./lib/widget-body.ts";
import { parseArgs, type ParsedArgs } from "./lib/args.ts";
import { formatAutoralphReport, type FinalOutcome } from "./lib/report.ts";
import {
  readHandoff,
  writeHandoff,
  readHistory,
  appendHistory,
  type IterationRecord,
} from "./lib/state.ts";
import { runIteration } from "./phases/iterate.ts";

const execFileP = promisify(execFile);

const MAX_CONSECUTIVE_TIMEOUTS = 3;

async function getHead(cwd: string): Promise<string> {
  const { stdout } = await execFileP("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
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

export default function (
  pi: ExtensionAPI,
  testOpts: RegisterWorkflowOpts = {},
) {
  registerWorkflow(
    pi,
    {
      name: "autoralph",
      description:
        "Run the autonomous Ralph-style iteration loop on a design document.",
      parseArgs: (raw) => {
        const r = parseArgs(raw);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, args: r.args };
      },
      preflight: async (cwd, args) => {
        const f = await requireFile(args.designPath);
        if (!f.ok) return f;
        const text = await readFile(args.designPath, "utf8");
        if (text.trim().length === 0)
          return { ok: false, error: "design file is empty" };
        const c = await requireCleanTree(cwd);
        if (!c.ok) return c;
        const baseSha = await captureHead(cwd);
        return { ok: true, data: { baseSha } };
      },
      runSlug: (args) => basename(args.designPath, extname(args.designPath)),
      run: async (ctx) => {
        const { designPath, reflectEvery, maxIterations, timeoutMins } =
          ctx.args as ParsedArgs;
        const { baseSha } = ctx.preflight as { baseSha: string };
        const widget = setupAutoralphWidget(ctx.widget);

        const slug = basename(designPath, extname(designPath));
        const taskFilePath = join(ctx.workflowDir, `${slug}.md`);
        const handoffPath = join(ctx.workflowDir, `${slug}.handoff.json`);
        const historyPath = join(ctx.workflowDir, `${slug}.history.json`);

        let outcome: FinalOutcome = "max-iterations";
        let consecutiveTimeouts = 0;
        let finalHandoff: string | null = null;

        try {
          for (let i = 1; i <= maxIterations; i++) {
            if (ctx.signal.aborted) {
              outcome = "cancelled";
              break;
            }
            widget.setIteration(i, maxIterations);
            ctx.log("iteration-start", { iteration: i });

            const priorHandoff =
              i === 1 ? null : await readHandoff(handoffPath);
            const isReflection =
              reflectEvery > 0 && i > 1 && (i - 1) % reflectEvery === 0;

            const result = await runIteration({
              iteration: i,
              maxIterations,
              designPath,
              taskFilePath,
              priorHandoff,
              isReflection,
              timeoutMs: timeoutMins * 60_000,
              cwd: ctx.cwd,
              subagent: ctx.subagent,
              getHead: () => getHead(ctx.cwd),
              log: ctx.log,
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

            if (ctx.signal.aborted) {
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
            resolveBranch(ctx.cwd),
            resolveCommitsAhead(ctx.cwd, baseSha),
          ]);
          return formatAutoralphReport({
            designPath,
            branchName,
            commitsAhead,
            taskFilePath: resolve(taskFilePath),
            finalHandoff,
            totalElapsedMs: Date.now() - ctx.startedAt,
            outcome,
            history,
          });
        } finally {
          widget.dispose();
        }
      },
    },
    testOpts,
  );
}
