import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@mariozechner/pi-tui";
import { renderHeader } from "./render.ts";

const theme = {
  fg(color: string, text: string) {
    switch (color) {
      case "accent":
        return `\x1b[36m${text}\x1b[0m`;
      case "dim":
        return `\x1b[2m${text}\x1b[0m`;
      case "muted":
        return `\x1b[90m${text}\x1b[0m`;
      default:
        return text;
    }
  },
  bold(text: string) {
    return `\x1b[1m${text}\x1b[0m`;
  },
};

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("renderHeader renders tiny wordmark, metadata, and recent commits", () => {
  const lines = renderHeader(
    {
      piVersion: "0.65.0",
      cwd: "/Users/avery/Workspace/agent-config",
      repoName: "agent-config",
      branch: "main",
      commits: [
        { hash: "1a2b3c4", subject: "refine statusline footer" },
        { hash: "9d8e7f6", subject: "add workflow mode widget" },
        { hash: "4c3b2a1", subject: "tighten MCP guard tests" },
      ],
    },
    120,
    theme,
  );

  assert.equal(
    stripAnsi(lines.join("\n")),
    "π› pi v0.65.0 · agent-config · main\n" +
      "   1a2b3c4 refine statusline footer\n" +
      "   9d8e7f6 add workflow mode widget\n" +
      "   4c3b2a1 tighten MCP guard tests",
  );
  assert.match(lines[0]!, /\x1b\[36m\x1b\[1mπ›\x1b\[0m\x1b\[0m/);
});

test("renderHeader falls back to cwd basename without git metadata", () => {
  const lines = renderHeader(
    {
      piVersion: "0.65.0",
      cwd: "/tmp/example-repo",
      commits: [],
    },
    120,
    theme,
  );

  assert.equal(stripAnsi(lines.join("\n")), "π› pi v0.65.0 · example-repo");
});

test("renderHeader limits commit display to three entries", () => {
  const lines = renderHeader(
    {
      piVersion: "0.65.0",
      cwd: "/repo",
      repoName: "repo",
      commits: [
        { hash: "1111111", subject: "one" },
        { hash: "2222222", subject: "two" },
        { hash: "3333333", subject: "three" },
        { hash: "4444444", subject: "four" },
      ],
    },
    120,
    theme,
  );

  assert.equal(lines.length, 4);
  assert.ok(!stripAnsi(lines.join("\n")).includes("4444444"));
});

test("renderHeader truncates all lines to the requested width", () => {
  const lines = renderHeader(
    {
      piVersion: "0.65.0",
      cwd: "/repo",
      repoName: "repo-with-a-very-long-name",
      branch: "feature/some-very-long-branch-name",
      commits: [{ hash: "1a2b3c4", subject: "a very long commit subject" }],
    },
    24,
    theme,
  );

  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 24, `${stripAnsi(line)} exceeded width`);
  }
});
