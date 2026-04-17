import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize } from "./tools.ts";

test("summarize returns just the name when description is missing", () => {
  assert.equal(summarize({ name: "github.create_pr" }), "github.create_pr");
});

test("summarize joins name and first description line with an em-dash", () => {
  assert.equal(
    summarize({
      name: "github.create_pr",
      description: "Create a pull request",
    }),
    "github.create_pr — Create a pull request",
  );
});

test("summarize uses only the first non-empty line of a multi-line description", () => {
  assert.equal(
    summarize({
      name: "git.push",
      description: "\n  \nPush commits\nExtra detail below",
    }),
    "git.push — Push commits",
  );
});

test("summarize omits the dash when description is an empty string", () => {
  assert.equal(summarize({ name: "foo.bar", description: "" }), "foo.bar");
});

test("summarize omits the dash when description is whitespace-only", () => {
  assert.equal(
    summarize({ name: "foo.bar", description: "   \n  \n" }),
    "foo.bar",
  );
});
