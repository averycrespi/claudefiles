import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSpecEvent, createEvent, readSpecEvents } from "./events.ts";

test("appendSpecEvent writes JSONL events", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-events-"));
  try {
    const path = join(dir, "events.jsonl");
    await appendSpecEvent(
      path,
      createEvent(
        "phase_started",
        { phase: "execute" },
        new Date("2026-05-09T00:00:00.000Z"),
      ),
    );

    assert.equal(
      await readFile(path, "utf8"),
      '{"type":"phase_started","phase":"execute","timestamp":"2026-05-09T00:00:00.000Z"}\n',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readSpecEvents tolerates corrupt JSONL lines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spec-events-"));
  try {
    const path = join(dir, "events.jsonl");
    await writeFile(
      path,
      '{"type":"phase_started","timestamp":"now"}\nnot json\n{"type":1}\n',
      "utf8",
    );

    const result = await readSpecEvents(path);
    assert.equal(result.events.length, 1);
    assert.deepEqual(
      result.corruptLines.map((line) => line.line),
      [2, 3],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
