import { createStore } from "./state.ts";

export const taskList = createStore();
export type { Task, TaskStatus, TaskListState, TaskStore } from "./state.ts";
