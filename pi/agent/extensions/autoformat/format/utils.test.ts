import { test } from "node:test";
import assert from "node:assert/strict";
import { getToolPath } from "./utils.ts";

test("getToolPath reads path from input", () => {
  assert.equal(getToolPath({ input: { path: "src/foo.ts" } }), "src/foo.ts");
});

test("getToolPath falls back to details when input has no path", () => {
  assert.equal(
    getToolPath({ input: {}, details: { path: "src/foo.ts" } }),
    "src/foo.ts",
  );
});

test("getToolPath prefers input over details when both have a path", () => {
  assert.equal(
    getToolPath({
      input: { path: "from-input.ts" },
      details: { path: "from-details.ts" },
    }),
    "from-input.ts",
  );
});

test("getToolPath strips a leading @ from the path", () => {
  assert.equal(getToolPath({ input: { path: "@src/foo.ts" } }), "src/foo.ts");
});

test("getToolPath trims surrounding whitespace", () => {
  assert.equal(
    getToolPath({ input: { path: "   src/foo.ts  " } }),
    "src/foo.ts",
  );
});

test("getToolPath returns null for blank or whitespace-only paths", () => {
  assert.equal(getToolPath({ input: { path: "" } }), null);
  assert.equal(getToolPath({ input: { path: "   " } }), null);
});

test("getToolPath returns null when neither input nor details have a usable path", () => {
  assert.equal(getToolPath({}), null);
  assert.equal(getToolPath({ input: {}, details: {} }), null);
  assert.equal(getToolPath({ input: { path: 42 as unknown as string } }), null);
});
