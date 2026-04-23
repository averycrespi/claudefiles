import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrokerTool } from "./client.ts";
import { buildBrokerPrompt } from "./index.ts";

const TOOLS: BrokerTool[] = [
  { name: "github.gh_list_prs", description: "List pull requests" },
  { name: "github.gh_view_pr", description: "View a pull request by number" },
  { name: "git.git_push", description: "Push to a remote" },
  { name: "git.git_pull", description: "Pull from a remote" },
];

test("buildBrokerPrompt groups tools by namespace and lists names", () => {
  const prompt = buildBrokerPrompt(TOOLS);
  assert.match(prompt, /MCP broker tools/);
  assert.match(prompt, /^- git: git_pull, git_push$/m);
  assert.match(prompt, /^- github: gh_list_prs, gh_view_pr$/m);
});

test("buildBrokerPrompt mentions the meta-tools and decision rules", () => {
  const prompt = buildBrokerPrompt(TOOLS);
  assert.match(prompt, /mcp_call/);
  assert.match(prompt, /mcp_describe/);
  assert.match(prompt, /mcp_search/);
  assert.match(prompt, /push\/pull\/fetch\/ls-remote\/remote/);
});

test("buildBrokerPrompt sorts namespaces and tool names alphabetically", () => {
  const shuffled: BrokerTool[] = [
    { name: "zeta.thing_b" },
    { name: "alpha.thing_a" },
    { name: "alpha.aardvark" },
    { name: "zeta.alpha" },
  ];
  const prompt = buildBrokerPrompt(shuffled);
  // alpha namespace should appear before zeta
  const alphaIdx = prompt.indexOf("- alpha:");
  const zetaIdx = prompt.indexOf("- zeta:");
  assert.ok(alphaIdx > 0 && zetaIdx > alphaIdx);
  assert.match(prompt, /^- alpha: aardvark, thing_a$/m);
  assert.match(prompt, /^- zeta: alpha, thing_b$/m);
});

test("buildBrokerPrompt skips tools without a namespace prefix", () => {
  const prompt = buildBrokerPrompt([
    ...TOOLS,
    { name: "no_namespace_tool", description: "ignored" },
  ]);
  assert.doesNotMatch(prompt, /no_namespace_tool/);
});
