import assert from "node:assert/strict";
import { test } from "node:test";
import { loadGitMetadata, parseCommitLog } from "./git.ts";

test("parseCommitLog parses short hash and subject", () => {
  assert.deepEqual(
    parseCommitLog(
      "1a2b3c4 refine statusline footer\n9d8e7f6 add workflow mode widget",
    ),
    [
      { hash: "1a2b3c4", subject: "refine statusline footer" },
      { hash: "9d8e7f6", subject: "add workflow mode widget" },
    ],
  );
});

test("parseCommitLog ignores blank lines and limits to three commits", () => {
  assert.deepEqual(
    parseCommitLog("\n1111111 one\n2222222 two\n3333333 three\n4444444 four\n"),
    [
      { hash: "1111111", subject: "one" },
      { hash: "2222222", subject: "two" },
      { hash: "3333333", subject: "three" },
    ],
  );
});

test("loadGitMetadata assembles repo, branch, and commit metadata", async () => {
  const calls: Array<{
    file: string;
    args: string[];
    cwd?: string;
    timeout?: number;
  }> = [];
  const pi = {
    async exec(
      file: string,
      args: string[],
      options: { cwd?: string; timeout?: number },
    ) {
      calls.push({ file, args, cwd: options.cwd, timeout: options.timeout });
      if (args[0] === "rev-parse")
        return { stdout: "/tmp/example-repo\n", code: 0 };
      if (args[0] === "branch") return { stdout: "main\n", code: 0 };
      return { stdout: "1a2b3c4 one\n9d8e7f6 two", code: 0 };
    },
  };

  assert.deepEqual(await loadGitMetadata(pi as any, "/tmp/example-repo"), {
    repoName: "example-repo",
    branch: "main",
    commits: [
      { hash: "1a2b3c4", subject: "one" },
      { hash: "9d8e7f6", subject: "two" },
    ],
  });
  assert.deepEqual(
    calls.map((call) => ({
      file: call.file,
      cwd: call.cwd,
      timeout: call.timeout,
    })),
    [
      { file: "git", cwd: "/tmp/example-repo", timeout: 2000 },
      { file: "git", cwd: "/tmp/example-repo", timeout: 2000 },
      { file: "git", cwd: "/tmp/example-repo", timeout: 2000 },
    ],
  );
});

test("loadGitMetadata keeps earlier metadata when a later git command throws", async () => {
  const pi = {
    async exec(_file: string, args: string[]) {
      if (args[0] === "rev-parse")
        return { stdout: "/tmp/example-repo\n", code: 0 };
      throw new Error("branch failed");
    },
  };

  assert.deepEqual(await loadGitMetadata(pi as any, "/tmp/example-repo"), {
    repoName: "example-repo",
    commits: [],
  });
});

test("loadGitMetadata returns empty commits when the first git command throws", async () => {
  const pi = {
    async exec() {
      throw new Error("not a git repo");
    },
  };

  assert.deepEqual(await loadGitMetadata(pi as any, "/tmp/nope"), {
    commits: [],
  });
});
