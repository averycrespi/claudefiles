import { test } from "node:test";
import assert from "node:assert/strict";
import { createSpecWorkflowExtension } from "./index.ts";

function makePi() {
  const commands = new Map<string, any>();
  const handlers = new Map<string, any>();
  return {
    commands,
    handlers,
    registerCommand(name: string, command: any) {
      commands.set(name, command);
    },
    on(name: string, handler: any) {
      handlers.set(name, handler);
    },
  } as any;
}

function makeCtx() {
  const notifications: Array<{ msg: string; level: string }> = [];
  return {
    cwd: "/repo",
    hasUI: true,
    ui: {
      notify(msg: string, level: string) {
        notifications.push({ msg, level });
      },
    },
    notifications,
  } as any;
}

test("spec workflow registers commands and injects active phase contract", async () => {
  const pi = makePi();
  const ctx = makeCtx();
  createSpecWorkflowExtension({
    loadConfig: async () => ({
      config: {
        enabled: true,
        showWidget: true,
        autoChallenge: true,
        maxFixRounds: 2,
        autoCommitTasks: true,
        autoCompactOnPhaseChange: true,
        autoCompactMinTokens: 50_000,
        planThinkingLevel: "medium",
        executeThinkingLevel: "low",
        verifyThinkingLevel: "high",
      },
      warnings: [],
    }),
  })(pi);

  for (const name of [
    "spec-plan",
    "spec-approve",
    "spec-execute",
    "spec-verify",
    "spec-report",
    "spec-status",
    "spec-abort",
  ]) {
    assert.ok(pi.commands.has(name), `${name} command should be registered`);
  }

  await pi.handlers.get("session_start")({}, ctx);
  await pi.commands.get("spec-plan").handler("my-spec", ctx);
  const event = await pi.handlers.get("before_agent_start")(
    { systemPrompt: "base" },
    ctx,
  );

  assert.match(event.systemPrompt, /Active phase: plan/);
  assert.match(event.systemPrompt, /Active slug: my-spec/);
});
