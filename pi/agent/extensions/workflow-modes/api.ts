import type { WorkflowMode } from "./types.ts";

export const WORKFLOW_MODE_CHANGED_EVENT = "workflow-modes:changed";

export type WorkflowModeState = {
  mode: WorkflowMode;
  baseThinking?: "medium" | "high" | "low";
  baselineThinking?: string;
};
