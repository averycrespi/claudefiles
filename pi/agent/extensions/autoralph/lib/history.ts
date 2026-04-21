import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
