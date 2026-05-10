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
