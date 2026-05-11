import test from "node:test";
import assert from "node:assert/strict";
import { HindsightClient } from "./client.ts";
import { DEFAULT_HINDSIGHT_CONFIG, type HindsightConfig } from "./config.ts";
import { registerHindsightDoctorCommand } from "./doctor.ts";

const readyConfig: HindsightConfig = {
  ...DEFAULT_HINDSIGHT_CONFIG,
  apiKey: "secret",
  bankId: "main",
};

type CommandHandler = (args: string, ctx: any) => Promise<void> | void;

class FakeClient extends HindsightClient {
  calls: Array<[string, unknown]> = [];
  response: unknown = { results: [{ text: "must not leak" }] };
  error?: Error;

  constructor() {
    super(readyConfig);
  }

  async recall(body: unknown) {
    this.calls.push(["recall", body]);
    if (this.error) throw this.error;
    return this.response;
  }

  async retain(body: unknown) {
    this.calls.push(["retain", body]);
    return { ok: true };
  }
}

function registerCommand(
  options: {
    client?: FakeClient;
    loadConfig?: () => Promise<HindsightConfig> | HindsightConfig;
  } = {},
) {
  const commands = new Map<
    string,
    { description: string; handler: CommandHandler }
  >();
  const client = options.client ?? new FakeClient();
  registerHindsightDoctorCommand(
    {
      registerCommand(
        name: string,
        command: { description: string; handler: CommandHandler },
      ) {
        commands.set(name, command);
      },
    } as any,
    {
      client,
      loadConfig: async () => options.loadConfig?.() ?? readyConfig,
    },
  );
  const command = commands.get("hindsight-doctor");
  assert.ok(command);
  return { command, client };
}

async function runDoctor(command: { handler: CommandHandler }) {
  const notifications: Array<{ text: string; level: string }> = [];
  await command.handler("", {
    cwd: process.cwd(),
    ui: {
      notify(text: string, level: string) {
        notifications.push({ text, level });
      },
    },
  });
  assert.equal(notifications.length, 1);
  return notifications[0]!;
}

test("doctor registers a read-only diagnostics command", async () => {
  const { command, client } = registerCommand();

  const notification = await runDoctor(command);

  assert.match(command.description, /diagn/i);
  assert.equal(notification.level, "info");
  assert.match(notification.text, /Hindsight doctor/);
  assert.match(notification.text, /Config readiness: pass/);
  assert.match(notification.text, /Connectivity\/bank access: pass/);
  assert.doesNotMatch(notification.text, /must not leak/);
  assert.deepEqual(
    client.calls.map(([name]) => name),
    ["recall"],
  );
  const body = client.calls[0][1] as any;
  assert.equal(body.query, "hindsight doctor connectivity smoke test");
  assert.equal(body.max_tokens, 1);
});

test("doctor reports missing required config without network calls", async () => {
  const { command, client } = registerCommand({
    loadConfig: () => DEFAULT_HINDSIGHT_CONFIG,
  });

  const notification = await runDoctor(command);

  assert.equal(notification.level, "warning");
  assert.match(notification.text, /Config readiness: fail/);
  assert.match(notification.text, /apiKey is not configured/);
  assert.equal(client.calls.length, 0);
});

test("doctor reports connectivity failures without leaking raw responses", async () => {
  const client = new FakeClient();
  client.error = new Error(
    "Hindsight HTTP 401: token expired and raw memory text",
  );
  const { command } = registerCommand({ client });

  const notification = await runDoctor(command);

  assert.equal(notification.level, "warning");
  assert.match(notification.text, /Connectivity\/bank access: fail/);
  assert.match(notification.text, /Hindsight HTTP 401/);
  assert.doesNotMatch(notification.text, /raw memory text/);
});
