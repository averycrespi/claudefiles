import { test } from "node:test";
import assert from "node:assert/strict";
import { taskList } from "./api.ts";
import extensionDefault from "./index.ts";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

test("test runner works", () => {
  assert.equal(1 + 1, 2);
});

type CommandHandler = (
  args: string,
  ctx: { ui: { notify: (msg: string, level: string) => void } },
) => Promise<void>;

type EventHandler = (event: unknown, ctx: unknown) => Promise<void> | void;

interface WidgetCall {
  key: string;
  content: string[] | undefined;
  options?: { placement?: string };
}

interface NotificationCall {
  msg: string;
  level: string;
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
  const eventHandlers = new Map<string, EventHandler>();
  const tools = new Map<string, ToolDef>();
  const widgetCalls: WidgetCall[] = [];
  const notifications: NotificationCall[] = [];

  const pi = {
    registerCommand(
      name: string,
      def: { description: string; handler: CommandHandler },
    ) {
      commands.set(name, def.handler);
    },
    registerTool(def: ToolDef) {
      tools.set(def.name, def);
    },
    on(event: string, handler: EventHandler) {
      eventHandlers.set(event, handler);
    },
    _commands: commands,
    _eventHandlers: eventHandlers,
    _tools: tools,
    _widgetCalls: widgetCalls,
    _notifications: notifications,
    _makeSessionCtx(hasUI = true) {
      return {
        hasUI,
        ui: {
          notify(msg: string, level: string) {
            notifications.push({ msg, level });
          },
          theme: {
            fg: (_color: string, text: string) => text,
            bold: (text: string) => text,
            strikethrough: (text: string) => text,
          },
          setWidget(
            key: string,
            content: string[] | undefined,
            options?: { placement?: string },
          ) {
            widgetCalls.push({ key, content, options });
          },
        },
      };
    },
    _makeCommandCtx() {
      return {
        ui: {
          notify(msg: string, level: string) {
            notifications.push({ msg, level });
          },
        },
      };
    },
  };

  return pi as unknown as ExtensionAPI & {
    _commands: typeof commands;
    _eventHandlers: typeof eventHandlers;
    _tools: typeof tools;
    _widgetCalls: typeof widgetCalls;
    _notifications: typeof notifications;
    _makeSessionCtx: (hasUI?: boolean) => {
      hasUI: boolean;
      ui: {
        notify: (msg: string, level: string) => void;
        theme: {
          fg: (_color: string, text: string) => string;
          bold: (text: string) => string;
          strikethrough: (text: string) => string;
        };
        setWidget: (
          key: string,
          content: string[] | undefined,
          options?: { placement?: string },
        ) => void;
      };
    };
    _makeCommandCtx: () => {
      ui: {
        notify: (msg: string, level: string) => void;
      };
    };
  };
}

async function startSession(pi: ReturnType<typeof makeStubPi>, hasUI = true) {
  const handler = pi._eventHandlers.get("session_start");
  assert.ok(handler, "session_start handler should be registered");
  await handler!(
    { type: "session_start", reason: "startup" },
    pi._makeSessionCtx(hasUI),
  );
}

async function shutdownSession(pi: ReturnType<typeof makeStubPi>) {
  const handler = pi._eventHandlers.get("session_shutdown");
  assert.ok(handler, "session_shutdown handler should be registered");
  await handler!({ type: "session_shutdown" }, pi._makeSessionCtx(true));
}

// ── /task-list-clear command ──────────────────────────────────────────

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

  const handler = pi._commands.get("task-list-clear")!;
  await handler("", pi._makeCommandCtx());

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

  const handler = pi._commands.get("task-list-clear")!;
  await handler("", pi._makeCommandCtx());

  assert.equal(
    pi._notifications.length,
    1,
    "should emit exactly one notification",
  );
  assert.ok(
    pi._notifications[0].msg.includes("cleared"),
    `notification should mention 'cleared': ${pi._notifications[0].msg}`,
  );
  taskList.clear();
});

// ── ctx.ui.setWidget integration ─────────────────────────────────────

test("store mutation calls ctx.ui.setWidget with key 'task-list' and non-empty lines", async () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);
  await startSession(pi);

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

test("session_start uses ctx.ui.setWidget even when ExtensionAPI has no top-level widget methods", async () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);

  await startSession(pi);
  taskList.create([{ title: "Task from ctx.ui" }]);

  const last = pi._widgetCalls[pi._widgetCalls.length - 1];
  assert.equal(last.key, "task-list");
  assert.ok(Array.isArray(last.content), "content should be a string array");
  assert.ok(
    (last.content as string[]).join("\n").includes("Task from ctx.ui"),
    "widget should render via ctx.ui.setWidget",
  );

  taskList.clear();
});

test("clearing the store calls ctx.ui.setWidget with undefined (dismisses widget)", async () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);
  await startSession(pi);

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

test("session_shutdown: dismisses widget, clears store, and unsubscribes", async () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);
  await startSession(pi);

  taskList.create([{ title: "Pending work" }]);
  assert.equal(taskList.all().length, 1, "setup: store has one task");

  await shutdownSession(pi);

  const last = pi._widgetCalls[pi._widgetCalls.length - 1];
  assert.equal(last.key, "task-list");
  assert.equal(
    last.content,
    undefined,
    "setWidget should have been called with undefined to dismiss",
  );

  assert.equal(taskList.all().length, 0, "task list should be empty");

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
  await startSession(pi);

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

  assert.equal(result.content[0].type, "text");
  const text = result.content[0].text;
  assert.ok(text.includes("2 task"), `header: ${text}`);
  assert.ok(text.includes("Alpha"), `Alpha row: ${text}`);
  assert.ok(text.includes("Beta"), `Beta row: ${text}`);

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

test("rapid mutations: each state-changing call fires setWidget; last reflects final state", async () => {
  taskList.clear();
  const pi = makeStubPi();
  extensionDefault(pi);
  await startSession(pi);

  const before = pi._widgetCalls.length;

  taskList.create([{ title: "a" }, { title: "b" }]);
  taskList.start(1);
  taskList.complete(1, "done");

  const calls = pi._widgetCalls.slice(before);
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

  const last = calls[calls.length - 1];
  const joined = (last.content as string[]).join("\n");
  assert.ok(joined.includes("a"), `last widget mentions task a: ${joined}`);
  assert.ok(
    joined.includes("done") || joined.includes("completed"),
    `last widget reflects completion: ${joined}`,
  );

  taskList.clear();
});
