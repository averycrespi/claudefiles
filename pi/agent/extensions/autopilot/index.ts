import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  registerWorkflow,
  type RegisterWorkflowOpts,
} from "../workflow-core/api.ts";
import {
  requireFile,
  requireCleanTree,
  captureHead,
} from "../workflow-core/preflight.ts";
import { setupAutopilotWidget } from "./lib/widget-body.ts";
import { formatAutopilotReport } from "./lib/report.ts";
import { runPlan } from "./phases/plan.ts";
import { runImplement } from "./phases/implement.ts";
import { runVerify } from "./phases/verify.ts";
import { taskList } from "../task-list/api.ts";

const execFileP = promisify(execFile);

async function getHead(cwd: string): Promise<string> {
  const { stdout } = await execFileP("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

async function diffSince(cwd: string, baseSha: string): Promise<string> {
  const { stdout } = await execFileP("git", ["diff", `${baseSha}...HEAD`], {
    cwd,
  });
  return stdout;
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

function summarize(tasks: { status: string; title: string }[]): string {
  return tasks.map((t) => `[${t.status}] ${t.title}`).join("\n");
}

export default function (
  pi: ExtensionAPI,
  testOpts: RegisterWorkflowOpts = {},
) {
  registerWorkflow(
    pi,
    {
      name: "autopilot",
      description:
        "Run the autonomous plan → implement → verify pipeline on a design document.",
      parseArgs: (raw) => {
        const path = raw.trim();
        if (!path) return { ok: false, error: "requires a design file path" };
        return { ok: true, args: { designPath: path } };
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
      runSlug: (args) => basename(args.designPath, ".md"),
      run: async (ctx) => {
        const { designPath } = ctx.args as { designPath: string };
        const { baseSha } = ctx.preflight as { baseSha: string };
        const widget = setupAutopilotWidget(ctx.widget);

        // Copy the design doc into the run dir so the run is self-contained.
        await copyFile(designPath, join(ctx.workflowDir, "design.md"));

        // Per-task SHA capture (autopilot-specific; lives here, not in workflow-core).
        const commitShas: Record<number, string> = {};
        const captured = new Set<number>();
        const unsub = taskList.subscribe((s) => {
          for (const t of s.tasks) {
            if (t.status === "completed" && !captured.has(t.id)) {
              captured.add(t.id);
              getHead(ctx.cwd)
                .then((sha) => {
                  commitShas[t.id] = sha;
                })
                .catch(() => {
                  /* ignore */
                });
            }
          }
        });

        async function buildReport(
          verify: Awaited<ReturnType<typeof runVerify>> | null,
          cancelled?: { elapsedMs: number },
        ) {
          const [branchName, commitsAhead] = await Promise.all([
            resolveBranch(ctx.cwd),
            resolveCommitsAhead(ctx.cwd, baseSha),
          ]);
          return formatAutopilotReport({
            designPath,
            branchName,
            commitsAhead,
            tasks: taskList.all(),
            commitShas,
            verify,
            cancelled,
          });
        }

        try {
          // --- Plan ---
          widget.setStage("plan");
          const plan = await runPlan({ designPath, subagent: ctx.subagent });
          if (!plan.ok) {
            return buildReport(
              null,
              ctx.signal.aborted
                ? { elapsedMs: ctx.widget.elapsedMs() }
                : undefined,
            );
          }

          taskList.clear();
          taskList.create(plan.data.tasks);
          ctx.log("plan-tasks", {
            count: plan.data.tasks.length,
            titles: plan.data.tasks.map((t: { title: string }) => t.title),
          });

          // --- Implement ---
          widget.setStage("implement");
          const impl = await runImplement({
            archNotes: plan.data.architecture_notes,
            subagent: ctx.subagent,
            getHead: () => getHead(ctx.cwd),
            log: ctx.log,
          });
          if (!impl.ok || ctx.signal.aborted) {
            return buildReport(
              null,
              ctx.signal.aborted
                ? { elapsedMs: ctx.widget.elapsedMs() }
                : undefined,
            );
          }

          // --- Verify ---
          widget.setStage("verify");
          const verify = await runVerify({
            subagent: ctx.subagent,
            getDiff: () => diffSince(ctx.cwd, baseSha),
            archNotes: plan.data.architecture_notes,
            taskListSummary: summarize(taskList.all()),
            log: ctx.log,
          });

          return buildReport(
            verify,
            ctx.signal.aborted
              ? { elapsedMs: ctx.widget.elapsedMs() }
              : undefined,
          );
        } finally {
          unsub();
          widget.dispose();
        }
      },
    },
    testOpts,
  );
}
