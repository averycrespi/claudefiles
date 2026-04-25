import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export interface RunLoggerInit {
  baseDir: string; // root, e.g. ~/.pi/workflow-runs
  workflow: string;
  slug: string | null;
  args: unknown;
  preflight: unknown;
  retainRuns?: number; // default 20
  now?: () => number;
}

export interface RunLogger {
  runDir: string; // <baseDir>/<workflow>/<timestamp>[-<slug>]
  workflowDir: string; // <runDir>/workflow/
  promptsDir: string;
  outputsDir: string;
  logEvent(opts: { type: string; payload?: Record<string, unknown> }): void;
  logWorkflow(type: string, payload?: Record<string, unknown>): void;
  recordSubagentStart(o: {
    id: number;
    intent: string;
    schema: string;
    tools: ReadonlyArray<string>;
    extensions: ReadonlyArray<string>;
    prompt: string;
    parentId?: number;
    model?: string;
    thinking?: string;
    timeoutMs?: number;
    retry?: string;
  }): void;
  recordSubagentEnd(o: {
    id: number;
    ok: boolean;
    durationMs: number;
    output?: unknown;
    reason?: "dispatch" | "parse" | "schema" | "timeout" | "aborted";
    error?: string;
  }): void;
  writePrompt(filename: string, content: string): void;
  writeOutput(filename: string, content: string): void;
  writeFinalReport(text: string): void;
  close(opts: {
    outcome: "success" | "cancelled" | "crashed";
    error: string | null;
    subagentCount?: number;
    subagentRetries?: number;
  }): Promise<void>;
}

function sidecarBase(id: number, intent: string): string {
  const intentSlug = intent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${id.toString().padStart(3, "0")}-${intentSlug || "subagent"}`;
}

function isoTs(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
}

function sanitizeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createRunLogger(init: RunLoggerInit): Promise<RunLogger> {
  const now = init.now ?? Date.now;
  const startedAtMs = now();
  const ts = isoTs(startedAtMs);
  const slugPart = init.slug ? `-${sanitizeSlug(init.slug)}` : "";
  const baseDir = join(init.baseDir, init.workflow);
  const runDir = join(baseDir, `${ts}${slugPart}`);
  mkdirSync(runDir, { recursive: true });
  const workflowDir = join(runDir, "workflow");
  const promptsDir = join(runDir, "prompts");
  const outputsDir = join(runDir, "outputs");
  for (const d of [workflowDir, promptsDir, outputsDir]) {
    mkdirSync(d, { recursive: true });
  }

  const eventsPath = join(runDir, "events.jsonl");
  let sealed = false;

  function tsString(): string {
    return new Date(now()).toISOString();
  }

  function writeLine(obj: unknown): void {
    if (sealed) return;
    appendFileSync(eventsPath, JSON.stringify(obj) + "\n");
  }

  // Apply retention after creating runDir, leaving the new run alone.
  applyRetention(baseDir, init.retainRuns ?? 20, runDir);

  // run.start
  writeLine({
    ts: tsString(),
    type: "run.start",
    workflow: init.workflow,
    cwd: process.cwd(),
    args: init.args,
    preflight: init.preflight,
  });

  function logEvent(o: {
    type: string;
    payload?: Record<string, unknown>;
  }): void {
    if (sealed) return;
    writeLine({ ts: tsString(), type: o.type, ...(o.payload ?? {}) });
  }

  function logWorkflow(type: string, payload?: Record<string, unknown>): void {
    if (sealed) return;
    writeLine({
      ts: tsString(),
      type: `${init.workflow}.${type}`,
      ...(payload ?? {}),
    });
  }

  const intentById = new Map<number, string>();

  function recordSubagentStart(o: {
    id: number;
    intent: string;
    schema: string;
    tools: ReadonlyArray<string>;
    extensions: ReadonlyArray<string>;
    prompt: string;
    parentId?: number;
    model?: string;
    thinking?: string;
    timeoutMs?: number;
    retry?: string;
  }): void {
    if (sealed) return;
    intentById.set(o.id, o.intent);
    const base = sidecarBase(o.id, o.intent);
    const promptFile = `${base}.txt`;
    writeFileSync(join(promptsDir, promptFile), o.prompt);
    writeLine({
      ts: tsString(),
      type: "subagent.start",
      id: o.id,
      intent: o.intent,
      schema: o.schema,
      tools: o.tools,
      extensions: o.extensions,
      model: o.model,
      thinking: o.thinking,
      timeout_ms: o.timeoutMs,
      retry: o.retry,
      parent_id: o.parentId,
      prompt_path: `prompts/${promptFile}`,
    });
  }

  function recordSubagentEnd(o: {
    id: number;
    ok: boolean;
    durationMs: number;
    output?: unknown;
    reason?: "dispatch" | "parse" | "schema" | "timeout" | "aborted";
    error?: string;
  }): void {
    if (sealed) return;
    const intent = intentById.get(o.id) ?? "subagent";
    const base = sidecarBase(o.id, intent);
    let outputPath: string | undefined;
    if (o.ok && o.output !== undefined) {
      const outFile = `${base}.json`;
      writeFileSync(
        join(outputsDir, outFile),
        JSON.stringify(o.output, null, 2),
      );
      outputPath = `outputs/${outFile}`;
    }
    writeLine({
      ts: tsString(),
      type: "subagent.end",
      id: o.id,
      ok: o.ok,
      duration_ms: o.durationMs,
      reason: o.reason,
      error: o.error,
      output_path: outputPath,
    });
  }

  function writePrompt(filename: string, content: string): void {
    writeFileSync(join(promptsDir, filename), content);
  }

  function writeOutput(filename: string, content: string): void {
    writeFileSync(join(outputsDir, filename), content);
  }

  function writeFinalReport(text: string): void {
    writeFileSync(join(runDir, "final-report.txt"), text);
  }

  async function close(o: {
    outcome: "success" | "cancelled" | "crashed";
    error: string | null;
    subagentCount?: number;
    subagentRetries?: number;
  }): Promise<void> {
    if (sealed) return;
    const endedAtMs = now();
    writeLine({
      ts: tsString(),
      type: "run.end",
      outcome: o.outcome,
      elapsed_ms: endedAtMs - startedAtMs,
      error: o.error,
    });
    sealed = true;
    writeFileSync(
      join(runDir, "run.json"),
      JSON.stringify(
        {
          workflow: init.workflow,
          slug: init.slug,
          started_at: new Date(startedAtMs).toISOString(),
          ended_at: new Date(endedAtMs).toISOString(),
          elapsed_ms: endedAtMs - startedAtMs,
          outcome: o.outcome,
          args: init.args,
          subagent_count: o.subagentCount ?? 0,
          subagent_retries: o.subagentRetries ?? 0,
          log_path: "events.jsonl",
          report_path: "final-report.txt",
          error: o.error,
        },
        null,
        2,
      ),
    );
  }

  return {
    runDir,
    workflowDir,
    promptsDir,
    outputsDir,
    logEvent,
    logWorkflow,
    recordSubagentStart,
    recordSubagentEnd,
    writePrompt,
    writeOutput,
    writeFinalReport,
    close,
  };
}

function applyRetention(
  baseDir: string,
  keep: number,
  currentRun: string,
): void {
  let entries: { name: string; full: string; mtimeMs: number }[];
  try {
    entries = readdirSync(baseDir)
      .map((n) => {
        const full = join(baseDir, n);
        try {
          return { name: n, full, mtimeMs: statSync(full).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(
        (e): e is { name: string; full: string; mtimeMs: number } => e !== null,
      );
  } catch {
    return;
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
  for (let i = keep; i < entries.length; i++) {
    if (entries[i].full === currentRun) continue;
    try {
      rmSync(entries[i].full, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
