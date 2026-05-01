import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import workflowModes, { createWorkflowModesExtension } from "./index.ts";

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

type CommandDef = {
  description?: string;
  handler: (args: string, ctx: ReturnType<typeof makeCtx>) => Promise<void>;
};

type EventHandler = (
  event: any,
  ctx: ReturnType<typeof makeCtx>,
) => Promise<any> | any;

type ToolDef = {
  name: string;
  execute?: (...args: any[]) => Promise<any>;
};

function makeCtx(options: {
  cwd: string;
  branch?: unknown[];
  inputResponse?: string | undefined;
  confirmResponse?: boolean;
  notifications?: Array<{ msg: string; level: string }>;
  widgetCalls?: Array<{
    key: string;
    lines: string[] | undefined;
    usedFactory?: boolean;
  }>;
}): any {
  return {
    hasUI: true,
    cwd: options.cwd,
    model: undefined,
    isIdle: () => true,
    signal: undefined,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => "base",
    waitForIdle: async () => {},
    newSession: async () => ({ cancelled: false }),
    fork: async () => ({ cancelled: false }),
    navigateTree: async () => ({ cancelled: false }),
    switchSession: async () => ({ cancelled: false }),
    reload: async () => {},
    sessionManager: {
      getBranch: () => options.branch ?? [],
      getSessionFile: () => undefined,
    },
    ui: {
      notify(msg: string, level: string) {
        options.notifications?.push({ msg, level });
      },
      input: async () => options.inputResponse,
      confirm: async () => options.confirmResponse ?? true,
      setWidget(
        key: string,
        content:
          | string[]
          | ((
              tui: unknown,
              theme: unknown,
            ) => { render(width: number): string[] })
          | undefined,
      ) {
        const usedFactory = typeof content === "function";
        const lines = usedFactory
          ? content({}, identityTheme).render(120)
          : content;
        options.widgetCalls?.push({
          key,
          lines,
          ...(usedFactory ? { usedFactory } : {}),
        });
      },
      setStatus: () => {},
      setWorkingMessage: () => {},
      setHiddenThinkingLabel: () => {},
      setFooter: () => {},
      setHeader: () => {},
      setTitle: () => {},
      custom: async () => undefined,
      pasteToEditor: () => {},
      setEditorText: () => {},
      getEditorText: () => "",
      editor: async () => undefined,
      setEditorComponent: () => {},
      theme: {} as any,
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: true }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => {},
      select: async () => undefined,
    },
  };
}

function makePi(cwd: string) {
  const tools = new Map<string, ToolDef>();
  const commands = new Map<string, CommandDef>();
  const handlers = new Map<string, EventHandler>();
  const notifications: Array<{ msg: string; level: string }> = [];
  const widgetCalls: Array<{
    key: string;
    lines: string[] | undefined;
    usedFactory?: boolean;
  }> = [];
  const appendedEntries: Array<{ customType: string; data: unknown }> = [];
  const activeTools = [
    "read",
    "edit",
    "write",
    "bash",
    "todo",
    "ask_user",
    "web_search",
    "web_fetch",
    "mcp_search",
    "mcp_describe",
    "mcp_call",
    "spawn_agents",
    "ls",
    "find",
    "grep",
  ];
  const setActiveToolsCalls: string[][] = [];
  const setThinkingLevelCalls: string[] = [];
  let currentTools = [...activeTools];
  let thinkingLevel = "medium";

  const pi = {
    registerTool(def: ToolDef) {
      tools.set(def.name, def);
    },
    registerCommand(name: string, def: CommandDef) {
      commands.set(name, def);
    },
    on(event: string, handler: EventHandler) {
      handlers.set(event, handler);
    },
    appendEntry(customType: string, data: unknown) {
      appendedEntries.push({ customType, data });
    },
    hasUI: true,
    setWidget(
      key: string,
      content:
        | string[]
        | ((
            tui: unknown,
            theme: unknown,
          ) => { render(width: number): string[] })
        | undefined,
    ) {
      const usedFactory = typeof content === "function";
      const lines = usedFactory
        ? content({}, identityTheme).render(120)
        : content;
      widgetCalls.push({
        key,
        lines,
        ...(usedFactory ? { usedFactory } : {}),
      });
    },
    getActiveTools() {
      return [...currentTools];
    },
    getAllTools() {
      return Array.from(new Set([...activeTools, ...tools.keys()])).map(
        (name) => ({
          name,
          description: name,
          parameters: {} as any,
          sourceInfo: {} as any,
        }),
      ) as any;
    },
    setActiveTools(toolNames: string[]) {
      currentTools = [...toolNames];
      setActiveToolsCalls.push([...toolNames]);
    },
    getThinkingLevel() {
      return thinkingLevel as any;
    },
    setThinkingLevel(level: string) {
      thinkingLevel = level;
      setThinkingLevelCalls.push(level);
    },
    events: { on: () => {}, emit: () => {} },
    _cwd: cwd,
    _tools: tools,
    _commands: commands,
    _handlers: handlers,
    _notifications: notifications,
    _widgetCalls: widgetCalls,
    _appendedEntries: appendedEntries,
    _setActiveToolsCalls: setActiveToolsCalls,
    _setThinkingLevelCalls: setThinkingLevelCalls,
    _currentTools: () => [...currentTools],
    _thinkingLevel: () => thinkingLevel,
    _ctx(
      branch: unknown[] = [],
      inputResponse?: string,
      confirmResponse?: boolean,
    ) {
      return makeCtx({
        cwd,
        branch,
        inputResponse,
        confirmResponse,
        notifications,
        widgetCalls,
      });
    },
  };

  return pi;
}

async function startSession(
  pi: ReturnType<typeof makePi>,
  branch: unknown[] = [],
) {
  const handler = pi._handlers.get("session_start");
  assert.ok(handler);
  await handler({ type: "session_start", reason: "startup" }, pi._ctx(branch));
}

test("default export is the configurable workflow-modes extension", () => {
  assert.equal(typeof workflowModes, "function");
});

test("/plan creates a workflow brief, switches tools/thinking, and injects the plan contract", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-index-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension({
    now: () => new Date("2026-04-30T12:00:00Z"),
  })(pi as any);
  await startSession(pi);

  const plan = pi._commands.get("plan");
  assert.ok(plan);
  await plan!.handler("Refactor auth middleware", pi._ctx());

  const planPath = join(cwd, ".plans/2026-04-30-refactor-auth-middleware.md");
  const content = await readFile(planPath, "utf8");
  assert.match(content, /Refactor auth middleware/);
  assert.ok(pi._tools.has("workflow_brief"));
  assert.deepEqual(pi._currentTools(), [
    "read",
    "ls",
    "find",
    "grep",
    "todo",
    "ask_user",
    "web_search",
    "web_fetch",
    "mcp_search",
    "mcp_describe",
    "mcp_call",
    "spawn_agents",
    "workflow_brief",
  ]);
  assert.equal(pi._thinkingLevel(), "high");
  assert.deepEqual(pi._appendedEntries.at(-1), {
    customType: "workflow-modes-state",
    data: {
      version: 1,
      activePlanPath: ".plans/2026-04-30-refactor-auth-middleware.md",
    },
  });

  const beforeAgentStart = pi._handlers.get("before_agent_start");
  const result = await beforeAgentStart!(
    { type: "before_agent_start", prompt: "hi", systemPrompt: "base" },
    pi._ctx(),
  );
  assert.match(result.systemPrompt, /current mode: plan/i);
  assert.match(
    result.systemPrompt,
    /active plan artifact: \.plans\/2026-04-30-refactor-auth-middleware\.md/i,
  );

  await rm(cwd, { recursive: true, force: true });
});

test("re-entering the same mode does not reapply tools or thinking defaults", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-reenter-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension({
    now: () => new Date("2026-04-30T12:00:00Z"),
  })(pi as any);
  await startSession(pi);

  await pi._commands
    .get("plan")!
    .handler("Refactor auth middleware", pi._ctx());
  const beforeToolCalls = pi._setActiveToolsCalls.length;
  const beforeThinkingCalls = pi._setThinkingLevelCalls.length;

  await pi._commands
    .get("plan")!
    .handler("Clarify cookie constraints", pi._ctx());

  assert.equal(pi._setActiveToolsCalls.length, beforeToolCalls);
  assert.equal(pi._setThinkingLevelCalls.length, beforeThinkingCalls);

  await rm(cwd, { recursive: true, force: true });
});

test("/normal restores baseline tools, hides the widget, and /execute reopens the active plan", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-normal-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension({
    now: () => new Date("2026-04-30T12:00:00Z"),
  })(pi as any);
  await startSession(pi);

  await pi._commands
    .get("plan")!
    .handler("Refactor auth middleware", pi._ctx());
  await pi._commands.get("normal")!.handler("", pi._ctx());

  assert.equal(pi._thinkingLevel(), "medium");
  assert.deepEqual(pi._currentTools(), [
    "read",
    "edit",
    "write",
    "bash",
    "todo",
    "ask_user",
    "web_search",
    "web_fetch",
    "mcp_search",
    "mcp_describe",
    "mcp_call",
    "spawn_agents",
    "ls",
    "find",
    "grep",
  ]);
  assert.deepEqual(pi._widgetCalls.at(-1), {
    key: "workflow-modes",
    lines: undefined,
  });

  await pi._commands.get("execute")!.handler("", pi._ctx());
  assert.equal(pi._thinkingLevel(), "low");
  assert.ok(
    pi._widgetCalls
      .at(-1)
      ?.lines?.[1]?.includes(".plans/2026-04-30-refactor-auth-middleware.md"),
  );

  await rm(cwd, { recursive: true, force: true });
});

test("/plan with no active workflow prompts for context when needed", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-input-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension({
    now: () => new Date("2026-04-30T12:00:00Z"),
  })(pi as any);
  await startSession(pi);

  await pi._commands
    .get("plan")!
    .handler("", pi._ctx([], "Investigate flaky auth tests"));

  const content = await readFile(
    join(cwd, ".plans/2026-04-30-investigate-flaky-auth-tests.md"),
    "utf8",
  );
  assert.match(content, /Investigate flaky auth tests/);

  await rm(cwd, { recursive: true, force: true });
});

test("verify mode keeps mcp_call available without workflow-modes filtering", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-broker-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension({
    now: () => new Date("2026-04-30T12:00:00Z"),
  })(pi as any);
  await startSession(pi);
  await pi._commands
    .get("verify")!
    .handler("Refactor auth middleware", pi._ctx());

  assert.ok(pi._currentTools().includes("mcp_call"));
  assert.equal(pi._handlers.get("tool_call"), undefined);

  await rm(cwd, { recursive: true, force: true });
});

test("session_before_compact returns a workflow-aware summary while a mode is active", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-compact-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension({
    now: () => new Date("2026-04-30T12:00:00Z"),
  })(pi as any);
  await startSession(pi);
  await pi._commands
    .get("plan")!
    .handler("Refactor auth middleware", pi._ctx());

  const compact = pi._handlers.get("session_before_compact");
  const result = await compact!(
    {
      type: "session_before_compact",
      preparation: {
        firstKeptEntryId: "keep-1",
        tokensBefore: 1234,
      },
      branchEntries: [
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "todo",
            details: {
              items: [
                {
                  id: 1,
                  text: "Draft acceptance criteria",
                  status: "in_progress",
                },
              ],
              nextTodoId: 2,
            },
          },
        },
      ],
      signal: new AbortController().signal,
    },
    pi._ctx(),
  );

  assert.equal(result.compaction.firstKeptEntryId, "keep-1");
  assert.match(result.compaction.summary, /Mode: plan/);
  assert.match(result.compaction.summary, /Draft acceptance criteria/);

  await rm(cwd, { recursive: true, force: true });
});
