export type TodoStatus = "todo" | "in_progress" | "done" | "blocked";

export interface TodoItem {
  id: number;
  text: string;
  status: TodoStatus;
  notes?: string;
}

export interface TodoState {
  items: TodoItem[];
  nextTodoId: number;
}

export interface TodoStore {
  list(): TodoItem[];
  getState(): TodoState;
  replaceState(state: TodoState): void;
  set(
    items: Array<{ text: string; status?: TodoStatus; notes?: string }>,
  ): TodoItem[];
  add(text: string, status?: TodoStatus, notes?: string): TodoItem;
  update(
    id: number,
    patch: { text?: string; status?: TodoStatus; notes?: string },
  ): TodoItem | undefined;
  remove(id: number): boolean;
  clear(): void;
  subscribe(listener: (state: TodoState) => void): () => void;
}

function cloneItem(item: TodoItem): TodoItem {
  return item.notes === undefined
    ? { ...item }
    : { ...item, notes: item.notes };
}

function cloneState(items: TodoItem[], nextTodoId: number): TodoState {
  return {
    items: items.map(cloneItem),
    nextTodoId,
  };
}

function normalizedNotes(notes: string | undefined): string | undefined {
  if (notes === undefined) return undefined;
  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatTodoLine(item: TodoItem): string {
  const glyph =
    item.status === "done"
      ? "[✓]"
      : item.status === "in_progress"
        ? "[~]"
        : item.status === "blocked"
          ? "[!]"
          : "[ ]";
  const suffix = item.notes ? ` · ${item.notes}` : "";
  return `${item.id}. ${glyph} ${item.text}${suffix}`;
}

export function createTodoStore(): TodoStore {
  let items: TodoItem[] = [];
  let nextTodoId = 1;
  const listeners = new Set<(state: TodoState) => void>();

  const notify = () => {
    const snapshot = cloneState(items, nextTodoId);
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  return {
    list() {
      return items.map(cloneItem);
    },

    getState() {
      return cloneState(items, nextTodoId);
    },

    replaceState(state) {
      items = state.items.map((item) => {
        const notes = normalizedNotes(item.notes);
        return {
          id: item.id,
          text: item.text,
          status: item.status,
          ...(notes ? { notes } : {}),
        };
      });
      const maxId = items.reduce(
        (highest, item) => Math.max(highest, item.id),
        0,
      );
      nextTodoId = Math.max(state.nextTodoId, maxId + 1, 1);
      notify();
    },

    set(nextItems) {
      items = [];
      nextTodoId = 1;
      for (const item of nextItems) {
        const notes = normalizedNotes(item.notes);
        items.push({
          id: nextTodoId,
          text: item.text,
          status: item.status ?? "todo",
          ...(notes ? { notes } : {}),
        });
        nextTodoId += 1;
      }
      notify();
      return items.map(cloneItem);
    },

    add(text, status = "todo", notes) {
      const normalized = normalizedNotes(notes);
      const item: TodoItem = {
        id: nextTodoId,
        text,
        status,
        ...(normalized ? { notes: normalized } : {}),
      };
      items.push(item);
      nextTodoId += 1;
      notify();
      return cloneItem(item);
    },

    update(id, patch) {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return undefined;
      if (patch.text !== undefined) item.text = patch.text;
      if (patch.status !== undefined) item.status = patch.status;
      if (patch.notes !== undefined) {
        const notes = normalizedNotes(patch.notes);
        if (notes === undefined) {
          delete item.notes;
        } else {
          item.notes = notes;
        }
      }
      notify();
      return cloneItem(item);
    },

    remove(id) {
      const before = items.length;
      items = items.filter((item) => item.id !== id);
      const removed = items.length !== before;
      if (removed) notify();
      return removed;
    },

    clear() {
      items = [];
      nextTodoId = 1;
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

export function isTodoStatus(value: unknown): value is TodoStatus {
  return (
    value === "todo" ||
    value === "in_progress" ||
    value === "done" ||
    value === "blocked"
  );
}

export function formatTodoList(items: TodoItem[]): string {
  if (items.length === 0) {
    return "Current TODO list:\n(no TODO items)";
  }
  return `Current TODO list:\n${items.map(formatTodoLine).join("\n")}`;
}
