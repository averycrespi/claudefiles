import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

describe("registerWorkflow — preflight", () => {
  test("preflight failure aborts before run() is called", async () => {
    const pi = fakePi();
    let runCalled = false;
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      preflight: async () => ({ ok: false, error: "missing file" }),
      run: async () => {
        runCalled = true;
        return null;
      },
    });
    const notes: any[] = [];
    const ctx = {
      waitForIdle: () => {},
      ui: {
        notify: (m: string, l: string) => notes.push({ m, l }),
        theme: undefined,
      },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(runCalled, false);
    assert.ok(notes.some((n) => /missing file/.test(n.m)));
  });

  test("preflight success passes data through to run()", async () => {
    const pi = fakePi();
    let seenPreflight: any = null;
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      preflight: async () => ({ ok: true, data: { foo: "bar" } }),
      run: async (ctx: any) => {
        seenPreflight = ctx.preflight;
        return null;
      },
    });
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(seenPreflight, { foo: "bar" });
  });
});

describe("registerWorkflow — abort", () => {
  test("/<name>-cancel aborts the controller signal seen by run()", async () => {
    const pi = fakePi();
    let signalSeen!: AbortSignal;
    let resolveRun!: () => void;
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async (ctx: any) => {
        signalSeen = ctx.signal;
        await new Promise<void>((r) => {
          ctx.signal.addEventListener("abort", () => {
            r();
          });
          resolveRun = r;
        });
        return null;
      },
    });
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(signalSeen.aborted, false);
    await pi.commands.get("d-cancel")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(signalSeen.aborted, true);
    resolveRun();
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe("registerWorkflow — RunContext wiring", () => {
  test("dispatch through ctx.subagent allocates and frees a widget slot", async () => {
    const pi = fakePi();
    const seenSlots: any[][] = [];
    const fakeSpawn = async () => ({
      ok: true,
      aborted: false,
      stdout: `{}`,
      stderr: "",
      exitCode: 0,
      signal: null,
    });
    const { Type } = await import("@sinclair/typebox");
    const Schema = Type.Object({});
    registerWorkflow(
      pi as any,
      {
        name: "d",
        description: "",
        parseArgs: () => ({ ok: true, args: {} }),
        run: async (ctx: any) => {
          const dispatchPromise = ctx.subagent.dispatch({
            intent: "Plan",
            prompt: "x",
            schema: Schema,
            tools: [],
          });
          // Capture mid-flight slot state
          await new Promise((r) => setTimeout(r, 5));
          seenSlots.push([...ctx.widget.subagents]);
          await dispatchPromise;
          seenSlots.push([...ctx.widget.subagents]);
          return null;
        },
      },
      { spawn: fakeSpawn as any },
    );
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 50));
    // First snapshot: a slot was allocated (may already be finished if spawn was instant)
    assert.ok(seenSlots[0].length >= 1);
    // Second snapshot: the slot is finished
    assert.equal(
      seenSlots[1].every((s) => s.status === "finished"),
      true,
    );
  });

  test("ctx exposes subagent and widget", async () => {
    const pi = fakePi();
    let seenSubagent: any = null;
    let seenWidget: any = null;
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async (ctx: any) => {
        seenSubagent = ctx.subagent;
        seenWidget = ctx.widget;
        return null;
      },
    });
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(seenSubagent);
    assert.ok(seenWidget);
    assert.equal(typeof seenSubagent.dispatch, "function");
    assert.equal(typeof seenWidget.setBody, "function");
  });
});

describe("registerWorkflow — report emission", () => {
  test("string[] return is sent via pi.sendMessage with customType=<name>-report", async () => {
    const pi = fakePi();
    const messages: any[] = [];
    pi.sendMessage = (m: any) => {
      messages.push(m);
    };
    const tmpRoot = mkdtempSync(join(tmpdir(), "wc-rep-"));
    registerWorkflow(
      pi as any,
      {
        name: "d",
        description: "",
        parseArgs: () => ({ ok: true, args: {} }),
        run: async () => ["line one", "line two"],
      },
      { logBaseDir: tmpRoot } as any,
    );
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].customType, "d-report");
    const text: string = messages[0].content[0].text;
    assert.match(text, /^line one\nline two/);
    rmSync(tmpRoot, { recursive: true });
  });

  test("framework appends 'Log: <path>' line when emitLogPath defaults true", async () => {
    const pi = fakePi();
    const messages: any[] = [];
    pi.sendMessage = (m: any) => {
      messages.push(m);
    };
    const tmpRoot = mkdtempSync(join(tmpdir(), "wc-rep-"));
    registerWorkflow(
      pi as any,
      {
        name: "d",
        description: "",
        parseArgs: () => ({ ok: true, args: {} }),
        run: async () => ["body"],
      },
      { logBaseDir: tmpRoot } as any,
    );
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    const text: string = messages[0].content[0].text;
    assert.match(text, /\nLog:\s+.*\/d\//);
    rmSync(tmpRoot, { recursive: true });
  });

  test("emitLogPath:false suppresses the Log line", async () => {
    const pi = fakePi();
    const messages: any[] = [];
    pi.sendMessage = (m: any) => {
      messages.push(m);
    };
    const tmpRoot = mkdtempSync(join(tmpdir(), "wc-rep-"));
    registerWorkflow(
      pi as any,
      {
        name: "d",
        description: "",
        parseArgs: () => ({ ok: true, args: {} }),
        run: async () => ["body"],
        emitLogPath: false,
      },
      { logBaseDir: tmpRoot } as any,
    );
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    const text: string = messages[0].content[0].text;
    assert.doesNotMatch(text, /\nLog:/);
    rmSync(tmpRoot, { recursive: true });
  });

  test("null return suppresses both the report and the log line", async () => {
    const pi = fakePi();
    const messages: any[] = [];
    pi.sendMessage = (m: any) => {
      messages.push(m);
    };
    const tmpRoot = mkdtempSync(join(tmpdir(), "wc-rep-"));
    registerWorkflow(
      pi as any,
      {
        name: "d",
        description: "",
        parseArgs: () => ({ ok: true, args: {} }),
        run: async () => null,
      },
      { logBaseDir: tmpRoot } as any,
    );
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(messages.length, 0);
    rmSync(tmpRoot, { recursive: true });
  });

  test("writes final-report.txt to runDir", async () => {
    const pi = fakePi();
    pi.sendMessage = () => {};
    const tmpRoot = mkdtempSync(join(tmpdir(), "wc-rep-"));
    let runDir = "";
    registerWorkflow(
      pi as any,
      {
        name: "d",
        description: "",
        parseArgs: () => ({ ok: true, args: {} }),
        run: async (ctx: any) => {
          runDir = ctx.workflowDir.replace(/\/workflow$/, "");
          return ["body"];
        },
      },
      { logBaseDir: tmpRoot } as any,
    );
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    const final = readFileSync(join(runDir, "final-report.txt"), "utf8");
    assert.match(final, /^body/);
    rmSync(tmpRoot, { recursive: true });
  });

  test("ctx.log writes a workflow-prefixed event into events.jsonl", async () => {
    const pi = fakePi();
    pi.sendMessage = () => {};
    const tmpRoot = mkdtempSync(join(tmpdir(), "wc-rep-"));
    let runDir = "";
    registerWorkflow(
      pi as any,
      {
        name: "wf",
        description: "",
        parseArgs: () => ({ ok: true, args: {} }),
        run: async (ctx: any) => {
          runDir = ctx.workflowDir.replace(/\/workflow$/, "");
          ctx.log("hello", { foo: 1 });
          return null;
        },
      },
      { logBaseDir: tmpRoot } as any,
    );
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("wf-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    const lines = readFileSync(join(runDir, "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.ok(lines.find((l: any) => l.type === "wf.hello" && l.foo === 1));
    rmSync(tmpRoot, { recursive: true });
  });
});
