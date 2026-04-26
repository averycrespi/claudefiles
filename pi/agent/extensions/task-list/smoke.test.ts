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

function makeStubPi() {
  const commands = new Map<string, CommandHandler>();
  const widgetCalls: WidgetCall[] = [];
  const pi = {
    registerCommand(
      name: string,
      def: { description: string; handler: CommandHandler },
    ) {
      commands.set(name, def.handler);
    },
    registerTool() {},
    on() {},
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
  };
  return pi as unknown as ExtensionAPI & {
    _commands: typeof commands;
    _widgetCalls: typeof widgetCalls;
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
