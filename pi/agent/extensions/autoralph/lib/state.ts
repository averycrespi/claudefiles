import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// --- Handoff ---

export async function readHandoff(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.handoff === "string"
    ) {
      return parsed.handoff;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeHandoff(
  path: string,
  handoff: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ handoff }, null, 2), "utf8");
}

// --- History ---

export type IterationOutcome =
  | "in_progress"
  | "complete"
  | "failed"
  | "timeout"
  | "parse_error"
  | "dispatch_error";

export interface IterationRecord {
  iteration: number;
  outcome: IterationOutcome;
  summary: string;
  headBefore: string;
  headAfter: string;
  durationMs: number;
  reflection: boolean;
}

export async function readHistory(path: string): Promise<IterationRecord[]> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendHistory(
  path: string,
  record: IterationRecord,
): Promise<void> {
  const existing = await readHistory(path);
  existing.push(record);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), "utf8");
}
