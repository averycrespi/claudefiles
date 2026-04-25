import { readFile } from "node:fs/promises";
import type { DispatchFn } from "../lib/dispatch.ts";
import { parseJsonReport } from "../lib/parse.ts";
import { IterationReportSchema } from "../lib/schemas.ts";
import type { IterationOutcome } from "../lib/history.ts";

const ITERATE_PROMPT = new URL("../prompts/iterate.md", import.meta.url);
const REFLECTION_BLOCK = new URL(
  "../prompts/reflection-block.md",
  import.meta.url,
);

let cachedTemplate: string | null = null;
let cachedReflection: string | null = null;

async function loadTemplates(): Promise<{
  template: string;
  reflection: string;
}> {
  if (cachedTemplate === null)
    cachedTemplate = await readFile(ITERATE_PROMPT, "utf8");
  if (cachedReflection === null)
    cachedReflection = await readFile(REFLECTION_BLOCK, "utf8");
  return { template: cachedTemplate, reflection: cachedReflection };
}

export interface RunIterationArgs {
  iteration: number;
  maxIterations: number;
  designPath: string;
  taskFilePath: string;
  /** null on iteration 1 (bootstrap) — anything else is the previous handoff. */
  priorHandoff: string | null;
  isReflection: boolean;
  timeoutMs: number;
  cwd: string;
  dispatch: DispatchFn;
  getHead: () => Promise<string>;
  /** Optional run-level abort signal (e.g. /autoralph-cancel). */
  signal?: AbortSignal;
}

export interface IterationOutcomeRecord {
  outcome: IterationOutcome;
  summary: string;
  handoff: string | null;
  headBefore: string;
  headAfter: string;
  durationMs: number;
}

export async function runIteration(
  args: RunIterationArgs,
): Promise<IterationOutcomeRecord> {
  const { template, reflection } = await loadTemplates();

  const bootstrapOrHandoff =
    args.priorHandoff === null
      ? `This is iteration 1. The task file does not yet exist — read the design at ${args.designPath}, create ${args.taskFilePath} with goals + a checklist + initial notes, then begin work.`
      : `Prior iteration's handoff: ${JSON.stringify(args.priorHandoff)}\nRead ${args.taskFilePath} (your prior notes), then continue from the handoff.`;

  const prompt = template
    .replace("{N}", String(args.iteration))
    .replace("{MAX}", String(args.maxIterations))
    .replace("{DESIGN_PATH}", args.designPath)
    .replace("{TASK_FILE_PATH}", args.taskFilePath)
    .replace("{BOOTSTRAP_OR_HANDOFF}", bootstrapOrHandoff)
    .replace("{REFLECTION_BLOCK}", args.isReflection ? reflection : "");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  const onParentAbort = () => controller.abort();
  if (args.signal) {
    if (args.signal.aborted) controller.abort();
    else args.signal.addEventListener("abort", onParentAbort, { once: true });
  }

  const startedAt = Date.now();
  const headBefore = await args.getHead();

  let dispatchResult;
  try {
    dispatchResult = await args.dispatch({
      prompt,
      tools: ["read", "write", "edit", "bash"],
      extensions: ["autoformat"],
      cwd: args.cwd,
      intent: `Iteration ${args.iteration}${args.isReflection ? " (reflection)" : ""}`,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (args.signal) args.signal.removeEventListener("abort", onParentAbort);
  }

  const durationMs = Date.now() - startedAt;
  const headAfter = await args.getHead();

  const timedOut =
    !args.signal?.aborted && controller.signal.aborted && !dispatchResult.ok;

  if (!dispatchResult.ok) {
    if ((timedOut || dispatchResult.aborted) && !args.signal?.aborted) {
      return {
        outcome: "timeout",
        summary: `iteration timed out after ${Math.round(durationMs / 1000)}s`,
        handoff: null,
        headBefore,
        headAfter,
        durationMs,
      };
    }
    return {
      outcome: "dispatch_error",
      summary: `dispatch failed: ${dispatchResult.error ?? "unknown"}`,
      handoff: null,
      headBefore,
      headAfter,
      durationMs,
    };
  }

  const parsed = parseJsonReport(dispatchResult.stdout, IterationReportSchema);
  if (!parsed.ok) {
    return {
      outcome: "parse_error",
      summary: `invalid report: ${parsed.error}`,
      handoff: null,
      headBefore,
      headAfter,
      durationMs,
    };
  }

  return {
    outcome: parsed.data.outcome,
    summary: parsed.data.summary,
    handoff: parsed.data.handoff,
    headBefore,
    headAfter,
    durationMs,
  };
}
