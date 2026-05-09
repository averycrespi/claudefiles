import { appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

export type SpecEventType =
  | "spec_created"
  | "artifact_written"
  | "runtime_compiled"
  | "challenge_started"
  | "challenge_completed"
  | "approved"
  | "phase_started"
  | "compaction_skipped"
  | "compaction_started"
  | "compaction_completed"
  | "compaction_failed"
  | "task_started"
  | "validation_run"
  | "amendment_recorded"
  | "boundary_violation_recorded"
  | "task_committed"
  | "commit_skipped"
  | "task_completed"
  | "verify_started"
  | "finding_recorded"
  | "fix_round_started"
  | "report_written"
  | "aborted";

export type SpecEvent = {
  type: SpecEventType;
  timestamp: string;
  [key: string]: unknown;
};

export type ParsedEvents = {
  events: SpecEvent[];
  corruptLines: Array<{ line: number; text: string }>;
};

export async function appendSpecEvent(
  eventsPath: string,
  event: SpecEvent,
): Promise<void> {
  await withFileMutationQueue(eventsPath, async () => {
    await mkdir(dirname(eventsPath), { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
  });
}

export async function readSpecEvents(
  eventsPath: string,
): Promise<ParsedEvents> {
  let content = "";
  try {
    content = await readFile(eventsPath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return { events: [], corruptLines: [] };
    throw error;
  }

  const events: SpecEvent[] = [];
  const corruptLines: Array<{ line: number; text: string }> = [];
  content.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line) as SpecEvent;
      if (
        typeof parsed.type === "string" &&
        typeof parsed.timestamp === "string"
      ) {
        events.push(parsed);
      } else {
        corruptLines.push({ line: index + 1, text: line });
      }
    } catch {
      corruptLines.push({ line: index + 1, text: line });
    }
  });
  return { events, corruptLines };
}

export function createEvent(
  type: SpecEventType,
  data: Record<string, unknown> = {},
  now = new Date(),
): SpecEvent {
  return { type, ...data, timestamp: now.toISOString() };
}
