export type GoalStatus = "active" | "paused" | "complete";

export interface Goal {
  id: string;
  objective: string;
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  completionEvidence?: string;
}

export interface GoalState {
  goal?: Goal;
}

export interface GoalStore {
  getGoal(): Goal | undefined;
  getState(): GoalState;
  replaceState(state: GoalState): void;
  setGoal(objective: string, maxChars: number): Goal;
  pause(): Goal | undefined;
  resume(): Goal | undefined;
  complete(evidence: string, maxChars: number): Goal | undefined;
  clear(): void;
  subscribe(listener: (state: GoalState) => void): () => void;
}

function cloneGoal(goal: Goal): Goal {
  return { ...goal };
}

function cloneState(goal: Goal | undefined): GoalState {
  return goal ? { goal: cloneGoal(goal) } : {};
}

export function isGoalStatus(value: unknown): value is GoalStatus {
  return value === "active" || value === "paused" || value === "complete";
}

export function normalizeBoundedText(
  value: unknown,
  maxChars: number,
  label: string,
): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${label} is required.`);
  if (trimmed.length > maxChars) {
    throw new Error(`${label} must be at most ${maxChars} characters.`);
  }
  return trimmed;
}

export function createGoalStore(
  now: () => number = () => Date.now(),
): GoalStore {
  let goal: Goal | undefined;
  let nextId = 1;
  const listeners = new Set<(state: GoalState) => void>();

  const notify = () => {
    const state = cloneState(goal);
    for (const listener of listeners) listener(state);
  };

  return {
    getGoal() {
      return goal ? cloneGoal(goal) : undefined;
    },

    getState() {
      return cloneState(goal);
    },

    replaceState(state) {
      goal = state.goal ? cloneGoal(state.goal) : undefined;
      notify();
    },

    setGoal(objective, maxChars) {
      const timestamp = now();
      goal = {
        id: `goal-${timestamp}-${nextId}`,
        objective: normalizeBoundedText(objective, maxChars, "Objective"),
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      nextId += 1;
      notify();
      return cloneGoal(goal);
    },

    pause() {
      if (!goal) return undefined;
      goal = { ...goal, status: "paused", updatedAt: now() };
      notify();
      return cloneGoal(goal);
    },

    resume() {
      if (!goal) return undefined;
      goal = { ...goal, status: "active", updatedAt: now() };
      notify();
      return cloneGoal(goal);
    },

    complete(evidence, maxChars) {
      if (!goal) return undefined;
      const timestamp = now();
      goal = {
        ...goal,
        status: "complete",
        updatedAt: timestamp,
        completedAt: timestamp,
        completionEvidence: normalizeBoundedText(
          evidence,
          maxChars,
          "Evidence",
        ),
      };
      notify();
      return cloneGoal(goal);
    },

    clear() {
      goal = undefined;
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function parseGoal(value: unknown): Goal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.objective !== "string" ||
    candidate.objective.trim().length === 0 ||
    !isGoalStatus(candidate.status) ||
    typeof candidate.createdAt !== "number" ||
    typeof candidate.updatedAt !== "number"
  ) {
    return undefined;
  }
  if (
    candidate.completedAt !== undefined &&
    typeof candidate.completedAt !== "number"
  ) {
    return undefined;
  }
  if (
    candidate.completionEvidence !== undefined &&
    typeof candidate.completionEvidence !== "string"
  ) {
    return undefined;
  }
  if (candidate.status === "complete" && !candidate.completionEvidence) {
    return undefined;
  }
  return {
    id: candidate.id,
    objective: candidate.objective,
    status: candidate.status,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    ...(typeof candidate.completedAt === "number"
      ? { completedAt: candidate.completedAt }
      : {}),
    ...(typeof candidate.completionEvidence === "string"
      ? { completionEvidence: candidate.completionEvidence }
      : {}),
  };
}

export function parsePersistedGoalState(value: unknown): GoalState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const goalValue = (value as { goal?: unknown }).goal;
  if (goalValue === undefined) return {};
  const goal = parseGoal(goalValue);
  return goal ? { goal } : undefined;
}

export function formatGoalState(state: GoalState): string {
  if (!state.goal) return "No goal is set.";
  const lines = [`Goal [${state.goal.status}] ${state.goal.objective}`];
  if (state.goal.status === "complete" && state.goal.completionEvidence) {
    lines.push(`Evidence: ${state.goal.completionEvidence}`);
  }
  return lines.join("\n");
}
