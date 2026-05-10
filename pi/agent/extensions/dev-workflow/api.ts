import type { ThinkingLevel, WorkflowMode } from "./types.ts";

export const WORKFLOW_MODE_CHANGED_EVENT = "dev-workflow:changed";

export type WorkflowModeState = {
  mode: WorkflowMode;
  baseThinking?: ThinkingLevel;
  baselineThinking?: string;
};
