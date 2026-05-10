import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { HindsightClient, _fetch } from "./client.ts";

const config = {
  baseUrl: "https://hindsight.example.com",
  apiKey: "secret",
  bankId: "bank with space",
  defaultScope: "repo" as const,
  defaultTags: [],
  recallMaxTokens: 1200,
  recallBudget: "mid" as const,
  reflectBudget: "low" as const,
  tagsMatch: "any_strict" as const,
};

test("shapes retain request path, auth, and body", async () => {
  const calls: any[] = [];
  mock.method(_fetch, "fn", async (url: string, init: any) => {
    calls.push([url, init]);
    return new Response(JSON.stringify({ success: true, items_count: 1 }), {
      status: 200,
    });
  });
  const client = new HindsightClient(config);
  await client.retain(
    { items: [{ content: "hello" }], async: false },
    new AbortController().signal,
  );
  assert.equal(
    calls[0][0],
    "https://hindsight.example.com/v1/default/banks/bank%20with%20space/memories",
  );
  assert.equal(calls[0][1].headers.authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    items: [{ content: "hello" }],
    async: false,
  });
});

test("shapes recall and reflect request paths and bodies", async () => {
  const calls: any[] = [];
  mock.method(_fetch, "fn", async (url: string, init: any) => {
    calls.push([url, init]);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const client = new HindsightClient(config);
  await client.recall(
    { query: "q", tags: ["scope:repo"], include: { source_facts: {} } },
    new AbortController().signal,
  );
  await client.reflect(
    { query: "r", include: { facts: {} }, fact_types: ["world"] },
    new AbortController().signal,
  );
  assert.equal(
    calls[0][0],
    "https://hindsight.example.com/v1/default/banks/bank%20with%20space/memories/recall",
  );
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    query: "q",
    tags: ["scope:repo"],
    include: { source_facts: {} },
  });
  assert.equal(
    calls[1][0],
    "https://hindsight.example.com/v1/default/banks/bank%20with%20space/reflect",
  );
  assert.deepEqual(JSON.parse(calls[1][1].body), {
    query: "r",
    include: { facts: {} },
    fact_types: ["world"],
  });
});

test("throws readable http errors", async () => {
  mock.method(
    _fetch,
    "fn",
    async () =>
      new Response(JSON.stringify({ detail: "bad" }), { status: 422 }),
  );
  const client = new HindsightClient(config);
  await assert.rejects(
    () => client.recall({ query: "q" }, new AbortController().signal),
    /Hindsight HTTP 422/,
  );
});
