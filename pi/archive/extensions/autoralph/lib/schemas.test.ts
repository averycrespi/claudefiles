import { test } from "node:test";
import assert from "node:assert/strict";
import { Value } from "@sinclair/typebox/value";
import { IterationReportSchema } from "./schemas.ts";

test("IterationReportSchema accepts in_progress + handoff", () => {
  const ok = Value.Check(IterationReportSchema, {
    outcome: "in_progress",
    summary: "added rate limiter scaffold",
    handoff: "next: wire config into middleware",
  });
  assert.equal(ok, true);
});

test("IterationReportSchema accepts complete", () => {
  const ok = Value.Check(IterationReportSchema, {
    outcome: "complete",
    summary: "all checklist items done",
    handoff: "tests passing locally",
  });
  assert.equal(ok, true);
});

test("IterationReportSchema accepts failed", () => {
  const ok = Value.Check(IterationReportSchema, {
    outcome: "failed",
    summary: "blocked: missing dep",
    handoff: "tried X, fell over on Y",
  });
  assert.equal(ok, true);
});

test("IterationReportSchema rejects unknown outcome", () => {
  const ok = Value.Check(IterationReportSchema, {
    outcome: "success",
    summary: "x",
    handoff: "y",
  });
  assert.equal(ok, false);
});

test("IterationReportSchema rejects empty summary", () => {
  const ok = Value.Check(IterationReportSchema, {
    outcome: "in_progress",
    summary: "",
    handoff: "y",
  });
  assert.equal(ok, false);
});

test("IterationReportSchema rejects missing handoff", () => {
  const ok = Value.Check(IterationReportSchema, {
    outcome: "in_progress",
    summary: "x",
  });
  assert.equal(ok, false);
});
