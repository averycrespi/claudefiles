export { registerWorkflow } from "./lib/run.ts";
export type { WorkflowDefinition, RegisterWorkflowOpts } from "./lib/run.ts";

export { createSubagent } from "./lib/subagent.ts";
export type { Subagent, CreateSubagentOpts } from "./lib/subagent.ts";

export { createWidget } from "./lib/widget.ts";
export type {
  Widget,
  WidgetUi,
  WidgetTheme,
  CreateWidgetOpts,
} from "./lib/widget.ts";

export { parseJsonReport } from "./lib/parse.ts";
export type { ParseResult } from "./lib/parse.ts";

export type {
  DispatchSpec,
  DispatchResult,
  RetryPolicy,
  ToolName,
  ToolEvent,
  SubagentSlot,
} from "./lib/types.ts";

import type { Subagent } from "./lib/subagent.ts";
import type { Widget } from "./lib/widget.ts";

// RunContext is the shape passed to `run()`. We export it as a type
// reference for workflow authors, even though they don't construct it.
export type RunContext<Args = unknown, Pre = unknown> = {
  args: Args;
  cwd: string;
  signal: AbortSignal;
  preflight: Pre;
  subagent: Subagent;
  widget: Widget;
  ui: import("@mariozechner/pi-coding-agent").ExtensionAPI;
  startedAt: number;
  log(type: string, payload?: Record<string, unknown>): void;
  workflowDir: string;
};
