import assert from "node:assert/strict";
import { test } from "node:test";
import statuslineExtension from "./index.ts";

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

type EventHandler = (
  event: unknown,
  ctx: ReturnType<typeof makeCtx>,
) => Promise<void> | void;

function makeCtx() {
  return {
    hasUI: true,
    cwd: "/Users/avery/Workspace/agent-config",
    model: {
      provider: "openai-codex",
      id: "gpt-5-codex",
      contextWindow: 200_000,
    },
    modelRegistry: {
      async getApiKeyAndHeaders() {
        return { ok: false };
      },
    },
    getContextUsage() {
      return { percent: 42, contextWindow: 200_000, tokens: 84_000 };
    },
    ui: {
      setFooter: (
        _factory: (
          tui: { requestRender(): void },
          theme: typeof identityTheme,
          footerData: unknown,
        ) => { render(width: number): string[]; invalidate(): void },
      ) => {},
    },
  };
}

function makePi() {
  const handlers = new Map<string, EventHandler>();
  const statuslineCalls: string[][] = [];

  const pi = {
    on(event: string, handler: EventHandler) {
      handlers.set(event, handler);
    },
    getThinkingLevel() {
      return "medium" as const;
    },
    _handlers: handlers,
    _statuslineCalls: statuslineCalls,
    _ctx() {
      return {
        ...makeCtx(),
        ui: {
          setFooter(
            factory: (
              tui: { requestRender(): void },
              theme: typeof identityTheme,
              footerData: unknown,
            ) => { render(width: number): string[]; invalidate(): void },
          ) {
            const component = factory(
              { requestRender() {} },
              identityTheme,
              {},
            );
            statuslineCalls.push(component.render(200));
          },
        },
      };
    },
  };

  return pi;
}

test("session_start installs a single-line statusline instead of publishing only a status snippet", async () => {
  const pi = makePi();
  statuslineExtension(pi as any);

  const handler = pi._handlers.get("session_start");
  assert.ok(handler, "session_start handler should be registered");

  await handler!({ type: "session_start", reason: "startup" }, pi._ctx());

  assert.deepEqual(pi._statuslineCalls, [
    ["~/Workspace/agent-config · ctx 42%/200k · gpt-5-codex · medium"],
  ]);
});
