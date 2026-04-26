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

function makeStubPi() {
  const commands = new Map<string, CommandHandler>();
  const pi = {
    registerCommand(
      name: string,
      def: { description: string; handler: CommandHandler },
    ) {
      commands.set(name, def.handler);
    },
    registerTool() {},
    registerMessageRenderer() {},
    sendMessage() {},
    on() {},
    _commands: commands,
  };
  return pi as unknown as ExtensionAPI & { _commands: typeof commands };
}

test("/task-list-clear: registered when extension loads", () => {
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
