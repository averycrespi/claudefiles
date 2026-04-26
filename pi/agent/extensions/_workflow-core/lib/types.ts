import type { TSchema, Static } from "@sinclair/typebox";

export type ToolName =
  | "read"
  | "write"
  | "edit"
  | "bash"
  | "ls"
  | "find"
  | "grep";

export type RetryPolicy = "none" | "one-retry-on-dispatch";

export interface DispatchSpec<S extends TSchema> {
  intent: string;
  prompt: string;
  schema: S;
  schemaName?: string; // for log; defaults to "<anonymous>"
  tools: ReadonlyArray<ToolName>;
  extensions?: string[];
  model?: string;
  thinking?: "low" | "medium" | "high";
  timeoutMs?: number;
  retry?: RetryPolicy;
}

export type DispatchResult<S extends TSchema> =
  | { ok: true; data: Static<S>; raw: string }
  | {
      ok: false;
      reason: "dispatch" | "parse" | "schema" | "timeout" | "aborted";
      error: string;
      raw?: string;
    };

export type ToolEvent = unknown; // forwarded from Pi; opaque to us

export interface SubagentSlot {
  id: number;
  intent: string;
  startedAt: number;
  recentEvents: ReadonlyArray<ToolEvent>;
  status: "running" | "finished";
}
