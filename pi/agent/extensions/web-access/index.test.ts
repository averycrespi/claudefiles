import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import extensionDefault from "./index.ts";

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
});

test("/web-access-config displays effective config with masked keys", async () => {
  process.env.TAVILY_API_KEY = "tavily-secret";
  process.env.JINA_API_KEY = "jina-secret";
  const commands = new Map<string, any>();
  const notifications: Array<{ message: string; level: string }> = [];
  const pi = {
    registerTool() {},
    registerCommand(name: string, command: any) {
      commands.set(name, command);
    },
    on() {},
  } as any;

  extensionDefault(pi);

  assert.ok(commands.has("web-access-config"));
  await commands.get("web-access-config").handler("", {
    cwd: "/repo",
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  });

  assert.equal(notifications[0].level, "info");
  assert.match(notifications[0].message, /web-access effective config:/);
  assert.match(notifications[0].message, /"tavilyApiKey": "\*\*\*\*\*\*\*\*"/);
  assert.match(notifications[0].message, /"jinaApiKey": "\*\*\*\*\*\*\*\*"/);
  assert.doesNotMatch(notifications[0].message, /tavily-secret/);
  assert.doesNotMatch(notifications[0].message, /jina-secret/);
});
