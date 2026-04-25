import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

interface CommandSpec {
  description?: string;
  handler: (args: string, ctx: any) => Promise<void> | void;
}

function fakePi() {
  const commands = new Map<string, CommandSpec>();
  return {
    commands,
    registerCommand(name: string, spec: CommandSpec) {
      commands.set(name, spec);
    },
    sendMessage(_m: any) {},
    waitForIdle() {},
    notify(_m: string, _level: string) {},
    hasUI: false,
    ui: { theme: undefined as any },
  };
}

import { registerWorkflow } from "./run.ts";

describe("registerWorkflow — commands + lock", () => {
  test("registers /<name>-start and /<name>-cancel", () => {
    const pi = fakePi();
    registerWorkflow(pi as any, {
      name: "demo",
      description: "demo",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async () => null,
    });
    assert.ok(pi.commands.has("demo-start"));
    assert.ok(pi.commands.has("demo-cancel"));
  });

  test("second /<name>-start while one is active fails immediately", async () => {
    const pi = fakePi();
    let resolveRun!: () => void;
    registerWorkflow(pi as any, {
      name: "demo",
      description: "demo",
      parseArgs: () => ({ ok: true, args: {} }),
      run: () =>
        new Promise<string[] | null>((r) => {
          resolveRun = () => r(null);
        }),
    });
    const start = pi.commands.get("demo-start")!;
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    let firstFinished = false;
    Promise.resolve(start.handler("", ctx)).then(() => {
      firstFinished = true;
    });
    // The handler should have returned almost immediately (detach pattern).
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(firstFinished, true);

    // Now invoke a second time while the run is still pending:
    const notifications: { msg: string; level: string }[] = [];
    const ctx2: any = {
      waitForIdle: () => {},
      ui: {
        notify: (msg: string, level: string) =>
          notifications.push({ msg, level }),
        theme: undefined,
      },
    };
    await start.handler("", ctx2);
    assert.ok(notifications.some((n) => /already active/.test(n.msg)));
    resolveRun();
    await new Promise((r) => setTimeout(r, 10));
  });

  test("/<name>-start handler returns immediately (detach pattern)", async () => {
    const pi = fakePi();
    let runEntered = false;
    let resolveRun!: () => void;
    registerWorkflow(pi as any, {
      name: "demo",
      description: "demo",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async () => {
        runEntered = true;
        await new Promise<void>((r) => {
          resolveRun = r;
        });
        return null;
      },
    });
    const start = pi.commands.get("demo-start")!;
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    const t0 = Date.now();
    await start.handler("", ctx);
    const dt = Date.now() - t0;
    // Handler returns within ~50ms even though run is still running:
    assert.ok(dt < 50, `handler took ${dt}ms (should detach)`);
    // Give run a moment to start
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(runEntered, true);
    resolveRun();
    await new Promise((r) => setTimeout(r, 10));
  });
});
