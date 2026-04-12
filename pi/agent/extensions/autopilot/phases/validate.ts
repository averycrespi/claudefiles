import { readFile } from "node:fs/promises";
import { parseJsonReport } from "../lib/parse.ts";
import {
  FixerReportSchema,
  ValidationReportSchema,
  type ValidationCategory,
  type ValidationReport,
} from "../lib/schemas.ts";
import type { DispatchOptions, DispatchResult } from "../lib/dispatch.ts";

const VALIDATION_PROMPT_PATH = new URL(
  "../prompts/validation.md",
  import.meta.url,
);
const FIXER_PROMPT_PATH = new URL(
  "../prompts/fixer-validation.md",
  import.meta.url,
);

type Dispatch = (opts: DispatchOptions) => Promise<DispatchResult>;

let cachedValidationPrompt: string | null = null;
let cachedFixerPrompt: string | null = null;

async function loadValidationPrompt(): Promise<string> {
  if (cachedValidationPrompt === null) {
    cachedValidationPrompt = await readFile(VALIDATION_PROMPT_PATH, "utf8");
  }
  return cachedValidationPrompt;
}

async function loadFixerPrompt(): Promise<string> {
  if (cachedFixerPrompt === null) {
    cachedFixerPrompt = await readFile(FIXER_PROMPT_PATH, "utf8");
  }
  return cachedFixerPrompt;
}

export interface RunValidationArgs {
  dispatch: Dispatch;
  cwd: string;
  /** Max number of fixer rounds allowed. Default 2. */
  maxFixRounds?: number;
}

export interface RunValidationResult {
  /** Always true — validation is non-fatal to the pipeline. */
  ok: true;
  /** Last successful parsed report, or null if all validation parses failed. */
  report: ValidationReport | null;
  /** Number of validation dispatches performed. */
  rounds: number;
  /** Human-readable summaries of unresolved failures. */
  knownIssues: string[];
}

/**
 * Formats the failing categories from a validation report into a block
 * suitable for injection into the fixer prompt.
 */
function formatFailures(report: ValidationReport): string {
  const entries: Array<[string, ValidationCategory]> = [
    ["test", report.test],
    ["lint", report.lint],
    ["typecheck", report.typecheck],
  ];
  const parts: string[] = [];
  for (const [name, cat] of entries) {
    if (cat.status !== "fail") continue;
    parts.push(
      `--- ${name} (command: ${cat.command || "<unknown>"}) ---\n${cat.output}`,
    );
  }
  return parts.join("\n\n");
}

/**
 * Collects unresolved failures from a report as short, human-readable
 * strings for the knownIssues list.
 */
function summarizeFailures(report: ValidationReport): string[] {
  const out: string[] = [];
  const entries: Array<[string, ValidationCategory]> = [
    ["test", report.test],
    ["lint", report.lint],
    ["typecheck", report.typecheck],
  ];
  for (const [name, cat] of entries) {
    if (cat.status !== "fail") continue;
    const firstLine = cat.output.split("\n")[0]?.trim() ?? "";
    const snippet = firstLine.length > 0 ? `: ${firstLine}` : "";
    out.push(`${name} failed (${cat.command || "<unknown>"})${snippet}`);
  }
  return out;
}

function allPassing(report: ValidationReport): boolean {
  return (
    report.test.status !== "fail" &&
    report.lint.status !== "fail" &&
    report.typecheck.status !== "fail"
  );
}

/**
 * Runs the validation phase with a bounded fixer loop.
 *
 * Flow per round:
 *   1. Dispatch validation subagent (read-only).
 *   2. Parse report. On parse failure, record inconclusive and return.
 *   3. If all categories pass/skipped, return success.
 *   4. Else, dispatch fixer subagent with formatted failures.
 *   5. Loop up to `maxFixRounds` validation rounds total.
 *
 * Cap semantics: `maxFixRounds` bounds the number of validation
 * dispatches. With the default of 2, we do at most validate → fix →
 * validate. After the final validation we do NOT dispatch another fixer.
 */
export async function runValidation(
  args: RunValidationArgs,
): Promise<RunValidationResult> {
  const maxFixRounds = args.maxFixRounds ?? 2;
  const validationPrompt = await loadValidationPrompt();
  const fixerTemplate = await loadFixerPrompt();

  let rounds = 0;
  let lastReport: ValidationReport | null = null;

  while (rounds < maxFixRounds) {
    rounds++;

    const validationDispatch = await args.dispatch({
      prompt: validationPrompt,
      tools: ["read", "bash", "ls", "find", "grep"],
      cwd: args.cwd,
    });

    if (!validationDispatch.ok) {
      return {
        ok: true,
        report: lastReport,
        rounds,
        knownIssues: [
          `validation inconclusive: dispatch failed (${validationDispatch.error ?? "unknown error"})`,
        ],
      };
    }

    const parsed = parseJsonReport(
      validationDispatch.stdout,
      ValidationReportSchema,
    );
    if (!parsed.ok) {
      return {
        ok: true,
        report: lastReport,
        rounds,
        knownIssues: [`validation inconclusive: ${parsed.error}`],
      };
    }

    lastReport = parsed.data;

    if (allPassing(parsed.data)) {
      return {
        ok: true,
        report: parsed.data,
        rounds,
        knownIssues: [],
      };
    }

    // We have failures. If we've already hit the round cap, surface
    // them as knownIssues without dispatching another fixer.
    if (rounds >= maxFixRounds) {
      return {
        ok: true,
        report: parsed.data,
        rounds,
        knownIssues: summarizeFailures(parsed.data),
      };
    }

    // Dispatch fixer with the formatted failures.
    const failures = formatFailures(parsed.data);
    const fixerPrompt = fixerTemplate.replace("{FAILURES}", failures);
    const fixerDispatch = await args.dispatch({
      prompt: fixerPrompt,
      tools: ["read", "edit", "write", "bash", "ls", "find", "grep"],
      extensions: ["code-feedback"],
      cwd: args.cwd,
    });

    if (!fixerDispatch.ok) {
      // Fixer dispatch itself failed; surface failures as knownIssues
      // and stop (we can't make progress without a fixer).
      return {
        ok: true,
        report: parsed.data,
        rounds,
        knownIssues: [
          `fixer dispatch failed: ${fixerDispatch.error ?? "unknown error"}`,
          ...summarizeFailures(parsed.data),
        ],
      };
    }

    // Parse the fixer report. We don't hard-fail on parse error; we
    // loop again and let the next validation reveal whether code
    // improved.
    parseJsonReport(fixerDispatch.stdout, FixerReportSchema);
    // Fall through to the next iteration (validation).
  }

  // Unreachable in practice — the loop exits via an explicit return.
  // Provided for type completeness.
  return {
    ok: true,
    report: lastReport,
    rounds,
    knownIssues: lastReport ? summarizeFailures(lastReport) : [],
  };
}
