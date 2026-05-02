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
  notifications?: Array<{ msg: string; level: string }>;
  widgetCalls?: Array<{
    key: string;
    lines: string[] | undefined;
    usedFactory?: boolean;
  }>;
  inputCalls?: string[];
  idle?: boolean;
}): any {
  return {
    hasUI: true,
    cwd: options.cwd,
    model: undefined,
    isIdle: () => options.idle ?? true,
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
      input: async (title: string) => {
        options.inputCalls?.push(title);
        return options.inputResponse;
      },
      confirm: async () => true,
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
  const inputCalls: string[] = [];
  const sentUserMessages: Array<{ content: unknown; options?: unknown }> = [];
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
  const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
  const emittedEvents: Array<{ event: string; data: unknown }> = [];
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
    appendEntry: () => {},
    sendUserMessage(content: unknown, options?: unknown) {
      sentUserMessages.push({ content, options });
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
    events: {
      on(event: string, handler: (data: unknown) => void) {
        const list = eventHandlers.get(event) ?? [];
        list.push(handler);
        eventHandlers.set(event, list);
      },
      emit(event: string, data: unknown) {
        emittedEvents.push({ event, data });
        for (const handler of eventHandlers.get(event) ?? []) handler(data);
      },
    },
    _cwd: cwd,
    _tools: tools,
    _commands: commands,
    _handlers: handlers,
    _notifications: notifications,
    _widgetCalls: widgetCalls,
    _inputCalls: inputCalls,
    _sentUserMessages: sentUserMessages,
    _setActiveToolsCalls: setActiveToolsCalls,
    _setThinkingLevelCalls: setThinkingLevelCalls,
    _emittedEvents: emittedEvents,
    _currentTools: () => [...currentTools],
    _thinkingLevel: () => thinkingLevel,
    _ctx(branch: unknown[] = [], inputResponse?: string, idle = true) {
      return makeCtx({
        cwd,
        branch,
        inputResponse,
        notifications,
        widgetCalls,
        inputCalls,
        idle,
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

test("/plan sends a kickoff user message, switches tools/thinking, and injects the plan contract", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-index-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension()(pi as any);
  await startSession(pi);

  await pi._commands
    .get("plan")!
    .handler("Refactor auth middleware", pi._ctx());

  assert.ok(pi._tools.has("write_plan"));
  assert.ok(pi._tools.has("edit_plan"));
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
    "write_plan",
    "edit_plan",
  ]);
  assert.equal(pi._thinkingLevel(), "high");
  assert.equal(pi._sentUserMessages.length, 1);
  assert.match(String(pi._sentUserMessages[0]?.content), /plan mode/i);
  assert.match(
    String(pi._sentUserMessages[0]?.content),
    /Refactor auth middleware/,
  );
  assert.deepEqual(pi._emittedEvents.at(-1), {
    event: "workflow-modes:changed",
    data: { mode: "plan", baseThinking: "high" },
  });

  const beforeAgentStart = pi._handlers.get("before_agent_start");
  const result = await beforeAgentStart!(
    { type: "before_agent_start", prompt: "hi", systemPrompt: "base" },
    pi._ctx(),
  );
  assert.match(result.systemPrompt, /current mode: plan/i);
  assert.match(result.systemPrompt, /write_plan/i);
  assert.match(result.systemPrompt, /edit_plan/i);
  assert.match(result.systemPrompt, /\.plans\//i);

  await rm(cwd, { recursive: true, force: true });
});

test("re-entering the same mode does not reapply tools or thinking defaults", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-reenter-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension()(pi as any);
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
  assert.equal(pi._sentUserMessages.length, 2);

  await rm(cwd, { recursive: true, force: true });
});

test("/normal restores baseline tools, clears workflow state, and does not send a kickoff message", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-normal-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension()(pi as any);
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
  assert.equal(pi._widgetCalls.length, 0);
  assert.deepEqual(pi._emittedEvents.at(-1), {
    event: "workflow-modes:changed",
    data: { mode: "normal", baseThinking: undefined },
  });
  assert.equal(pi._sentUserMessages.length, 1);

  await rm(cwd, { recursive: true, force: true });
});

test("/plan with no args starts immediately without prompting", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-input-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension()(pi as any);
  await startSession(pi);

  await pi._commands.get("plan")!.handler("", pi._ctx([], "ignored"));

  assert.equal(pi._inputCalls.length, 0);
  assert.equal(pi._sentUserMessages.length, 1);
  assert.match(String(pi._sentUserMessages[0]?.content), /plan mode/i);

  await rm(cwd, { recursive: true, force: true });
});

test("/execute and /verify send kickoff messages with mode-specific guidance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-handoff-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension()(pi as any);
  await startSession(pi);

  await pi._commands
    .get("execute")!
    .handler("Implement auth middleware", pi._ctx());
  await pi._commands
    .get("verify")!
    .handler("Check typecheck and tests", pi._ctx());

  assert.equal(pi._sentUserMessages.length, 2);
  assert.match(String(pi._sentUserMessages[0]?.content), /execute mode/i);
  assert.match(
    String(pi._sentUserMessages[0]?.content),
    /Implement auth middleware/,
  );
  assert.match(String(pi._sentUserMessages[1]?.content), /verify mode/i);
  assert.match(
    String(pi._sentUserMessages[1]?.content),
    /Check typecheck and tests/,
  );

  await rm(cwd, { recursive: true, force: true });
});

test("write_plan and edit_plan are scoped to .plans", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-tools-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension()(pi as any);
  await startSession(pi);
  await pi._commands.get("plan")!.handler("Draft a workflow", pi._ctx());

  const writePlan = pi._tools.get("write_plan");
  const editPlan = pi._tools.get("edit_plan");
  assert.ok(writePlan?.execute);
  assert.ok(editPlan?.execute);

  await writePlan!.execute!(
    "call-1",
    {
      path: "auth.md",
      content: "# Workflow Brief\n\n## Goal\nRefactor auth middleware\n",
    },
    undefined,
    undefined,
    pi._ctx(),
  );

  assert.equal(
    await readFile(join(cwd, ".plans/auth.md"), "utf8"),
    "# Workflow Brief\n\n## Goal\nRefactor auth middleware\n",
  );

  await editPlan!.execute!(
    "call-2",
    {
      path: ".plans/auth.md",
      edits: [
        {
          oldText: "Refactor auth middleware",
          newText: "Refactor auth middleware safely",
        },
      ],
    },
    undefined,
    undefined,
    pi._ctx(),
  );

  assert.match(await readFile(join(cwd, ".plans/auth.md"), "utf8"), /safely/);

  const blocked = await writePlan!.execute!(
    "call-3",
    { path: "../README.md", content: "nope" },
    undefined,
    undefined,
    pi._ctx(),
  );
  assert.match(String(blocked.content[0]?.text), /\.plans/i);

  await rm(cwd, { recursive: true, force: true });
});

test("session_before_compact returns a workflow-aware summary while a mode is active", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-modes-compact-"));
  const pi = makePi(cwd);
  createWorkflowModesExtension()(pi as any);
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
  assert.doesNotMatch(result.compaction.summary, /Active plan:/);

  await rm(cwd, { recursive: true, force: true });
});
