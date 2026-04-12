import { readFile } from "node:fs/promises";
import { parseJsonReport } from "../lib/parse.ts";
import { PlanReportSchema, type PlanReport } from "../lib/schemas.ts";
import type { DispatchOptions, DispatchResult } from "../lib/dispatch.ts";

const PROMPT_PATH = new URL("../prompts/plan.md", import.meta.url);

type Dispatch = (opts: DispatchOptions) => Promise<DispatchResult>;

export async function runPlan(args: {
  designPath: string;
  dispatch: Dispatch;
  cwd?: string;
}) {
  const template = await readFile(PROMPT_PATH, "utf8");
  const prompt = template.replace("{DESIGN_PATH}", args.designPath);
  const r = await args.dispatch({
    prompt,
    tools: ["read", "ls", "find", "grep"],
    cwd: args.cwd ?? process.cwd(),
  });
  if (!r.ok) return { ok: false as const, error: r.error ?? "dispatch failed" };
  return parseJsonReport(r.stdout, PlanReportSchema);
}

export type { PlanReport };
