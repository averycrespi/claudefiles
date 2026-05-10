import test from "node:test";
import assert from "node:assert/strict";
import { HindsightClient } from "./client.ts";
import { DEFAULT_HINDSIGHT_CONFIG } from "./config.ts";
import { executeHindsight } from "./tools.ts";

const config = {
  ...DEFAULT_HINDSIGHT_CONFIG,
  apiKey: "secret",
  bankId: "main",
};

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
  assert.equal(body.items[0].metadata.x, "y");
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
});
