import test from "node:test";
import assert from "node:assert/strict";
import { HindsightClient } from "./client.ts";
import { DEFAULT_HINDSIGHT_CONFIG } from "./config.ts";
import { executeHindsight, registerHindsightTool } from "./tools.ts";

const config = {
  ...DEFAULT_HINDSIGHT_CONFIG,
  apiKey: "secret",
  bankId: "main",
};

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

type Renderable = { render(width: number): string[] };

type ToolDef = {
  name: string;
  parameters: Record<string, any>;
  promptGuidelines?: string[];
  renderCall: (
    args: Record<string, unknown>,
    theme: typeof identityTheme,
    context: { lastComponent?: unknown },
  ) => Renderable;
  renderResult: (
    result: {
      content: Array<{ type: string; text: string }>;
      details?: unknown;
    },
    options: { isPartial: boolean },
    theme: typeof identityTheme,
    context: {
      args: Record<string, unknown>;
      isError?: boolean;
      lastComponent?: unknown;
      state: Record<string, unknown>;
      invalidate: () => void;
    },
  ) => Renderable;
};

function loadTool() {
  const registered: ToolDef[] = [];
  const pi = {
    registerTool(def: ToolDef) {
      registered.push(def);
    },
  };

  registerHindsightTool(pi as any, {
    client: new FakeClient(),
    loadConfig: async () => config,
  });

  assert.equal(registered.length, 1);
  assert.equal(registered[0]?.name, "hindsight");
  return registered[0]!;
}

class FakeClient extends HindsightClient {
  calls: Array<[string, unknown]> = [];
  response: unknown = { results: [] };
  error?: Error;
  constructor() {
    super(config);
  }
  async retain(body: unknown) {
    this.calls.push(["retain", body]);
    if (this.error) throw this.error;
    return this.response;
  }
  async recall(body: unknown) {
    this.calls.push(["recall", body]);
    if (this.error) throw this.error;
    return this.response;
  }
  async reflect(body: unknown) {
    this.calls.push(["reflect", body]);
    if (this.error) throw this.error;
    return this.response;
  }
}

test("schema exposes enums for finite string parameters", () => {
  const tool = loadTool();

  assert.deepEqual(tool.parameters.properties.action.enum, [
    "retain",
    "recall",
    "reflect",
  ]);
  assert.deepEqual(tool.parameters.properties.scope.enum, ["repo", "global"]);
  assert.deepEqual(tool.parameters.properties.source.enum, [
    "manual",
    "external",
    "agent",
  ]);
  assert.deepEqual(tool.parameters.properties.kind.enum, [
    "semantic",
    "episodic",
    "procedural",
  ]);
  assert.deepEqual(tool.parameters.properties.update_mode.enum, [
    "replace",
    "append",
  ]);
  assert.deepEqual(tool.parameters.properties.tags_match.enum, [
    "any",
    "any_strict",
    "all",
    "all_strict",
  ]);
  assert.deepEqual(tool.parameters.properties.budget.enum, [
    "low",
    "mid",
    "high",
  ]);
  assert.equal(tool.parameters.properties.origin.type, "string");
});

test("promptGuidelines teach tag and document id policy", () => {
  const tool = loadTool();
  const guidance = tool.promptGuidelines?.join("\n") ?? "";

  assert.match(guidance, /origin/);
  assert.match(guidance, /topic:\*/);
  assert.match(guidance, /ticket:\*/);
  assert.match(guidance, /document_id/);
  assert.match(guidance, /update_mode/);
  assert.match(guidance, /replace/);
  assert.match(guidance, /Avoid ad hoc synonyms/);
  assert.match(guidance, /untrusted evidence/);
  assert.match(guidance, /verify/i);
});

test("renderCall summarizes recall without dumping JSON", () => {
  const tool = loadTool();

  const lines = tool
    .renderCall(
      {
        action: "recall",
        query: "memories relevant to user preferences",
        scope: "global",
        include_source_facts: true,
        tags: ["preference:user-name", "agent:pi"],
      },
      identityTheme,
      {},
    )
    .render(120);

  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /hindsight recall global/);
  assert.match(lines[0] ?? "", /memories relevant to user preferences/);
  assert.match(lines[0] ?? "", /tags:2/);
  assert.match(lines[0] ?? "", /facts/);
  assert.doesNotMatch(lines[0] ?? "", /\{/);
  assert.doesNotMatch(lines[0] ?? "", /include_source_facts/);
});

test("renderResult summarizes recall count", () => {
  const tool = loadTool();

  const lines = tool
    .renderResult(
      {
        content: [{ type: "text", text: "hindsight recall:\n{...}" }],
        details: {
          action: "recall",
          response: { results: [{ id: "1" }, { id: "2" }] },
          truncated: true,
        },
      },
      { isPartial: false },
      identityTheme,
      {
        args: { action: "recall" },
        state: {},
        invalidate() {},
      },
    )
    .render(120);

  assert.deepEqual(lines, ["2 memories found (truncated)"]);
});

test("returns recoverable error for missing required config", async () => {
  const result = await executeHindsight(
    new FakeClient(),
    DEFAULT_HINDSIGHT_CONFIG,
    { cwd: process.cwd() } as any,
    { action: "recall", query: "q" },
    new AbortController().signal,
  );
  assert.match(
    result.content[0].type === "text" ? result.content[0].text : "",
    /apiKey is not configured/,
  );
});

test("validates action requirements", async () => {
  const result = await executeHindsight(
    new FakeClient(),
    config,
    { cwd: process.cwd() } as any,
    { action: "retain" },
    new AbortController().signal,
  );
  assert.match(
    result.content[0].type === "text" ? result.content[0].text : "",
    /content is required/,
  );
});

test("returns readable errors for invalid enum inputs", async () => {
  const result = await executeHindsight(
    new FakeClient(),
    config,
    { cwd: process.cwd() } as any,
    { action: "recall", query: "q", tags_match: "loose" },
    new AbortController().signal,
  );
  assert.match(
    result.content[0].type === "text" ? result.content[0].text : "",
    /invalid tags_match/,
  );
});

test("returns recoverable error text for client failures", async () => {
  const client = new FakeClient();
  client.error = new Error("network down");
  const result = await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    { action: "recall", query: "q" },
    new AbortController().signal,
  );
  assert.match(
    result.content[0].type === "text" ? result.content[0].text : "",
    /hindsight recall failed: network down/,
  );
});

test("blocks secret-like retained content before calling Hindsight", async () => {
  const client = new FakeClient();
  const result = await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    {
      action: "retain",
      content: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    },
    new AbortController().signal,
  );
  const text = result.content[0].type === "text" ? result.content[0].text : "";
  assert.match(text, /blocked/);
  assert.match(text, /private key/i);
  assert.equal((result.details as any).error, true);
  assert.equal(client.calls.length, 0);
});

test("rejects caller metadata keys reserved for Hindsight policy", async () => {
  const client = new FakeClient();
  const result = await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    {
      action: "retain",
      content: "fact",
      metadata: { hindsight_scope: "global" },
    },
    new AbortController().signal,
  );
  const text = result.content[0].type === "text" ? result.content[0].text : "";
  assert.match(text, /reserved metadata/i);
  assert.equal((result.details as any).error, true);
  assert.equal(client.calls.length, 0);
});

test("shapes retain body with tags and metadata", async () => {
  const client = new FakeClient();
  client.response = { success: true, items_count: 1 };
  await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    {
      action: "retain",
      content: "fact",
      source: "external",
      kind: "procedural",
      tags: ["Ticket ABC"],
      metadata: { x: "y" },
      origin: "Docs Importer",
      document_id: "doc1",
    },
    new AbortController().signal,
  );
  const body = client.calls[0][1] as any;
  assert.equal(body.items[0].content, "fact");
  assert.equal(body.items[0].document_id, "doc1");
  assert.ok(body.items[0].tags.includes("source:external"));
  assert.ok(body.items[0].tags.includes("kind:procedural"));
  assert.ok(body.items[0].tags.includes("ticket-abc"));
  assert.ok(body.items[0].tags.includes("origin:docs-importer"));
  assert.equal(body.items[0].metadata.x, "y");
  assert.equal(body.items[0].metadata.hindsight_origin, "docs-importer");
  assert.equal(body.items[0].metadata.hindsight_document_id, "doc1");
  assert.equal(body.items[0].metadata.hindsight_tag_policy_version, "1");
});

test("shapes batch retain body with per-item fields", async () => {
  const client = new FakeClient();
  client.response = { success: true, items_count: 2 };
  await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    {
      action: "retain",
      source: "external",
      kind: "semantic",
      tags: ["ticket:ABC-123"],
      items: [
        {
          content: "first fact",
          document_id: "doc:first",
          metadata: { item: "one" },
          tags: ["topic:first"],
        },
        {
          content: "second fact",
          context: "from issue tracker",
          update_mode: "append",
          tags: ["topic:second"],
        },
      ],
    },
    new AbortController().signal,
  );
  const body = client.calls[0][1] as any;
  assert.equal(body.items.length, 2);
  assert.equal(body.items[0].content, "first fact");
  assert.equal(body.items[0].document_id, "doc:first");
  assert.equal(body.items[0].metadata.item, "one");
  assert.ok(body.items[0].tags.includes("ticket:abc-123"));
  assert.ok(body.items[0].tags.includes("topic:first"));
  assert.equal(body.items[1].context, "from issue tracker");
  assert.equal(body.items[1].update_mode, "append");
  assert.ok(body.items[1].tags.includes("topic:second"));
});

test("marks recall result-count truncation in agent text", async () => {
  const client = new FakeClient();
  client.response = {
    results: Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      text: `fact ${i}`,
    })),
  };
  const result = await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    { action: "recall", query: "q" },
    new AbortController().signal,
  );
  const text = result.content[0].type === "text" ? result.content[0].text : "";
  assert.match(text, /truncated/);
  assert.equal((result.details as any).truncated, true);
});

test("recall result text includes memory trust boundary", async () => {
  const client = new FakeClient();
  client.response = { results: [] };
  const result = await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    { action: "recall", query: "q" },
    new AbortController().signal,
  );
  const text = result.content[0].type === "text" ? result.content[0].text : "";
  assert.match(text, /untrusted evidence/);
  assert.match(text, /verify/i);
});

test("bounds oversized recall output", async () => {
  const client = new FakeClient();
  client.response = {
    results: Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      text: "x".repeat(2000),
    })),
  };
  const result = await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    { action: "recall", query: "q" },
    new AbortController().signal,
  );
  const text = result.content[0].type === "text" ? result.content[0].text : "";
  assert.match(text, /truncated/);
  assert.equal((result.details as any).truncated, true);
});

test("rejects malformed recall options", async () => {
  for (const params of [
    { action: "recall", query: "q", types: ["fact", 3] },
    { action: "recall", query: "q", max_tokens: -1 },
  ]) {
    const result = await executeHindsight(
      new FakeClient(),
      config,
      { cwd: process.cwd() } as any,
      params,
      new AbortController().signal,
    );
    assert.equal((result.details as any).error, true);
  }
});

test("rejects malformed reflect options", async () => {
  for (const params of [
    { action: "reflect", query: "q", fact_types: ["world", 3] },
    { action: "reflect", query: "q", max_tokens: 0 },
  ]) {
    const result = await executeHindsight(
      new FakeClient(),
      config,
      { cwd: process.cwd() } as any,
      params,
      new AbortController().signal,
    );
    assert.equal((result.details as any).error, true);
  }
});

test("bounds oversized reflect output", async () => {
  const client = new FakeClient();
  client.response = {
    text: "x".repeat(2000),
    based_on: Array.from({ length: 20 }, (_, i) => ({ id: String(i) })),
  };
  const result = await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    { action: "reflect", query: "q" },
    new AbortController().signal,
  );
  const text = result.content[0].type === "text" ? result.content[0].text : "";
  assert.match(text, /truncated/);
  assert.equal((result.details as any).truncated, true);
});

test("shapes reflect body", async () => {
  const client = new FakeClient();
  await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    {
      action: "reflect",
      query: "q",
      include_facts: true,
      fact_types: ["world"],
    },
    new AbortController().signal,
  );
  const body = client.calls[0][1] as any;
  assert.deepEqual(body.include, { facts: {} });
  assert.deepEqual(body.fact_types, ["world"]);
  assert.equal(body.max_tokens, 1200);
});

test("reflect result text includes memory trust boundary", async () => {
  const client = new FakeClient();
  client.response = { text: "answer" };
  const result = await executeHindsight(
    client,
    config,
    { cwd: process.cwd() } as any,
    { action: "reflect", query: "q" },
    new AbortController().signal,
  );
  const text = result.content[0].type === "text" ? result.content[0].text : "";
  assert.match(text, /untrusted evidence/);
  assert.match(text, /verify/i);
});
