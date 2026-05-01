import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { WorkflowMode } from "./types.ts";

const REQUIRED_SECTIONS = [
  "## Goal",
  "## Constraints",
  "## Acceptance Criteria",
  "## Chosen Approach",
  "## Assumptions / Open Questions",
  "## Ordered Tasks",
  "## Verification Checklist",
  "## Known Issues / Follow-ups",
] as const;

export function buildWorkflowBriefTemplate(options: {
  context: string;
  mode: WorkflowMode;
}): string {
  const context = options.context.trim() || "TBD";
  const seedQuestion =
    options.mode === "plan"
      ? "- Confirm any missing constraints before finalizing the brief."
      : `- Entered directly in ${options.mode} mode; refine the brief if important context is still missing.`;

  return [
    "# Workflow Brief",
    "",
    "## Goal",
    context,
    "",
    "## Constraints",
    "- (none yet)",
    "",
    "## Acceptance Criteria",
    "- (to be defined)",
    "",
    "## Chosen Approach",
    "TBD",
    "",
    "## Assumptions / Open Questions",
    seedQuestion,
    "",
    "## Ordered Tasks",
    "1. Triage and refine the workflow brief.",
    "2. Implement the chosen approach.",
    "3. Verify the outcome against the acceptance criteria.",
    "",
    "## Verification Checklist",
    "- Identify the deterministic checks to run.",
    "",
    "## Known Issues / Follow-ups",
    "- (none yet)",
    "",
  ].join("\n");
}

export function resolvePlanPathArgument(
  input: string,
  cwd: string,
): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const markdownMatch = trimmed.match(/\(([^)]+\.md)\)/);
  const rawPath =
    markdownMatch?.[1] ?? (looksLikePlanPath(trimmed) ? trimmed : undefined);
  if (!rawPath) return undefined;

  return resolve(cwd, rawPath);
}

export function buildPlanPath(context: string, now: Date): string {
  const date = now.toISOString().slice(0, 10);
  const slug = slugify(context) || "workflow";
  return `.plans/${date}-${slug}.md`;
}

export async function ensureWorkflowBrief(options: {
  cwd: string;
  context: string;
  mode: WorkflowMode;
  now: Date;
}): Promise<string> {
  const planPath = buildPlanPath(options.context, options.now);
  const absolutePath = resolve(options.cwd, planPath);

  try {
    await stat(absolutePath);
    return planPath;
  } catch {
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(
      absolutePath,
      buildWorkflowBriefTemplate({
        context: options.context,
        mode: options.mode,
      }),
      "utf8",
    );
    return planPath;
  }
}

export async function readWorkflowBrief(
  cwd: string,
  planPath: string,
): Promise<string> {
  return await readFile(resolve(cwd, planPath), "utf8");
}

export function validateWorkflowBrief(content: string): {
  valid: boolean;
  missingSections: string[];
} {
  const missingSections = REQUIRED_SECTIONS.filter(
    (section) => !content.includes(section),
  );
  return { valid: missingSections.length === 0, missingSections };
}

export function extractPlanGoal(content: string): string | undefined {
  const match = content.match(/## Goal\n([\s\S]*?)(?:\n## |$)/);
  const goal = match?.[1]?.trim();
  return goal && goal.length > 0 ? goal.split("\n")[0]?.trim() : undefined;
}

export function toStoredPlanPath(cwd: string, absolutePath: string): string {
  const rel = relative(cwd, absolutePath);
  return rel.length > 0 && !rel.startsWith("..") ? rel : absolutePath;
}

function looksLikePlanPath(value: string): boolean {
  return /(?:^|\/).*\.md$/.test(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
