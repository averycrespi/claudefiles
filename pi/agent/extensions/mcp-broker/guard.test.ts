import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findBlockedCommand,
  getBlockReason,
  getSteerMessage,
  splitCommand,
} from "./guard.ts";

test("splitCommand splits on && || ; and newlines, trimming segments", () => {
  assert.deepEqual(
    splitCommand("echo a && echo b || echo c ; echo d\necho e"),
    ["echo a", "echo b", "echo c", "echo d", "echo e"],
  );
});

test("splitCommand ignores empty segments", () => {
  assert.deepEqual(splitCommand(" ; ; echo ok ;"), ["echo ok"]);
});

test("findBlockedCommand flags a bare gh invocation", () => {
  assert.deepEqual(findBlockedCommand("gh pr list"), {
    kind: "github-cli",
    segment: "gh pr list",
  });
});

test("findBlockedCommand flags gh behind env-style assignment prefixes", () => {
  assert.deepEqual(findBlockedCommand("GH_TOKEN=abc gh pr list"), {
    kind: "github-cli",
    segment: "GH_TOKEN=abc gh pr list",
  });
});

test("findBlockedCommand flags gh behind 'env ASSIGN=v gh ...'", () => {
  assert.deepEqual(findBlockedCommand("env FOO=1 gh pr list"), {
    kind: "github-cli",
    segment: "env FOO=1 gh pr list",
  });
});

test("findBlockedCommand flags gh behind 'command'/'builtin' prefixes", () => {
  assert.deepEqual(findBlockedCommand("command gh pr list"), {
    kind: "github-cli",
    segment: "command gh pr list",
  });
  assert.deepEqual(findBlockedCommand("builtin gh pr list"), {
    kind: "github-cli",
    segment: "builtin gh pr list",
  });
});

test("findBlockedCommand flags gh invoked by absolute path", () => {
  assert.deepEqual(findBlockedCommand("/usr/local/bin/gh auth status"), {
    kind: "github-cli",
    segment: "/usr/local/bin/gh auth status",
  });
});

test("findBlockedCommand flags each git remote-oriented subcommand", () => {
  for (const sub of ["push", "pull", "fetch", "ls-remote", "remote"]) {
    const cmd = `git ${sub}${sub === "remote" ? " -v" : " origin main"}`;
    const match = findBlockedCommand(cmd);
    assert.ok(match, `expected block for: ${cmd}`);
    assert.equal(match.kind, "git-remote");
  }
});

test("findBlockedCommand ignores local-only git commands", () => {
  assert.equal(findBlockedCommand("git status"), undefined);
  assert.equal(findBlockedCommand("git log --oneline"), undefined);
  assert.equal(findBlockedCommand("git diff HEAD"), undefined);
  assert.equal(findBlockedCommand("git commit -m 'x'"), undefined);
});

test("findBlockedCommand returns undefined for unrelated commands", () => {
  assert.equal(findBlockedCommand("ls -la"), undefined);
  assert.equal(findBlockedCommand("echo 'gh is a tool'"), undefined);
});

test("findBlockedCommand catches the blocked segment inside a pipeline", () => {
  const match = findBlockedCommand("echo starting && git push origin main");
  assert.ok(match);
  assert.equal(match.kind, "git-remote");
  assert.equal(match.segment, "git push origin main");
});

test("findBlockedCommand returns the first match when multiple are present", () => {
  const match = findBlockedCommand("gh pr list || git push");
  assert.ok(match);
  assert.equal(match.kind, "github-cli");
});

test("getBlockReason returns distinct strings per kind", () => {
  const gh = getBlockReason("github-cli");
  const git = getBlockReason("git-remote");
  assert.match(gh, /GitHub CLI/);
  assert.match(git, /remote git/);
  assert.notEqual(gh, git);
});

test("getSteerMessage includes the blocked segment and broker guidance", () => {
  const msg = getSteerMessage(
    { kind: "github-cli", segment: "gh pr list" },
    "/any/cwd",
  );
  assert.match(msg, /Blocked command segment: gh pr list/);
  assert.match(msg, /mcp_search/);
  assert.match(msg, /github/);
});

test("getSteerMessage for git-remote points at git broker tools", () => {
  const msg = getSteerMessage(
    { kind: "git-remote", segment: "git push" },
    "/any/cwd",
  );
  assert.match(msg, /Blocked command segment: git push/);
  assert.match(msg, /mcp_search/);
  assert.match(msg, /git/);
});
