import { readFile } from "node:fs/promises";
import { IterationReportSchema } from "../lib/schemas.ts";
import type { IterationOutcome } from "../lib/state.ts";
import type { Subagent } from "../../_workflow-core/lib/subagent.ts";

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
  subagent: Subagent;
  getHead: () => Promise<string>;
  log?: (type: string, payload?: Record<string, unknown>) => void;
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

  const headBefore = await args.getHead();
  const startedAt = Date.now();

  const r = await args.subagent.dispatch({
    intent: `Iteration ${args.iteration}${args.isReflection ? " (reflection)" : ""}`,
    prompt,
    schema: IterationReportSchema,
    tools: ["read", "write", "edit", "bash"],
    extensions: ["format"],
    timeoutMs: args.timeoutMs,
  });

  const durationMs = Date.now() - startedAt;
  const headAfter = await args.getHead();

  if (!r.ok) {
    if (r.reason === "timeout") {
      return {
        outcome: "timeout",
        summary: `iteration timed out after ${Math.round(durationMs / 1000)}s`,
        handoff: null,
        headBefore,
        headAfter,
        durationMs,
      };
    }
    if (r.reason === "parse" || r.reason === "schema") {
      return {
        outcome: "parse_error",
        summary: `invalid report: ${r.error}`,
        handoff: null,
        headBefore,
        headAfter,
        durationMs,
      };
    }
    // reason === "dispatch" | "aborted"
    const prefix =
      r.reason === "aborted" ? "dispatch aborted" : "dispatch failed";
    return {
      outcome: "dispatch_error",
      summary: `${prefix}: ${r.error}`,
      handoff: null,
      headBefore,
      headAfter,
      durationMs,
    };
  }

  return {
    outcome: r.data.outcome,
    summary: r.data.summary,
    handoff: r.data.handoff,
    headBefore,
    headAfter,
    durationMs,
  };
}
