import { test } from "node:test";
import assert from "node:assert/strict";
import { taskList } from "./api.ts";
import extensionDefault from "./index.ts";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

test("test runner works", () => {
  assert.equal(1 + 1, 2);
});

// ── /task-list-clear command ──────────────────────────────────────────

type CommandHandler = (
  args: string,
  ctx: { ui: { notify: (msg: string, level: string) => void } },
) => Promise<void>;

interface WidgetCall {
  key: string;
  content: string[] | undefined;
  options?: { placement?: string };
}

interface ToolDef {
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
}

function makeStubPi() {
  const commands = new Map<string, CommandHandler>();
  const widgetCalls: WidgetCall[] = [];
  const eventHandlers = new Map<string, () => void>();
  const tools = new Map<string, ToolDef>();
  const pi = {
    hasUI: true,
    registerCommand(
      name: string,
      def: { description: string; handler: CommandHandler },
    ) {
      commands.set(name, def.handler);
    },
    registerTool(def: ToolDef) {
      tools.set(def.name, def);
    },
    on(event: string, handler: () => void) {
      eventHandlers.set(event, handler);
    },
    // Exposed at top-level on pi (accessed via `(pi as any).setWidget`).
    setWidget(
      key: string,
      content: string[] | undefined,
      options?: { placement?: string },
    ) {
      widgetCalls.push({ key, content, options });
    },
    _commands: commands,
    _widgetCalls: widgetCalls,
    _eventHandlers: eventHandlers,
    _tools: tools,
  };
  return pi as unknown as ExtensionAPI & {
    _commands: typeof commands;
    _widgetCalls: typeof widgetCalls;
    _eventHandlers: typeof eventHandlers;
    _tools: typeof tools;
  };
}

test("/task-list-clear: registered when extension loads", () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);
  assert.ok(
    pi._commands.has("task-list-clear"),
    "task-list-clear command should be registered",
  );
});

test("/task-list-clear: clears all tasks including live ones", async () => {
  taskList.clear();
  taskList.create([{ title: "Alpha" }, { title: "Beta" }]);
  taskList.start(1);
  assert.equal(taskList.all().length, 2, "setup: should have 2 tasks");

  const pi = makeStubPi();
  extensionDefault(pi);

  const notifications: Array<{ msg: string; level: string }> = [];
  const ctx = {
    ui: {
      notify(msg: string, level: string) {
        notifications.push({ msg, level });
      },
    },
  };

  const handler = pi._commands.get("task-list-clear")!;
  await handler("", ctx);

  assert.equal(
    taskList.all().length,
    0,
    "task list should be empty after clear",
  );
  taskList.clear();
});

test("/task-list-clear: emits a notification after clearing", async () => {
  taskList.clear();
  taskList.create([{ title: "Task X" }]);

  const pi = makeStubPi();
  extensionDefault(pi);

  const notifications: Array<{ msg: string; level: string }> = [];
  const ctx = {
    ui: {
      notify(msg: string, level: string) {
        notifications.push({ msg, level });
      },
    },
  };

  const handler = pi._commands.get("task-list-clear")!;
  await handler("", ctx);

  assert.equal(notifications.length, 1, "should emit exactly one notification");
  assert.ok(
    notifications[0].msg.includes("cleared"),
    `notification should mention 'cleared': ${notifications[0].msg}`,
  );
  taskList.clear();
});

// ── pi.setWidget integration ──────────────────────────────────────────

test("store mutation calls pi.setWidget with key 'task-list' and non-empty lines", () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);

  const before = pi._widgetCalls.length;
  taskList.create([{ title: "Alpha" }, { title: "Beta" }]);

  const calls = pi._widgetCalls.slice(before);
  assert.ok(calls.length >= 1, "should have called setWidget after create");

  const last = calls[calls.length - 1];
  assert.equal(last.key, "task-list");
  assert.ok(Array.isArray(last.content), "content should be a string array");
  assert.ok(
    (last.content as string[]).length > 0,
    "content should be non-empty",
  );
  assert.equal(last.options?.placement, "belowEditor");

  taskList.clear();
});

test("clearing the store calls pi.setWidget with undefined (dismisses widget)", () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);

  taskList.create([{ title: "Temp" }]);

  const before = pi._widgetCalls.length;
  taskList.clear();

  const calls = pi._widgetCalls.slice(before);
  assert.ok(calls.length >= 1, "should have called setWidget after clear");

  const last = calls[calls.length - 1];
  assert.equal(last.key, "task-list");
  assert.equal(
    last.content,
    undefined,
    "content should be undefined to dismiss",
  );
});

// ── session_shutdown handler ──────────────────────────────────────────

test("session_shutdown: dismisses widget, clears store, and unsubscribes", () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);

  // Pre-seed a task so the store is non-empty.
  taskList.create([{ title: "Pending work" }]);
  assert.equal(taskList.all().length, 1, "setup: store has one task");

  const handler = pi._eventHandlers.get("session_shutdown");
  assert.ok(handler, "session_shutdown handler should be registered");

  handler!();

  // Widget dismissed.
  const last = pi._widgetCalls[pi._widgetCalls.length - 1];
  assert.equal(last.key, "task-list");
  assert.equal(
    last.content,
    undefined,
    "setWidget should have been called with undefined to dismiss",
  );

  // Store cleared.
  assert.equal(taskList.all().length, 0, "task list should be empty");

  // Further mutations no longer trigger setWidget calls (unsubscribe happened).
  const beforeCount = pi._widgetCalls.length;
  taskList.create([{ title: "After shutdown" }]);
  assert.equal(
    pi._widgetCalls.length,
    beforeCount,
    "setWidget should not be called after unsubscribe",
  );

  taskList.clear();
});

// ── Tool ↔ widget end-to-end ──────────────────────────────────────────

test("task_list_set tool execute → reconcile → subscriber → setWidget", async () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);

  const setTool = pi._tools.get("task_list_set");
  assert.ok(setTool, "task_list_set should be registered");

  const before = pi._widgetCalls.length;
  const result = await setTool!.execute(
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

  // Tool returns expected success text.
  assert.equal(result.content[0].type, "text");
  const text = result.content[0].text;
  assert.ok(text.includes("2 task"), `header: ${text}`);
  assert.ok(text.includes("Alpha"), `Alpha row: ${text}`);
  assert.ok(text.includes("Beta"), `Beta row: ${text}`);

  // setWidget was called with key "task-list" and content mentioning the new tasks.
  const calls = pi._widgetCalls.slice(before);
  assert.ok(calls.length >= 1, "setWidget should have been called");
  const last = calls[calls.length - 1];
  assert.equal(last.key, "task-list");
  assert.ok(Array.isArray(last.content), "content should be a string array");
  const joined = (last.content as string[]).join("\n");
  assert.ok(joined.includes("Alpha"), `widget mentions Alpha: ${joined}`);
  assert.ok(joined.includes("Beta"), `widget mentions Beta: ${joined}`);

  taskList.clear();
});

// ── Rapid mutation sequence ───────────────────────────────────────────

test("rapid mutations: each state-changing call fires setWidget; last reflects final state", () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);

  const before = pi._widgetCalls.length;

  taskList.create([{ title: "a" }, { title: "b" }]);
  taskList.start(1);
  taskList.complete(1, "done");

  const calls = pi._widgetCalls.slice(before);
  // 3 state-changing operations → 3 setWidget calls (no debouncing).
  assert.equal(
    calls.length,
    3,
    `expected 3 setWidget calls, got ${calls.length}`,
  );

  for (const c of calls) {
    assert.equal(c.key, "task-list");
    assert.ok(Array.isArray(c.content), "content should be a string array");
    assert.ok(
      (c.content as string[]).length > 0,
      "each call should have non-empty content",
    );
  }

  // Last call reflects the final state: task 1 completed with summary "done".
  const last = calls[calls.length - 1];
  const joined = (last.content as string[]).join("\n");
  assert.ok(joined.includes("a"), `last widget mentions task a: ${joined}`);
  assert.ok(
    joined.includes("done") || joined.includes("completed"),
    `last widget reflects completion: ${joined}`,
  );

  taskList.clear();
});
