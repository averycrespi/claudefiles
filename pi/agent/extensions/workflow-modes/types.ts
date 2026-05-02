export type WorkflowMode = "normal" | "plan" | "execute" | "verify";

export type TodoStatus = "todo" | "in_progress" | "done" | "blocked";

export type TodoItem = {
  id: number;
  text: string;
  status: TodoStatus;
  notes?: string;
};
