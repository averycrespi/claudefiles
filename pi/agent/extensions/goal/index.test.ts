import { test } from "node:test";
import assert from "node:assert/strict";
import { createGoalExtension } from "./index.ts";

function makePi() {
  const commands = new Map<string, any>();
  const handlers = new Map<string, any>();
  const widgets: Array<{ key: string; content: any }> = [];
  const entries: Array<{ type: string; data: unknown }> = [];
  return {
    hasUI: true,
    commands,
    handlers,
    widgets,
    entries,
    registerCommand(name: string, command: any) {
      commands.set(name, command);
    },
    registerTool() {},
    on(name: string, handler: any) {
      handlers.set(name, handler);
    },
    setWidget(key: string, content: any) {
      widgets.push({ key, content });
    },
    appendEntry(type: string, data: unknown) {
      entries.push({ type, data });
    },
  } as any;
}

function makeCtx(branch: unknown[] = []) {
  const notifications: Array<{ msg: string; level: string }> = [];
  return {
    cwd: "/repo",
    hasUI: true,
    notifications,
    ui: {
      notify(msg: string, level: string) {
        notifications.push({ msg, level });
      },
      setWidget() {},
    },
    sessionManager: { getBranch: () => branch },
  } as any;
}

test("commands mutate goal state and persist snapshots", async () => {
  const pi = makePi();
  const ctx = makeCtx();
  createGoalExtension({
    loadConfig: async () => ({
      config: {
        injectActiveGoal: true,
        showWidget: true,
        objectiveMaxChars: 100,
        evidenceMaxChars: 100,
        compactSummaryEnabled: true,
        checkpointCommits: true,
        showUsage: true,
      },
      warnings: [],
    }),
  })(pi);
  await pi.handlers.get("session_start")({}, ctx);

  await pi.commands.get("goal-set").handler("  Ship goal extension  ", ctx);
  assert.match(
    ctx.notifications.at(-1)?.msg,
    /Goal \[active\] Ship goal extension/,
  );
  assert.equal(pi.entries.at(-1)?.type, "goal-state");

  await pi.commands.get("goal-pause").handler("", ctx);
  assert.match(ctx.notifications.at(-1)?.msg, /Goal \[paused\]/);

  await pi.commands.get("goal-resume").handler("", ctx);
  assert.match(ctx.notifications.at(-1)?.msg, /Goal \[active\]/);

  await pi.commands.get("goal-clear").handler("", ctx);
  assert.match(ctx.notifications.at(-1)?.msg, /cleared/i);
});

test("restore scans branch snapshots and before_agent_start injects only active goals", async () => {
  const pi = makePi();
  const branch = [
    {
      type: "custom",
      customType: "goal-state",
      data: {
        goal: {
          id: "g1",
          objective: "Finish docs",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
      },
    },
  ];
  const ctx = makeCtx(branch);
  createGoalExtension({
    loadConfig: async () => ({
      config: {
        injectActiveGoal: true,
        showWidget: false,
        objectiveMaxChars: 100,
        evidenceMaxChars: 100,
        compactSummaryEnabled: true,
        checkpointCommits: true,
        showUsage: true,
      },
      warnings: [],
    }),
  })(pi);
  await pi.handlers.get("session_start")({}, ctx);

  const result = await pi.handlers.get("before_agent_start")(
    { systemPrompt: "base" },
    ctx,
  );
  assert.match(result.systemPrompt, /Active Goal/);
  assert.match(result.systemPrompt, /Finish docs/);
  assert.match(result.systemPrompt, /TODOs are done/i);
  assert.match(result.systemPrompt, /commit/i);
  assert.match(result.systemPrompt, /Stage files by name/i);
});

test("compaction returns goal-aware summary when enabled", async () => {
  const pi = makePi();
  const ctx = makeCtx();
  createGoalExtension({
    loadConfig: async () => ({
      config: {
        injectActiveGoal: true,
        showWidget: false,
        objectiveMaxChars: 100,
        evidenceMaxChars: 100,
        compactSummaryEnabled: true,
        checkpointCommits: true,
        showUsage: true,
      },
      warnings: [],
    }),
  })(pi);
  await pi.handlers.get("session_start")({}, ctx);
  await pi.commands.get("goal-set").handler("Finish compaction", ctx);

  const result = await pi.handlers.get("session_before_compact")(
    { preparation: { firstKeptEntryId: "e1", tokensBefore: 123 } },
    ctx,
  );
  assert.equal(result.compaction.firstKeptEntryId, "e1");
  assert.match(result.compaction.summary, /## Active Goal/);
  assert.match(result.compaction.summary, /Finish compaction/);
});

test("before_agent_start omits commit guidance when checkpointCommits is disabled", async () => {
  const pi = makePi();
  const ctx = makeCtx([
    {
      type: "custom",
      customType: "goal-state",
      data: {
        goal: {
          id: "g1",
          objective: "Finish docs",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
      },
    },
  ]);
  createGoalExtension({
    loadConfig: async () => ({
      config: {
        injectActiveGoal: true,
        showWidget: false,
        objectiveMaxChars: 100,
        evidenceMaxChars: 100,
        compactSummaryEnabled: true,
        checkpointCommits: false,
        showUsage: true,
      },
      warnings: [],
    }),
  })(pi);
  await pi.handlers.get("session_start")({}, ctx);

  const result = await pi.handlers.get("before_agent_start")(
    { systemPrompt: "base" },
    ctx,
  );

  assert.doesNotMatch(result.systemPrompt, /Stage files by name/i);
});


test("message_end records usage for active goals", async () => {
  const pi = makePi();
  const ctx = makeCtx();
  createGoalExtension({
    loadConfig: async () => ({
      config: {
        injectActiveGoal: true,
        showWidget: false,
        objectiveMaxChars: 100,
        evidenceMaxChars: 100,
        compactSummaryEnabled: true,
        checkpointCommits: true,
        showUsage: true,
      },
      warnings: [],
    }),
  })(pi);
  await pi.handlers.get("session_start")({}, ctx);
  await pi.commands.get("goal-set").handler("Track usage", ctx);

  await pi.handlers.get("message_end")({ message: { role: "assistant", usage: { totalTokens: 250 } } }, ctx);
  await pi.commands.get("goal-show").handler("", ctx);

  assert.match(ctx.notifications.at(-1)?.msg, /250 tokens/);
  assert.match(ctx.notifications.at(-1)?.msg, /1 turn/);
});
