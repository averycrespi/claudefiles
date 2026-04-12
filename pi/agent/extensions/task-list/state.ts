export type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Task {
  id: number; // 1-based, assigned on create
  title: string;
  description: string;
  status: TaskStatus;
  startedAt?: number; // epoch ms
  completedAt?: number;
  summary?: string; // filled on completion
  failureReason?: string; // filled on failure
  activity?: string; // dim second-line text while in_progress
}

export interface TaskListState {
  tasks: Task[];
  createdAt: number;
}

/**
 * Valid status transitions. The single source of truth for the state machine.
 * Any transition not listed here throws.
 */
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_progress", "failed"],
  in_progress: ["completed", "failed"],
  failed: ["pending", "in_progress"],
  completed: [],
};

const TERMINAL: ReadonlySet<TaskStatus> = new Set(["completed", "failed"]);

export interface TaskStore {
  create(tasks: Omit<Task, "id" | "status">[]): Task[];
  add(title: string, description: string): Task;
  start(id: number): void;
  complete(id: number, summary: string): void;
  fail(id: number, reason: string): void;
  setActivity(id: number, text: string): void;
  get(id: number): Task | undefined;
  all(): Task[];
  clear(): void;
  subscribe(fn: (state: TaskListState) => void): () => void;
}

export function createStore(): TaskStore {
  let state: TaskListState = { tasks: [], createdAt: Date.now() };
  let nextId = 1;
  const subscribers = new Set<(state: TaskListState) => void>();

  const notify = () => {
    for (const fn of subscribers) fn(state);
  };

  const findTask = (id: number): Task => {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    return task;
  };

  const assertTransition = (from: TaskStatus, to: TaskStatus) => {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid transition: ${from} -> ${to}`);
    }
  };

  const transition = (task: Task, to: TaskStatus) => {
    assertTransition(task.status, to);
    // Clear activity when leaving in_progress.
    if (task.status === "in_progress" && to !== "in_progress") {
      task.activity = undefined;
    }
    task.status = to;
  };

  const store: TaskStore = {
    create(tasks) {
      if (state.tasks.length > 0) {
        const allTerminal = state.tasks.every((t) => TERMINAL.has(t.status));
        if (!allTerminal) {
          throw new Error(
            "Cannot create: existing list has pending or in_progress tasks",
          );
        }
        // Auto-clear terminal list.
        state = { tasks: [], createdAt: Date.now() };
        nextId = 1;
      }
      const created: Task[] = tasks.map((t) => ({
        id: nextId++,
        title: t.title,
        description: t.description,
        status: "pending" as TaskStatus,
      }));
      state.tasks.push(...created);
      notify();
      return created;
    },

    add(title, description) {
      const task: Task = {
        id: nextId++,
        title,
        description,
        status: "pending",
      };
      state.tasks.push(task);
      notify();
      return task;
    },

    start(id) {
      const task = findTask(id);
      transition(task, "in_progress");
      if (task.startedAt === undefined) {
        task.startedAt = Date.now();
      }
      notify();
    },

    complete(id, summary) {
      if (!summary || summary.length === 0) {
        throw new Error("complete() requires a non-empty summary");
      }
      const task = findTask(id);
      transition(task, "completed");
      task.summary = summary;
      task.completedAt = Date.now();
      notify();
    },

    fail(id, reason) {
      if (!reason || reason.length === 0) {
        throw new Error("fail() requires a non-empty reason");
      }
      const task = findTask(id);
      transition(task, "failed");
      task.failureReason = reason;
      task.completedAt = Date.now();
      notify();
    },

    setActivity(id, text) {
      const task = findTask(id);
      if (task.status !== "in_progress") {
        throw new Error(
          `setActivity requires in_progress status (got ${task.status})`,
        );
      }
      task.activity = text;
      notify();
    },

    get(id) {
      return state.tasks.find((t) => t.id === id);
    },

    all() {
      return state.tasks;
    },

    clear() {
      state = { tasks: [], createdAt: Date.now() };
      nextId = 1;
      notify();
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
  };

  return store;
}
