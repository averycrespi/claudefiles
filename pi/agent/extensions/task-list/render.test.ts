import { test } from "node:test";
import assert from "node:assert/strict";
import {
  glyphFor,
  styleFor,
  summarizeCounts,
  truncateWithPriority,
} from "./render.ts";

test("glyphFor maps each status to the right symbol", () => {
  assert.equal(glyphFor("pending"), "◻");
  assert.equal(glyphFor("in_progress"), "◼");
  assert.equal(glyphFor("completed"), "✔");
  assert.equal(glyphFor("failed"), "✗");
});

test("summarizeCounts formats '<n> tasks (<done> done, <active> in progress, <open> open)'", () => {
  const counts = summarizeCounts([
    { status: "completed" },
    { status: "completed" },
    { status: "in_progress" },
    { status: "pending" },
    { status: "pending" },
  ] as any);
  assert.equal(counts, "5 tasks (2 done, 1 in progress, 2 open)");
});

test("truncateWithPriority keeps recently-completed (< 30s) above older completed", () => {
  const now = Date.now();
  const tasks = [
    { id: 1, status: "completed", completedAt: now - 60_000 }, // old
    { id: 2, status: "completed", completedAt: now - 1_000 }, // recent
    { id: 3, status: "in_progress" },
    { id: 4, status: "pending" },
  ] as any;
  const kept = truncateWithPriority(tasks, 3, now);
  // Priority: recently-completed → in_progress → pending → older-completed
  assert.deepEqual(
    kept.map((t: any) => t.id),
    [2, 3, 4],
  );
});

test("styleFor returns sensible defaults for each status", () => {
  const pending = styleFor("pending");
  assert.equal(pending.color, "muted");
  assert.equal(pending.bold, false);
  assert.equal(pending.strikethrough, false);

  const inProgress = styleFor("in_progress");
  assert.equal(inProgress.color, "accent");
  assert.equal(inProgress.bold, true);
  assert.equal(inProgress.strikethrough, false);

  const completed = styleFor("completed");
  assert.equal(completed.color, "success");
  assert.equal(completed.strikethrough, true);

  const failed = styleFor("failed");
  assert.equal(failed.color, "error");
  assert.equal(failed.bold, true);
});

test("truncateWithPriority returns all tasks when budget exceeds task count", () => {
  const now = Date.now();
  const tasks = [
    { id: 1, status: "pending" },
    { id: 2, status: "in_progress" },
    { id: 3, status: "completed", completedAt: now - 500 },
  ] as any;
  const kept = truncateWithPriority(tasks, 10, now);
  assert.equal(kept.length, 3);
  // Priority ordering: recently-completed (3), in_progress (2), pending (1).
  assert.deepEqual(
    kept.map((t: any) => t.id),
    [3, 2, 1],
  );
});

test("summarizeCounts handles empty lists", () => {
  assert.equal(summarizeCounts([]), "0 tasks (0 done, 0 in progress, 0 open)");
});

test("summarizeCounts excludes failed tasks from done/open/in-progress buckets", () => {
  const counts = summarizeCounts([
    { status: "completed" },
    { status: "in_progress" },
    { status: "pending" },
    { status: "failed" },
    { status: "failed" },
  ] as any);
  assert.equal(counts, "5 tasks (1 done, 1 in progress, 1 open)");
});
