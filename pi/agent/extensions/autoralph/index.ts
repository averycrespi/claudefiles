import { execFile } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  dispatch as rawDispatch,
  type DispatchOptions,
  type DispatchResult,
} from "./lib/dispatch.ts";
import {
  appendHistory,
  readHistory,
  type IterationRecord,
} from "./lib/history.ts";
import { isBootstrap, readHandoff, writeHandoff } from "./lib/handoff.ts";
import { formatReport, type FinalOutcome } from "./lib/report.ts";
import { createStatusWidget, type StatusWidget } from "./lib/status-widget.ts";
import { runIteration } from "./phases/iterate.ts";
import { preflight } from "./preflight.ts";

const execFileP = promisify(execFile);

const AUTORALPH_DIR = ".autoralph";
const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_REFLECT_EVERY = 5;
const DEFAULT_TIMEOUT_MINS = 15;
const MAX_CONSECUTIVE_TIMEOUTS = 3;

interface ActiveRun {
  controller: AbortController;
  startedAt: number;
}
let activeRun: ActiveRun | null = null;

interface ParsedArgs {
  designPath: string;
  reflectEvery: number;
  maxIterations: number;
  timeoutMins: number;
}

function parseArgs(input: string): ParsedArgs | { error: string } {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { error: "missing design file path" };
  const out: ParsedArgs = {
    designPath: "",
    reflectEvery: DEFAULT_REFLECT_EVERY,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    timeoutMins: DEFAULT_TIMEOUT_MINS,
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--reflect-every") {
      const v = parseInt(tokens[++i] ?? "", 10);
      if (!Number.isFinite(v) || v < 0)
        return { error: "--reflect-every requires a non-negative integer" };
      out.reflectEvery = v;
    } else if (t === "--max-iterations") {
      const v = parseInt(tokens[++i] ?? "", 10);
      if (!Number.isFinite(v) || v < 1)
        return { error: "--max-iterations requires a positive integer" };
      out.maxIterations = v;
    } else if (t === "--iteration-timeout-mins") {
      const v = parseInt(tokens[++i] ?? "", 10);
      if (!Number.isFinite(v) || v < 1)
        return {
          error: "--iteration-timeout-mins requires a positive integer",
        };
      out.timeoutMins = v;
    } else if (t.startsWith("--")) {
      return { error: `unknown flag: ${t}` };
    } else if (!out.designPath) {
      out.designPath = t;
    } else {
      return { error: `unexpected positional argument: ${t}` };
    }
  }
  if (!out.designPath) return { error: "missing design file path" };
  return out;
}

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

      const dispatch = makeWrappedDispatch(widget, controller.signal);
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
              dispatch,
              getHead,
              signal: controller.signal,
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
          const text = formatReport({
            designPath: parsed.designPath,
            branchName,
            commitsAhead,
            taskFilePath: resolve(taskFilePath),
            finalHandoff,
            totalElapsedMs: Date.now() - startedAt,
            outcome,
            history,
          });
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
