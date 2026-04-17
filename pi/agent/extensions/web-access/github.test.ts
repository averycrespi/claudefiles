import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGitHubUrl } from "./github.ts";

test("parseGitHubUrl returns null for non-URL input", () => {
  assert.equal(parseGitHubUrl("not a url"), null);
  assert.equal(parseGitHubUrl(""), null);
});

test("parseGitHubUrl returns null for non-github hosts", () => {
  assert.equal(parseGitHubUrl("https://gitlab.com/foo/bar"), null);
  assert.equal(
    parseGitHubUrl("https://raw.githubusercontent.com/foo/bar"),
    null,
  );
});

test("parseGitHubUrl returns null when owner or repo is missing", () => {
  assert.equal(parseGitHubUrl("https://github.com"), null);
  assert.equal(parseGitHubUrl("https://github.com/"), null);
  assert.equal(parseGitHubUrl("https://github.com/foo"), null);
  assert.equal(parseGitHubUrl("https://github.com/foo/"), null);
});

test("parseGitHubUrl parses a bare owner/repo URL", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/badlogic/pi-mono"), {
    owner: "badlogic",
    repo: "pi-mono",
  });
});

test("parseGitHubUrl strips a trailing '.git' from the repo name", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/badlogic/pi-mono.git"), {
    owner: "badlogic",
    repo: "pi-mono",
  });
});

test("parseGitHubUrl tolerates a trailing slash", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/badlogic/pi-mono/"), {
    owner: "badlogic",
    repo: "pi-mono",
  });
});

test("parseGitHubUrl parses tree URLs with ref and nested path", () => {
  assert.deepEqual(
    parseGitHubUrl(
      "https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent",
    ),
    {
      owner: "badlogic",
      repo: "pi-mono",
      type: "tree",
      ref: "main",
      path: "packages/coding-agent",
    },
  );
});

test("parseGitHubUrl parses blob URLs with ref and file path", () => {
  assert.deepEqual(
    parseGitHubUrl("https://github.com/badlogic/pi-mono/blob/main/README.md"),
    {
      owner: "badlogic",
      repo: "pi-mono",
      type: "blob",
      ref: "main",
      path: "README.md",
    },
  );
});

test("parseGitHubUrl ignores unknown third segments (not blob/tree)", () => {
  assert.deepEqual(
    parseGitHubUrl("https://github.com/badlogic/pi-mono/issues/42"),
    { owner: "badlogic", repo: "pi-mono" },
  );
});

test("parseGitHubUrl parses tree URL with ref but no path", () => {
  assert.deepEqual(
    parseGitHubUrl("https://github.com/badlogic/pi-mono/tree/main"),
    {
      owner: "badlogic",
      repo: "pi-mono",
      type: "tree",
      ref: "main",
    },
  );
});
