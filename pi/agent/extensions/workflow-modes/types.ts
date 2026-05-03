export type WorkflowMode = "normal" | "plan" | "execute" | "verify";

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type WorkflowModeThinkingLevels = Record<
  Exclude<WorkflowMode, "normal">,
  ThinkingLevel
>;

export type TodoStatus = "todo" | "in_progress" | "done" | "blocked";

export type TodoItem = {
  id: number;
  text: string;
  status: TodoStatus;
  notes?: string;
};
