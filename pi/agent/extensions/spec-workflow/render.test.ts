import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStatus } from "./render.ts";

test("formatStatus renders compact task progress", () => {
  assert.equal(
    formatStatus({
      slug: "sample",
      phase: "execute",
      tasks: [{ status: "complete" }, { status: "pending" }],
    }),
    "Spec sample: execute · 1/2 tasks complete",
  );
});

test("formatStatus handles missing details", () => {
  assert.equal(formatStatus(undefined), "No active spec.");
});
