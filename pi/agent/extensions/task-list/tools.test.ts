import { test } from "node:test";
import assert from "node:assert/strict";
import { taskList } from "./api.ts";
import { formatErrors, formatList, registerTools } from "./tools.ts";
import type { Task } from "./state.ts";

// ── formatList ────────────────────────────────────────────────────────

test("formatList: empty list returns '0 tasks'", () => {
  assert.equal(formatList([]), "0 tasks");
});

test("formatList: single pending task", () => {
  const tasks: Task[] = [{ id: 1, title: "Do something", status: "pending" }];
  const out = formatList(tasks);
  assert.ok(out.includes("1 task"), `header: ${out}`);
  assert.ok(
    out.includes("0 done, 0 in progress, 1 pending, 0 failed"),
    `count: ${out}`,
  );
  assert.ok(out.includes("1. Do something — pending"), `row: ${out}`);
});

test("formatList: completed task includes summary", () => {
  const tasks: Task[] = [
    {
      id: 1,
      title: "Fix bug",
      status: "completed",
      summary: "Off-by-one fixed",
    },
  ];
  const out = formatList(tasks);
  assert.ok(out.includes('summary: "Off-by-one fixed"'), `summary: ${out}`);
});

test("formatList: failed task includes reason", () => {
  const tasks: Task[] = [
    { id: 1, title: "Deploy", status: "failed", failureReason: "CI timeout" },
  ];
  const out = formatList(tasks);
  assert.ok(out.includes('reason: "CI timeout"'), `reason: ${out}`);
});

test("formatList: multiple tasks header includes done, in progress, pending, and failed counts", () => {
  const tasks: Task[] = [
    { id: 1, title: "A", status: "completed", summary: "done" },
    { id: 2, title: "B", status: "in_progress" },
    { id: 3, title: "C", status: "pending" },
    { id: 4, title: "D", status: "failed", failureReason: "boom" },
  ];
  const out = formatList(tasks);
  assert.ok(out.startsWith("4 tasks"), `header: ${out}`);
  assert.ok(
    out.includes("1 done, 1 in progress, 1 pending, 1 failed"),
    `counts: ${out}`,
  );
});

// ── formatErrors ──────────────────────────────────────────────────────

test("formatErrors: includes rejection header", () => {
  const out = formatErrors(["some error"], []);
  assert.ok(out.includes("task_list_set rejected"), `header present: ${out}`);
});

test("formatErrors: bullets each error", () => {
  const out = formatErrors(["Error A", "Error B"], []);
  assert.ok(out.includes("- Error A"), `bullet A: ${out}`);
  assert.ok(out.includes("- Error B"), `bullet B: ${out}`);
});

test("formatErrors: includes 'Current list (unchanged):' tail", () => {
  const out = formatErrors(["oops"], []);
  assert.ok(out.includes("Current list (unchanged):"), `tail present: ${out}`);
});

test("formatErrors: current list rendered after tail", () => {
  const tasks: Task[] = [{ id: 1, title: "Task A", status: "pending" }];
  const out = formatErrors(["oops"], tasks);
  const tailIdx = out.indexOf("Current list (unchanged):");
  const rowIdx = out.indexOf("1. Task A — pending");
  assert.ok(tailIdx !== -1, "tail present");
  assert.ok(rowIdx > tailIdx, "task row appears after tail");
});

// ── Tool integration ──────────────────────────────────────────────────

function makePi() {
  const registered: Array<{ name: string }> = [];
  const pi = {
    registerTool(def: { name: string }) {
      registered.push({ name: def.name });
    },
    _registered: registered,
  };
  return pi as unknown as import("@mariozechner/pi-coding-agent").ExtensionAPI & {
    _registered: typeof registered;
  };
}

test("registerTools: registers task_list_set and task_list_get", () => {
  const pi = makePi();
  registerTools(pi);
  const names = pi._registered.map((r) => r.name);
  assert.ok(
    names.includes("task_list_set"),
    `task_list_set registered: ${names}`,
  );
  assert.ok(
    names.includes("task_list_get"),
    `task_list_get registered: ${names}`,
  );
  assert.equal(names.length, 2);
});

// ── task_list_set execute ─────────────────────────────────────────────

type ToolDef = {
  name: string;
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    details: Record<string, unknown>;
  }>;
};

function captureTools(): {
  tools: Map<string, ToolDef>;
  pi: import("@mariozechner/pi-coding-agent").ExtensionAPI;
} {
  const tools = new Map<string, ToolDef>();
  const pi = {
    registerTool(def: ToolDef) {
      tools.set(def.name, def);
    },
  };
  return {
    tools,
    pi: pi as unknown as import("@mariozechner/pi-coding-agent").ExtensionAPI,
  };
}

test("task_list_set: happy path returns formatted list with header and rows", async () => {
  taskList.clear();
  const { tools, pi } = captureTools();
  registerTools(pi);

  const setTool = tools.get("task_list_set")!;
  const result = await setTool.execute(
    "1",
    {
      tasks: [
        { title: "Alpha", status: "pending" },
        { title: "Beta", status: "pending" },
      ],
    },
    undefined,
    undefined,
    undefined,
  );

  assert.equal(result.content[0].type, "text");
  const text = result.content[0].text;
  assert.ok(text.includes("2 task"), `header: ${text}`);
  assert.ok(text.includes("Alpha"), `task row: ${text}`);
  assert.ok(text.includes("Beta"), `task row: ${text}`);
  assert.equal(result.details.taskCount, 2);
  taskList.clear();
});

test("task_list_set: rejection returns formatted error text with 'Current list (unchanged):'", async () => {
  taskList.clear();
  taskList.create([{ title: "Existing" }]);
  taskList.start(1);

  const { tools, pi } = captureTools();
  registerTools(pi);

  const setTool = tools.get("task_list_set")!;
  // Omit task 1 (live — in_progress) → should reject
  const result = await setTool.execute(
    "2",
    { tasks: [{ title: "New task" }] },
    undefined,
    undefined,
    undefined,
  );

  assert.equal(result.content[0].type, "text");
  const text = result.content[0].text;
  assert.ok(
    text.includes("task_list_set rejected"),
    `rejection header: ${text}`,
  );
  assert.ok(text.includes("Current list (unchanged):"), `tail: ${text}`);
  assert.ok(result.details.rejected === true);
  taskList.clear();
});

test("task_list_get: returns same format as task_list_set success", async () => {
  taskList.clear();
  taskList.create([{ title: "Task X" }]);

  const { tools, pi } = captureTools();
  registerTools(pi);

  const getTool = tools.get("task_list_get")!;
  const result = await getTool.execute(
    "3",
    {},
    undefined,
    undefined,
    undefined,
  );

  assert.equal(result.content[0].type, "text");
  const text = result.content[0].text;
  assert.ok(text.includes("1 task"), `header: ${text}`);
  assert.ok(text.includes("Task X"), `task row: ${text}`);
  assert.equal(result.details.taskCount, 1);
  taskList.clear();
});

test("task_list_get: empty store returns '0 tasks'", async () => {
  taskList.clear();
  const { tools, pi } = captureTools();
  registerTools(pi);

  const getTool = tools.get("task_list_get")!;
  const result = await getTool.execute(
    "4",
    {},
    undefined,
    undefined,
    undefined,
  );

  assert.equal(result.content[0].text, "0 tasks");
  taskList.clear();
});
