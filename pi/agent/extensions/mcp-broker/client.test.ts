import { test } from "node:test";
import assert from "node:assert/strict";
import { extractProviders, type BrokerTool } from "./client.ts";

function tool(name: string): BrokerTool {
  return { name };
}

test("extractProviders splits on the first '.' to derive namespaces", () => {
  assert.deepEqual(
    extractProviders([tool("github.create_pr"), tool("git.git_push")]),
    ["git", "github"],
  );
});

test("extractProviders dedupes namespaces that appear multiple times", () => {
  assert.deepEqual(
    extractProviders([
      tool("github.create_pr"),
      tool("github.list_prs"),
      tool("github.merge_pr"),
    ]),
    ["github"],
  );
});

test("extractProviders returns namespaces sorted alphabetically", () => {
  assert.deepEqual(
    extractProviders([tool("zzz.a"), tool("aaa.b"), tool("mmm.c")]),
    ["aaa", "mmm", "zzz"],
  );
});

test("extractProviders ignores tools with no namespace separator", () => {
  assert.deepEqual(
    extractProviders([tool("noDot"), tool("github.create_pr")]),
    ["github"],
  );
});

test("extractProviders skips tools whose name starts with '.' (no namespace)", () => {
  assert.deepEqual(extractProviders([tool(".foo")]), []);
});

test("extractProviders handles an empty tool list", () => {
  assert.deepEqual(extractProviders([]), []);
});

test("extractProviders uses only the prefix before the first '.'", () => {
  assert.deepEqual(extractProviders([tool("ns.sub.deep_tool")]), ["ns"]);
});
