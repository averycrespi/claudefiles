import { readFile } from "node:fs/promises";
import { PlanReportSchema, type PlanReport } from "../lib/schemas.ts";
import type { Subagent } from "../../_workflow-core/lib/subagent.ts";

const PROMPT_PATH = new URL("../prompts/plan.md", import.meta.url);

export async function runPlan(args: {
  designPath: string;
  subagent: Subagent;
}) {
  const template = await readFile(PROMPT_PATH, "utf8");
  const prompt = template.replace("{DESIGN_PATH}", args.designPath);
  const r = await args.subagent.dispatch({
    intent: "Plan",
    prompt,
    schema: PlanReportSchema,
    tools: ["read", "ls", "find", "grep"],
  });
  if (!r.ok) return { ok: false as const, error: r.error };
  return { ok: true as const, data: r.data };
}

export type { PlanReport };
