export type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Task {
  id: number; // 1-based, assigned on create
  title: string;
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

export type ReconcilePayload = Array<{
  id?: number;
  title: string;
  status?: TaskStatus;
  summary?: string;
  failureReason?: string;
}>;

export type ReconcileResult =
  | { ok: true; tasks: Task[] }
  | { ok: false; errors: string[] };

export interface TaskStore {
  create(tasks: { title: string }[]): Task[];
  add(title: string): Task;
  start(id: number): void;
  complete(id: number, summary: string): void;
  fail(id: number, reason: string): void;
  setActivity(id: number, text: string): void;
  get(id: number): Task | undefined;
  all(): Task[];
  clear(): void;
  subscribe(fn: (state: TaskListState) => void): () => void;
  reconcile(payload: ReconcilePayload): ReconcileResult;
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
          const pending = state.tasks.filter(
            (t) => t.status === "pending",
          ).length;
          const inProgress = state.tasks.filter(
            (t) => t.status === "in_progress",
          ).length;
          const live = pending + inProgress;
          const taskWord = live === 1 ? "task" : "tasks";
          throw new Error(
            `Task list has ${live} live ${taskWord} (${pending} pending, ${inProgress} in_progress). Complete or fail them via task_list_set, or run /task-list-clear to drop them.`,
          );
        }
        // Auto-clear terminal list.
        state = { tasks: [], createdAt: Date.now() };
        nextId = 1;
      }
      const created: Task[] = tasks.map((t) => ({
        id: nextId++,
        title: t.title,
        status: "pending" as TaskStatus,
      }));
      state.tasks.push(...created);
      notify();
      return created;
    },

    add(title) {
      const task: Task = {
        id: nextId++,
        title,
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

    reconcile(payload) {
      const errors: string[] = [];

      // --- Step 1: Validate payload items up front (collect all errors) ---

      // Detect duplicate ids in payload
      const seenIds = new Set<number>();
      for (const item of payload) {
        if (item.id !== undefined) {
          if (seenIds.has(item.id)) {
            errors.push(`Duplicate id ${item.id} in payload`);
          } else {
            seenIds.add(item.id);
          }
        }
      }

      for (const item of payload) {
        if (item.id !== undefined) {
          // Unknown id
          const existing = state.tasks.find((t) => t.id === item.id);
          if (!existing) {
            errors.push(`Task id ${item.id} not found in store`);
            continue; // can't validate transition without a task
          }

          // Validate transition (only when status is specified and different)
          const targetStatus = item.status ?? existing.status;
          if (targetStatus !== existing.status) {
            const allowed = VALID_TRANSITIONS[existing.status];
            if (!allowed.includes(targetStatus)) {
              errors.push(
                `Task ${item.id} ("${existing.title}"): cannot transition ${existing.status} → ${targetStatus}`,
              );
            }
          }
        }

        // Missing summary when completed
        if (item.status === "completed" && !item.summary) {
          const label =
            item.id !== undefined ? `Task ${item.id}` : `"${item.title}"`;
          errors.push(`${label}: status is "completed" but summary is missing`);
        }

        // Missing failureReason when failed
        if (item.status === "failed" && !item.failureReason) {
          const label =
            item.id !== undefined ? `Task ${item.id}` : `"${item.title}"`;
          errors.push(
            `${label}: status is "failed" but failureReason is missing`,
          );
        }
      }

      // --- Step 2: Compute omitted tasks ---

      const payloadIds = new Set(
        payload.filter((i) => i.id !== undefined).map((i) => i.id as number),
      );
      const omitted = state.tasks.filter((t) => !payloadIds.has(t.id));
      const liveOmissions = omitted.filter((t) => !TERMINAL.has(t.status));
      const terminalOmissions = omitted.filter((t) => TERMINAL.has(t.status));

      if (liveOmissions.length > 0) {
        const list = liveOmissions
          .map((t) => `${t.id} ("${t.title}")`)
          .join(", ");
        errors.push(`Live tasks omitted from payload: ${list}`);
      }

      // --- Step 3: Reject if any errors ---

      if (errors.length > 0) {
        return { ok: false, errors };
      }

      // --- Step 4: Apply changes atomically ---

      // Drop terminal omissions
      const terminalOmissionIds = new Set(terminalOmissions.map((t) => t.id));
      state = {
        ...state,
        tasks: state.tasks.filter((t) => !terminalOmissionIds.has(t.id)),
      };

      // Apply transitions and field updates to carried tasks
      for (const item of payload) {
        if (item.id === undefined) continue;
        const task = state.tasks.find((t) => t.id === item.id)!;
        const oldStatus = task.status;
        const targetStatus = item.status ?? task.status;

        if (targetStatus !== oldStatus) {
          // Clear activity when leaving in_progress
          if (oldStatus === "in_progress") {
            task.activity = undefined;
          }
          task.status = targetStatus;

          if (targetStatus === "in_progress" && task.startedAt === undefined) {
            task.startedAt = Date.now();
          }

          if (targetStatus === "completed") {
            task.summary = item.summary;
            task.completedAt = Date.now();
          }

          if (targetStatus === "failed") {
            task.failureReason = item.failureReason;
            task.completedAt = Date.now();
          }
        }
      }

      // Append new tasks (no id in payload) with auto-assigned ids
      const maxId = state.tasks.reduce(
        (max, t) => Math.max(max, t.id),
        nextId - 1,
      );
      let assignId = maxId + 1;
      for (const item of payload) {
        if (item.id !== undefined) continue;
        const newTask: Task = {
          id: assignId++,
          title: item.title,
          status: item.status ?? "pending",
        };
        if (newTask.status === "completed") {
          newTask.summary = item.summary;
          newTask.completedAt = Date.now();
        }
        if (newTask.status === "failed") {
          newTask.failureReason = item.failureReason;
          newTask.completedAt = Date.now();
        }
        state.tasks.push(newTask);
        nextId = assignId;
      }

      notify();
      return { ok: true, tasks: state.tasks };
    },
  };

  return store;
}
