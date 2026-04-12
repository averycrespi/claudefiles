import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { taskList } from "../task-list/api.ts";
import { dispatch } from "./lib/dispatch.ts";
import { formatReport } from "./lib/report.ts";
import { runImplement } from "./phases/implement.ts";
import { runPlan } from "./phases/plan.ts";
import { runVerify, type RunVerifyResult } from "./phases/verify.ts";
import { preflight } from "./preflight.ts";

const execFileP = promisify(execFile);

/**
 * Resolves the current HEAD SHA of the repo at `cwd` via `git rev-parse`.
 * Used by the implement phase to verify each task produces a new commit.
 */
function makeGetHead(cwd: string): () => Promise<string> {
  return async () => {
    const { stdout } = await execFileP("git", ["rev-parse", "HEAD"], { cwd });
    return stdout.trim();
  };
}

/**
 * Subscribes to taskList changes and captures HEAD after any task
 * transitions into the `completed` state. The subagent reports its
 * commit sha, but we prefer the live HEAD — it is authoritative and
 * already verified to have moved by the implement phase. Returns the
 * populated map plus an unsubscribe handle.
 */
function makeCommitTracker(getHead: () => Promise<string>): {
  map: Record<number, string>;
  unsubscribe: () => void;
} {
  const map: Record<number, string> = {};
  // Track which task ids we've already captured — subscribe fires on
  // any state mutation, including activity heartbeats.
  const captured = new Set<number>();
  const unsubscribe = taskList.subscribe((state) => {
    for (const t of state.tasks) {
      if (t.status === "completed" && !captured.has(t.id)) {
        captured.add(t.id);
        // Fire-and-forget: capture HEAD asynchronously. Failures are
        // non-fatal — the report falls back to `(no-sha)` if missing.
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
}

/**
 * Renders the final report and pushes it to the transcript as a
 * single text message. Called from every pipeline termination path
 * so the user always gets a summary, even on early failure.
 */
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
  });
  args.pi.sendMessage({
    customType: "autopilot-report",
    content: [{ type: "text", text }],
    display: true,
    details: {},
  });
}

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

      const cwd = process.cwd();
      const getHead = makeGetHead(cwd);

      const plan = await runPlan({
        designPath,
        dispatch,
        cwd,
      });
      if (!plan.ok) {
        ctx.ui.notify(`/autopilot: plan failed — ${plan.error}`, "error");
        // No tasks to report. Still emit a (near-empty) report so the
        // user sees a consistent summary.
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

      ctx.ui.notify(
        `/autopilot: plan ok — ${plan.data.tasks.length} task(s) created. Implementing…`,
        "info",
      );

      const commitTracker = makeCommitTracker(getHead);

      try {
        const implementResult = await runImplement({
          archNotes: plan.data.architecture_notes,
          dispatch,
          getHead,
          cwd,
        });

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

        ctx.ui.notify(
          `/autopilot: implement ok — all ${plan.data.tasks.length} task(s) completed. Verifying…`,
          "info",
        );

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

        const fixedCount = verifyResult.fixed.length;
        const knownCount = verifyResult.knownIssues.length;
        const skippedCount = verifyResult.skippedReviewers.length;
        ctx.ui.notify(
          `/autopilot: verify ok — fixed ${fixedCount}, known issues ${knownCount}, reviewers skipped ${skippedCount}.`,
          "info",
        );

        await emitReport({
          pi,
          designPath,
          cwd,
          baseSha: pre.baseSha,
          verify: verifyResult,
          commitShas: commitTracker.map,
        });
      } finally {
        commitTracker.unsubscribe();
      }
    },
  });
}
