# autoralph Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Build a `/autoralph` Pi extension that runs an autonomous Ralph-style iteration loop on a design doc, sibling to `/autopilot`, so the two pipelines can be compared side-by-side.

**Architecture:** Single-phase TypeScript orchestrator dispatches one fresh subagent per iteration; cross-iteration warmth comes from an agent-curated handoff blob plus a persistent task file the agent owns. Every UX surface (status widget, final report, preflight, single-active-run lock, cancel) mirrors `/autopilot` so the two pipelines are A/B-comparable. Vendor-copies `dispatch.ts`, `parse.ts`, `preflight.ts` from `pi/agent/extensions/autopilot/` for experimental isolation.

**Tech Stack:** TypeScript on Node ≥ 20, `@mariozechner/pi-coding-agent` Extension API, `@sinclair/typebox` for JSON schemas, `node:test` + `tsx` for tests.

**Reference design:** `.designs/2026-04-20-autoralph.md` — read this first; the plan implements it.

---

## Task 1: Scaffold extension directory + register noop commands

**Files:**

- Create: `pi/agent/extensions/autoralph/index.ts`

**Step 1: Create the directory and a minimal `index.ts` that registers both commands as stubs**

Create `pi/agent/extensions/autoralph/index.ts`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("autoralph-cancel", {
    description: "Cancel the currently running /autoralph pipeline.",
    handler: async (_args, ctx) => {
      ctx.ui.notify("/autoralph-cancel: not yet implemented", "info");
    },
  });

  pi.registerCommand("autoralph", {
    description:
      "Run the autonomous Ralph-style iteration loop on a design document.",
    handler: async (_args, ctx) => {
      ctx.ui.notify("/autoralph: not yet implemented", "info");
    },
  });
}
```

**Step 2: Run typecheck to verify the extension compiles**

Run: `make typecheck`
Expected: passes (zero errors).

**Step 3: Run the test suite to verify nothing regressed**

Run: `make test`
Expected: passes (no new tests added; existing autopilot tests still pass).

**Step 4: Commit**

```bash
git add pi/agent/extensions/autoralph/index.ts
git commit -m "feat(autoralph): scaffold extension with noop commands"
```

---

## Task 2: Vendor preflight from autopilot

**Files:**

- Create: `pi/agent/extensions/autoralph/preflight.ts`
- Create: `pi/agent/extensions/autoralph/preflight.test.ts`

**Step 1: Copy `preflight.ts` byte-for-byte**

```bash
cp pi/agent/extensions/autopilot/preflight.ts \
   pi/agent/extensions/autoralph/preflight.ts
```

No edits needed — the logic is identical (design exists, clean tree, capture base SHA).

**Step 2: Copy `preflight.test.ts` and adapt the temp-dir prefixes**

```bash
cp pi/agent/extensions/autopilot/preflight.test.ts \
   pi/agent/extensions/autoralph/preflight.test.ts
```

Then edit `pi/agent/extensions/autoralph/preflight.test.ts`: replace every occurrence of `"autopilot-preflight-"` with `"autoralph-preflight-"` and `"autopilot-design-"` with `"autoralph-design-"`. (Use `Edit` with `replace_all: true`.)

**Step 3: Run the new tests**

Run: `npx tsx --test pi/agent/extensions/autoralph/preflight.test.ts`
Expected: 5 tests pass.

**Step 4: Run full typecheck + test**

Run: `make typecheck && make test`
Expected: both pass.

**Step 5: Commit**

```bash
git add pi/agent/extensions/autoralph/preflight.ts \
        pi/agent/extensions/autoralph/preflight.test.ts
git commit -m "feat(autoralph): vendor preflight from autopilot"
```

---

## Task 3: Vendor dispatch from autopilot

**Files:**

- Create: `pi/agent/extensions/autoralph/lib/dispatch.ts`
- Create: `pi/agent/extensions/autoralph/lib/dispatch.test.ts`

**Step 1: Copy both files byte-for-byte**

```bash
mkdir -p pi/agent/extensions/autoralph/lib
cp pi/agent/extensions/autopilot/lib/dispatch.ts \
   pi/agent/extensions/autoralph/lib/dispatch.ts
cp pi/agent/extensions/autopilot/lib/dispatch.test.ts \
   pi/agent/extensions/autoralph/lib/dispatch.test.ts
```

No edits — `dispatch.ts` only imports from `subagents/api.ts` (a peer extension), which is path-relative and works equally well from autoralph's location.

**Step 2: Run the vendored tests**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/dispatch.test.ts`
Expected: passes (same count as autopilot's).

**Step 3: Run full typecheck**

Run: `make typecheck`
Expected: passes.

**Step 4: Commit**

```bash
git add pi/agent/extensions/autoralph/lib/dispatch.ts \
        pi/agent/extensions/autoralph/lib/dispatch.test.ts
git commit -m "feat(autoralph): vendor dispatch from autopilot"
```

---

## Task 4: Vendor parse from autopilot

**Files:**

- Create: `pi/agent/extensions/autoralph/lib/parse.ts`
- Create: `pi/agent/extensions/autoralph/lib/parse.test.ts`

**Step 1: Copy both files byte-for-byte**

```bash
cp pi/agent/extensions/autopilot/lib/parse.ts \
   pi/agent/extensions/autoralph/lib/parse.ts
cp pi/agent/extensions/autopilot/lib/parse.test.ts \
   pi/agent/extensions/autoralph/lib/parse.test.ts
```

No edits — `parse.ts` is pure-logic and self-contained.

**Step 2: Run vendored tests**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/parse.test.ts`
Expected: passes.

**Step 3: Commit**

```bash
git add pi/agent/extensions/autoralph/lib/parse.ts \
        pi/agent/extensions/autoralph/lib/parse.test.ts
git commit -m "feat(autoralph): vendor parse from autopilot"
```

---

## Task 5: Define IterationReportSchema

**Files:**

- Create: `pi/agent/extensions/autoralph/lib/schemas.ts`
- Create: `pi/agent/extensions/autoralph/lib/schemas.test.ts`

**Step 1: Write the failing test**

Create `pi/agent/extensions/autoralph/lib/schemas.test.ts`:

```typescript
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
```

**Step 2: Run to confirm it fails**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/schemas.test.ts`
Expected: FAIL — `Cannot find module './schemas.ts'`.

**Step 3: Implement the schema**

Create `pi/agent/extensions/autoralph/lib/schemas.ts`:

```typescript
import { Type, type Static } from "@sinclair/typebox";

export const IterationReportSchema = Type.Object({
  outcome: Type.Union([
    Type.Literal("in_progress"),
    Type.Literal("complete"),
    Type.Literal("failed"),
  ]),
  summary: Type.String({ minLength: 1 }),
  handoff: Type.String(),
});

export type IterationReport = Static<typeof IterationReportSchema>;
```

**Step 4: Run tests to verify pass**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/schemas.test.ts`
Expected: 6 tests pass.

**Step 5: Commit**

```bash
git add pi/agent/extensions/autoralph/lib/schemas.ts \
        pi/agent/extensions/autoralph/lib/schemas.test.ts
git commit -m "feat(autoralph): add IterationReportSchema"
```

---

## Task 6: handoff.ts — read/write handoff.json + bootstrap detection

**Files:**

- Create: `pi/agent/extensions/autoralph/lib/handoff.ts`
- Create: `pi/agent/extensions/autoralph/lib/handoff.test.ts`

**Step 1: Write the failing tests**

Create `pi/agent/extensions/autoralph/lib/handoff.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHandoff, writeHandoff, isBootstrap } from "./handoff.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "autoralph-handoff-"));
}

test("readHandoff returns null when file does not exist", async () => {
  const dir = tempDir();
  try {
    const result = await readHandoff(join(dir, "missing.handoff.json"));
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeHandoff then readHandoff round-trips", async () => {
  const dir = tempDir();
  const path = join(dir, "design.handoff.json");
  try {
    await writeHandoff(path, "I tried X, next try Y");
    const result = await readHandoff(path);
    assert.equal(result, "I tried X, next try Y");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeHandoff creates parent directory if missing", async () => {
  const dir = tempDir();
  const path = join(dir, "nested", "design.handoff.json");
  try {
    await writeHandoff(path, "x");
    const result = await readHandoff(path);
    assert.equal(result, "x");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isBootstrap returns true when no handoff file exists", async () => {
  const dir = tempDir();
  try {
    const result = await isBootstrap(join(dir, "missing.handoff.json"));
    assert.equal(result, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isBootstrap returns false after a handoff has been written", async () => {
  const dir = tempDir();
  const path = join(dir, "design.handoff.json");
  try {
    await writeHandoff(path, "anything");
    const result = await isBootstrap(path);
    assert.equal(result, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

**Step 2: Run to confirm failure**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/handoff.test.ts`
Expected: FAIL — `Cannot find module './handoff.ts'`.

**Step 3: Implement**

Create `pi/agent/extensions/autoralph/lib/handoff.ts`:

```typescript
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readHandoff(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.handoff === "string"
    ) {
      return parsed.handoff;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeHandoff(
  path: string,
  handoff: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ handoff }, null, 2), "utf8");
}

export async function isBootstrap(path: string): Promise<boolean> {
  try {
    await stat(path);
    return false;
  } catch {
    return true;
  }
}
```

**Step 4: Run tests to verify pass**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/handoff.test.ts`
Expected: 5 tests pass.

**Step 5: Commit**

```bash
git add pi/agent/extensions/autoralph/lib/handoff.ts \
        pi/agent/extensions/autoralph/lib/handoff.test.ts
git commit -m "feat(autoralph): add handoff read/write + bootstrap detection"
```

---

## Task 7: history.ts — append-only iteration log

**Files:**

- Create: `pi/agent/extensions/autoralph/lib/history.ts`
- Create: `pi/agent/extensions/autoralph/lib/history.test.ts`

**Step 1: Write the failing tests**

Create `pi/agent/extensions/autoralph/lib/history.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHistory, appendHistory, type IterationRecord } from "./history.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "autoralph-history-"));
}

const sampleRecord = (
  n: number,
  outcome: IterationRecord["outcome"],
): IterationRecord => ({
  iteration: n,
  outcome,
  summary: `iter ${n}`,
  headBefore: "sha0",
  headAfter: outcome === "in_progress" ? "sha1" : "sha0",
  durationMs: 1000 * n,
  reflection: false,
});

test("readHistory returns empty array when file does not exist", async () => {
  const dir = tempDir();
  try {
    const result = await readHistory(join(dir, "missing.history.json"));
    assert.deepEqual(result, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendHistory creates the file on first call", async () => {
  const dir = tempDir();
  const path = join(dir, "design.history.json");
  try {
    await appendHistory(path, sampleRecord(1, "in_progress"));
    const result = await readHistory(path);
    assert.equal(result.length, 1);
    assert.equal(result[0].iteration, 1);
    assert.equal(result[0].outcome, "in_progress");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendHistory preserves prior entries", async () => {
  const dir = tempDir();
  const path = join(dir, "design.history.json");
  try {
    await appendHistory(path, sampleRecord(1, "in_progress"));
    await appendHistory(path, sampleRecord(2, "in_progress"));
    await appendHistory(path, sampleRecord(3, "complete"));
    const result = await readHistory(path);
    assert.equal(result.length, 3);
    assert.deepEqual(
      result.map((r) => r.iteration),
      [1, 2, 3],
    );
    assert.equal(result[2].outcome, "complete");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendHistory creates parent directory if missing", async () => {
  const dir = tempDir();
  const path = join(dir, "nested", "design.history.json");
  try {
    await appendHistory(path, sampleRecord(1, "in_progress"));
    const result = await readHistory(path);
    assert.equal(result.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readHistory returns empty array on corrupt JSON", async () => {
  const dir = tempDir();
  const path = join(dir, "broken.history.json");
  try {
    const fs = await import("node:fs/promises");
    await fs.writeFile(path, "{not json", "utf8");
    const result = await readHistory(path);
    assert.deepEqual(result, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

**Step 2: Run to confirm failure**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/history.test.ts`
Expected: FAIL — `Cannot find module './history.ts'`.

**Step 3: Implement**

Create `pi/agent/extensions/autoralph/lib/history.ts`:

```typescript
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type IterationOutcome =
  | "in_progress"
  | "complete"
  | "failed"
  | "timeout"
  | "parse_error"
  | "dispatch_error";

export interface IterationRecord {
  iteration: number;
  outcome: IterationOutcome;
  summary: string;
  headBefore: string;
  headAfter: string;
  durationMs: number;
  reflection: boolean;
}

export async function readHistory(path: string): Promise<IterationRecord[]> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendHistory(
  path: string,
  record: IterationRecord,
): Promise<void> {
  const existing = await readHistory(path);
  existing.push(record);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), "utf8");
}
```

**Step 4: Run tests to verify pass**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/history.test.ts`
Expected: 5 tests pass.

**Step 5: Commit**

```bash
git add pi/agent/extensions/autoralph/lib/history.ts \
        pi/agent/extensions/autoralph/lib/history.test.ts
git commit -m "feat(autoralph): add iteration history log"
```

---

## Task 8: Iteration prompt templates

**Files:**

- Create: `pi/agent/extensions/autoralph/prompts/iterate.md`
- Create: `pi/agent/extensions/autoralph/prompts/reflection-block.md`

**Step 1: Create `prompts/iterate.md`**

```markdown
You are iteration {N} of {MAX} of an autoralph loop. Your job is one focused
chunk of work this iteration, then end your turn.

=== Context ===

Design document: {DESIGN_PATH}
Working task file: {TASK_FILE_PATH}
{BOOTSTRAP_OR_HANDOFF}

{REFLECTION_BLOCK}

=== Protocol ===

1. Read what you need (design, task file, recent files). Don't re-read files
   you've already touched in this iteration.
2. Make one focused chunk of progress: pick the next thing on your checklist,
   do it, and update the task file as you go.
3. If you produced a coherent change, commit it. Use a conventional commit
   message: `<type>(<scope>): <description>`, imperative mood, under 50 chars.
   It's OK to skip the commit if this iteration was planning, reading, or
   reflection only.
4. Write your handoff for the next iteration: what you just did, what you
   tried that didn't work, what to do next. Be specific — your successor
   has no memory of this turn.
5. Report back as strict JSON:

{
"outcome": "in_progress" | "complete" | "failed",
"summary": "<one sentence describing this iteration>",
"handoff": "<free-form notes for the next iteration>"
}

=== Outcomes ===

- "in_progress": work is underway; loop should continue.
- "complete": every checklist item is done and the design's goals are met.
  Pick this carefully — it terminates the loop.
- "failed": the work is blocked in a way you can't unblock yourself
  (missing dependency, fundamentally unclear requirement, broken environment).

=== Constraints ===

- Do ONE focused chunk of work this iteration. Don't try to finish everything.
- Don't re-read files you've already touched in this iteration.
- When you've made forward progress (or determined you're blocked), write your
  handoff and end your turn. Don't keep going.
- Don't create documentation files unless the design explicitly asks for it.

Output ONLY the JSON object. No prose before or after. No markdown code fences.
```

**Step 2: Create `prompts/reflection-block.md`**

```markdown
=== Reflection checkpoint ===

Before doing any new work this iteration, pause and reflect. Update the
task file with your answers to:

1. What's been accomplished so far?
2. What's working well?
3. What's not working or blocking progress?
4. Should the approach be adjusted? If so, how?
5. What are the highest-value next priorities?

Then continue with one chunk of work as usual. Your iteration outcome should
still reflect real progress (it's fine to mark this iteration "in_progress"
even if the only commit is to the task file with reflection notes).
```

**Step 3: Verify both files exist and have non-zero length**

Run: `wc -l pi/agent/extensions/autoralph/prompts/*.md`
Expected: both files non-empty.

**Step 4: Commit**

```bash
git add pi/agent/extensions/autoralph/prompts/iterate.md \
        pi/agent/extensions/autoralph/prompts/reflection-block.md
git commit -m "feat(autoralph): add iteration + reflection prompt templates"
```

---

## Task 9: phases/iterate.ts — single iteration dispatch

**Files:**

- Create: `pi/agent/extensions/autoralph/phases/iterate.ts`
- Create: `pi/agent/extensions/autoralph/phases/iterate.test.ts`

**Step 1: Write the failing tests**

Create `pi/agent/extensions/autoralph/phases/iterate.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runIteration } from "./iterate.ts";

const validJson = (
  overrides: Partial<{
    outcome: string;
    summary: string;
    handoff: string;
  }> = {},
) =>
  JSON.stringify({
    outcome: "in_progress",
    summary: "did a thing",
    handoff: "next: do another thing",
    ...overrides,
  });

function makeHeadSeq(shas: string[]) {
  let i = 0;
  return async () => {
    const sha = shas[Math.min(i, shas.length - 1)];
    i++;
    return sha;
  };
}

test("runIteration returns in_progress with parsed handoff on happy path", async () => {
  const result = await runIteration({
    iteration: 2,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "previous handoff",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({ ok: true, stdout: validJson() }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.equal(result.outcome, "in_progress");
  assert.equal(result.summary, "did a thing");
  assert.equal(result.handoff, "next: do another thing");
  assert.equal(result.headBefore, "sha0");
  assert.equal(result.headAfter, "sha1");
});

test("runIteration returns complete outcome", async () => {
  const result = await runIteration({
    iteration: 7,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({
      ok: true,
      stdout: validJson({ outcome: "complete" }),
    }),
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.equal(result.outcome, "complete");
});

test("runIteration returns failed outcome", async () => {
  const result = await runIteration({
    iteration: 3,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({
      ok: true,
      stdout: validJson({ outcome: "failed", summary: "blocked" }),
    }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.summary, "blocked");
});

test("runIteration returns parse_error on malformed JSON", async () => {
  const result = await runIteration({
    iteration: 4,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({ ok: true, stdout: "this is not json" }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "parse_error");
  assert.match(result.summary, /invalid report/i);
  assert.equal(result.handoff, null);
});

test("runIteration returns dispatch_error when dispatch fails", async () => {
  const result = await runIteration({
    iteration: 5,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async () => ({ ok: false, stdout: "", error: "boom" }),
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "dispatch_error");
  assert.match(result.summary, /boom/);
});

test("runIteration returns timeout when dispatch reports aborted via timer", async () => {
  // Simulate the dispatch behaving as if its abort signal fired due to the
  // wall-clock timer — ok: false + aborted: true.
  const result = await runIteration({
    iteration: 6,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: false,
    timeoutMs: 50,
    cwd: process.cwd(),
    dispatch: async (opts) => {
      // Wait long enough that the wrapped timer fires and aborts.
      await new Promise((r) => setTimeout(r, 100));
      const aborted = opts.signal?.aborted ?? false;
      return {
        ok: false,
        stdout: "",
        error: aborted ? "aborted" : "x",
        aborted,
      };
    },
    getHead: makeHeadSeq(["sha0", "sha0"]),
  });
  assert.equal(result.outcome, "timeout");
});

test("runIteration prompt includes bootstrap section on iteration 1", async () => {
  let capturedPrompt = "";
  await runIteration({
    iteration: 1,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: null,
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async (opts) => {
      capturedPrompt = opts.prompt;
      return { ok: true, stdout: validJson() };
    },
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /This is iteration 1/);
  assert.match(capturedPrompt, /create .*design\.md/i);
});

test("runIteration prompt includes prior handoff on iteration 2+", async () => {
  let capturedPrompt = "";
  await runIteration({
    iteration: 2,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "carried-over notes",
    isReflection: false,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async (opts) => {
      capturedPrompt = opts.prompt;
      return { ok: true, stdout: validJson() };
    },
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /Prior iteration's handoff/);
  assert.match(capturedPrompt, /carried-over notes/);
});

test("runIteration prompt includes reflection block when isReflection is true", async () => {
  let capturedPrompt = "";
  await runIteration({
    iteration: 5,
    maxIterations: 50,
    designPath: "design.md",
    taskFilePath: ".autoralph/design.md",
    priorHandoff: "x",
    isReflection: true,
    timeoutMs: 60_000,
    cwd: process.cwd(),
    dispatch: async (opts) => {
      capturedPrompt = opts.prompt;
      return { ok: true, stdout: validJson() };
    },
    getHead: makeHeadSeq(["sha0", "sha1"]),
  });
  assert.match(capturedPrompt, /Reflection checkpoint/i);
});
```

**Step 2: Run to confirm failure**

Run: `npx tsx --test pi/agent/extensions/autoralph/phases/iterate.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement `phases/iterate.ts`**

Create `pi/agent/extensions/autoralph/phases/iterate.ts`:

```typescript
import { readFile } from "node:fs/promises";
import type { DispatchFn } from "../lib/dispatch.ts";
import { parseJsonReport } from "../lib/parse.ts";
import { IterationReportSchema } from "../lib/schemas.ts";
import type { IterationOutcome } from "../lib/history.ts";

const ITERATE_PROMPT = new URL("../prompts/iterate.md", import.meta.url);
const REFLECTION_BLOCK = new URL(
  "../prompts/reflection-block.md",
  import.meta.url,
);

let cachedTemplate: string | null = null;
let cachedReflection: string | null = null;

async function loadTemplates(): Promise<{
  template: string;
  reflection: string;
}> {
  if (cachedTemplate === null)
    cachedTemplate = await readFile(ITERATE_PROMPT, "utf8");
  if (cachedReflection === null)
    cachedReflection = await readFile(REFLECTION_BLOCK, "utf8");
  return { template: cachedTemplate, reflection: cachedReflection };
}

export interface RunIterationArgs {
  iteration: number;
  maxIterations: number;
  designPath: string;
  taskFilePath: string;
  /** null on iteration 1 (bootstrap) — anything else is the previous handoff. */
  priorHandoff: string | null;
  isReflection: boolean;
  timeoutMs: number;
  cwd: string;
  dispatch: DispatchFn;
  getHead: () => Promise<string>;
  /** Optional run-level abort signal (e.g. /autoralph-cancel). */
  signal?: AbortSignal;
}

export interface IterationOutcomeRecord {
  outcome: IterationOutcome;
  summary: string;
  handoff: string | null;
  headBefore: string;
  headAfter: string;
  durationMs: number;
}

export async function runIteration(
  args: RunIterationArgs,
): Promise<IterationOutcomeRecord> {
  const { template, reflection } = await loadTemplates();

  const bootstrapOrHandoff =
    args.priorHandoff === null
      ? `This is iteration 1. The task file does not yet exist — read the design at ${args.designPath}, create ${args.taskFilePath} with goals + a checklist + initial notes, then begin work.`
      : `Prior iteration's handoff: ${JSON.stringify(args.priorHandoff)}\nRead ${args.taskFilePath} (your prior notes), then continue from the handoff.`;

  const prompt = template
    .replace("{N}", String(args.iteration))
    .replace("{MAX}", String(args.maxIterations))
    .replace("{DESIGN_PATH}", args.designPath)
    .replace("{TASK_FILE_PATH}", args.taskFilePath)
    .replace("{BOOTSTRAP_OR_HANDOFF}", bootstrapOrHandoff)
    .replace("{REFLECTION_BLOCK}", args.isReflection ? reflection : "");

  // Wrap caller signal + wall-clock timer in a single controller.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  const onParentAbort = () => controller.abort();
  if (args.signal) {
    if (args.signal.aborted) controller.abort();
    else args.signal.addEventListener("abort", onParentAbort, { once: true });
  }

  const startedAt = Date.now();
  const headBefore = await args.getHead();

  let dispatchResult;
  try {
    dispatchResult = await args.dispatch({
      prompt,
      tools: ["read", "write", "edit", "bash"],
      extensions: ["autoformat"],
      cwd: args.cwd,
      intent: `Iteration ${args.iteration}${args.isReflection ? " (reflection)" : ""}`,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (args.signal) args.signal.removeEventListener("abort", onParentAbort);
  }

  const durationMs = Date.now() - startedAt;
  const headAfter = await args.getHead();

  // Distinguish timeout (our timer fired) from parent cancel (parent signal fired first).
  const timedOut =
    !args.signal?.aborted && controller.signal.aborted && !dispatchResult.ok;

  if (!dispatchResult.ok) {
    if (timedOut || dispatchResult.aborted) {
      return {
        outcome: "timeout",
        summary: `iteration timed out after ${Math.round(durationMs / 1000)}s`,
        handoff: null,
        headBefore,
        headAfter,
        durationMs,
      };
    }
    return {
      outcome: "dispatch_error",
      summary: `dispatch failed: ${dispatchResult.error ?? "unknown"}`,
      handoff: null,
      headBefore,
      headAfter,
      durationMs,
    };
  }

  const parsed = parseJsonReport(dispatchResult.stdout, IterationReportSchema);
  if (!parsed.ok) {
    return {
      outcome: "parse_error",
      summary: `invalid report: ${parsed.error}`,
      handoff: null,
      headBefore,
      headAfter,
      durationMs,
    };
  }

  return {
    outcome: parsed.data.outcome,
    summary: parsed.data.summary,
    handoff: parsed.data.handoff,
    headBefore,
    headAfter,
    durationMs,
  };
}
```

**Step 4: Run tests to verify pass**

Run: `npx tsx --test pi/agent/extensions/autoralph/phases/iterate.test.ts`
Expected: 9 tests pass.

**Step 5: Commit**

```bash
git add pi/agent/extensions/autoralph/phases/iterate.ts \
        pi/agent/extensions/autoralph/phases/iterate.test.ts
git commit -m "feat(autoralph): add per-iteration dispatch phase"
```

---

## Task 10: lib/status-widget.ts — iter N/MAX header + iteration window

**Files:**

- Create: `pi/agent/extensions/autoralph/lib/status-widget.ts`
- Create: `pi/agent/extensions/autoralph/lib/status-widget.test.ts`

The widget mirrors `pi/agent/extensions/autopilot/lib/status-widget.ts` but: (a) header shows `autoralph · iter N/MAX · MM:SS` instead of the stage breadcrumb, (b) body shows the iteration window from `history.json` instead of a task list, (c) reflection iterations get a `🪞` glyph.

**Step 1: Write the failing tests**

Create `pi/agent/extensions/autoralph/lib/status-widget.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStatusWidget, type StatusWidgetUi } from "./status-widget.ts";
import type { IterationRecord } from "./history.ts";

function mkUi(): StatusWidgetUi & {
  calls: Array<[string, string[] | undefined]>;
} {
  const calls: Array<[string, string[] | undefined]> = [];
  return {
    calls,
    setWidget(key, content) {
      calls.push([key, content]);
    },
  };
}

function mkClock(start: number) {
  let t = start;
  return { advance: (ms: number) => (t += ms), now: () => t };
}

const rec = (
  n: number,
  outcome: IterationRecord["outcome"],
  reflection = false,
): IterationRecord => ({
  iteration: n,
  outcome,
  summary: `iter ${n} summary`,
  headBefore: "sha0",
  headAfter:
    outcome === "in_progress" || outcome === "complete" ? `sha${n}` : "sha0",
  durationMs: 1000,
  reflection,
});

test("status-widget: header shows autoralph · iter N/MAX · MM:SS", () => {
  const ui = mkUi();
  const clock = mkClock(0);
  const w = createStatusWidget({ ui, now: clock.now, tickMs: 60_000 });
  try {
    w.setIteration(7, 50);
    clock.advance(12_000);
    const lines = w.renderLines();
    assert.match(lines[0], /^autoralph · iter 7\/50 · 00:12$/);
  } finally {
    w.dispose();
  }
});

test("status-widget: header before setIteration shows iter 0/0", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    const lines = w.renderLines();
    assert.match(lines[0], /^autoralph · iter 0\/0 · \d\d:\d\d$/);
  } finally {
    w.dispose();
  }
});

test("status-widget: subagent intent appears with elapsed", () => {
  const ui = mkUi();
  const clock = mkClock(0);
  const w = createStatusWidget({ ui, now: clock.now, tickMs: 60_000 });
  try {
    w.setIteration(3, 50);
    const handle = w.subagent("Iteration 3");
    clock.advance(102_000);
    const lines = w.renderLines();
    handle.finish();
    const subRow = lines.find((l) => l.includes("Iteration 3"));
    assert.ok(subRow, "subagent row should be present");
    assert.match(subRow!, /\(01:42\)/);
  } finally {
    w.dispose();
  }
});

test("status-widget: history window shows last 2 done + counts", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    w.setHistory([
      rec(1, "in_progress"),
      rec(2, "in_progress"),
      rec(3, "in_progress"),
      rec(4, "in_progress"),
      rec(5, "in_progress"),
    ]);
    w.setIteration(6, 50);
    const lines = w.renderLines();
    const historyHeader = lines.find((l) => l.includes("history:"));
    assert.ok(historyHeader, "history header should be present");
    assert.match(historyHeader!, /5 done/);
    // Last 2 completed iterations should be in the window.
    assert.ok(lines.some((l) => l.includes("4. iter 4")));
    assert.ok(lines.some((l) => l.includes("5. iter 5")));
    // The earlier ones should not.
    assert.ok(!lines.some((l) => l.includes("1. iter 1")));
  } finally {
    w.dispose();
  }
});

test("status-widget: reflection iteration gets reflection glyph", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    w.setHistory([rec(5, "in_progress", true)]);
    w.setIteration(6, 50);
    const lines = w.renderLines();
    const reflectionRow = lines.find((l) => l.includes("5. iter 5"));
    assert.ok(reflectionRow);
    assert.match(reflectionRow!, /🪞/);
  } finally {
    w.dispose();
  }
});

test("status-widget: counts include timeouts", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    w.setHistory([rec(1, "in_progress"), rec(2, "timeout"), rec(3, "timeout")]);
    w.setIteration(4, 50);
    const lines = w.renderLines();
    const historyHeader = lines.find((l) => l.includes("history:"));
    assert.match(historyHeader!, /2 timeouts/);
  } finally {
    w.dispose();
  }
});

test("status-widget: footer shows cancel hint", () => {
  const ui = mkUi();
  const w = createStatusWidget({ ui, tickMs: 60_000 });
  try {
    const lines = w.renderLines();
    assert.ok(lines[lines.length - 1].includes("/autoralph-cancel"));
  } finally {
    w.dispose();
  }
});
```

**Step 2: Run to confirm failure**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/status-widget.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement `lib/status-widget.ts`**

Create `pi/agent/extensions/autoralph/lib/status-widget.ts`:

```typescript
import type { Theme } from "@mariozechner/pi-coding-agent";
import {
  createSubagentActivityTracker,
  type SubagentActivityTracker,
} from "../../subagents/api.ts";
import type { IterationRecord } from "./history.ts";

export interface StatusWidgetUi {
  setWidget(key: string, content: string[] | undefined): void;
}

export type WidgetTheme = Pick<Theme, "fg" | "bold" | "strikethrough">;

export interface SubagentHandle {
  onEvent(event: unknown): void;
  finish(): void;
}

export interface StatusWidget {
  setIteration(iteration: number, max: number): void;
  setHistory(history: IterationRecord[]): void;
  subagent(intent: string): SubagentHandle;
  renderLines(): string[];
  dispose(): void;
}

export interface StatusWidgetOptions {
  ui?: StatusWidgetUi;
  theme?: WidgetTheme;
  key?: string;
  now?: () => number;
  tickMs?: number;
}

const DEFAULT_KEY = "autoralph";
const DEFAULT_TICK_MS = 1000;
const MAX_HISTORY_BEFORE = 2;
const MAX_EVENTS_SINGLE = 3;
const MAX_EVENTS_MULTI = 1;

interface LiveSubagent {
  id: number;
  intent: string;
  tracker: SubagentActivityTracker;
  startedAt: number;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function truncate(text: string, max = 100): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function createStatusWidget(
  opts: StatusWidgetOptions = {},
): StatusWidget {
  const ui = opts.ui;
  const theme = opts.theme;
  const key = opts.key ?? DEFAULT_KEY;
  const now = opts.now ?? Date.now;
  const tickMs = opts.tickMs ?? DEFAULT_TICK_MS;

  const muted = (text: string) => (theme ? theme.fg("muted", text) : text);
  const dim = (text: string) => (theme ? theme.fg("dim", text) : text);
  const accent = (text: string) => (theme ? theme.fg("accent", text) : text);
  const errorStyle = (text: string) => (theme ? theme.fg("error", text) : text);
  const bold = (text: string) => (theme ? theme.bold(text) : text);

  const startedAt = now();
  let iteration = 0;
  let maxIterations = 0;
  let history: IterationRecord[] = [];
  let nextId = 1;
  const live = new Map<number, LiveSubagent>();
  let disposed = false;

  const push = () => {
    if (disposed || !ui) return;
    ui.setWidget(key, renderLines());
  };

  const tick = setInterval(push, tickMs);

  function renderHistoryRow(r: IterationRecord): string {
    const glyph = r.reflection
      ? "🪞"
      : r.outcome === "complete" || r.outcome === "in_progress"
        ? "✔"
        : r.outcome === "failed"
          ? "✗"
          : r.outcome === "timeout"
            ? "⏱"
            : "•";
    const sha =
      r.headAfter !== r.headBefore ? ` (${r.headAfter.slice(0, 7)})` : "";
    return `${glyph} ${r.iteration}. ${truncate(r.summary, 64)}${sha}`;
  }

  function renderLines(): string[] {
    const lines: string[] = [];
    const elapsed = formatClock(now() - startedAt);
    const header = `${bold(accent("autoralph"))}${muted(" · ")}${muted(`iter ${iteration}/${maxIterations}`)}${muted(` · ${elapsed}`)}`;
    lines.push(header);

    const maxEvents = live.size >= 2 ? MAX_EVENTS_MULTI : MAX_EVENTS_SINGLE;
    for (const entry of live.values()) {
      const state = entry.tracker.state;
      const subElapsed = formatClock(now() - entry.startedAt);
      lines.push(`  ${muted("↳")} ${entry.intent} ${dim(`(${subElapsed})`)}`);
      const events = (state.recentEvents ?? []).slice(-maxEvents);
      for (const e of events) {
        const style = e.kind === "stderr" ? errorStyle : dim;
        const prefix = e.kind === "stderr" ? "stderr: " : "";
        lines.push(`     ${dim("-")} ${style(prefix + e.text)}`);
      }
    }

    if (history.length > 0) {
      const done = history.filter(
        (r) => r.outcome === "in_progress" || r.outcome === "complete",
      ).length;
      const commits = history.filter(
        (r) => r.headAfter !== r.headBefore,
      ).length;
      const timeouts = history.filter((r) => r.outcome === "timeout").length;
      lines.push(
        `  ${muted(`history: ${done} done (${commits} commits) · ${timeouts} timeouts`)}`,
      );
      const window = history.slice(
        Math.max(0, history.length - MAX_HISTORY_BEFORE),
      );
      for (const r of window) {
        lines.push(`    ${renderHistoryRow(r)}`);
      }
    }

    lines.push(dim("type /autoralph-cancel to stop"));
    return lines;
  }

  return {
    setIteration(n, max) {
      iteration = n;
      maxIterations = max;
      push();
    },
    setHistory(h) {
      history = h;
      push();
    },
    subagent(intent) {
      const id = nextId++;
      const tracker = createSubagentActivityTracker({
        toolCallId: `autoralph:${id}`,
        roleLabel: intent,
        intent,
        showActivity: false,
        hasUI: false,
      });
      const entry: LiveSubagent = { id, intent, tracker, startedAt: now() };
      live.set(id, entry);
      push();
      return {
        onEvent(event) {
          tracker.handleEvent(event);
          push();
        },
        finish() {
          live.delete(id);
          push();
        },
      };
    },
    renderLines,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(tick);
      if (ui) ui.setWidget(key, undefined);
      live.clear();
    },
  };
}
```

**Step 4: Run tests to verify pass**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/status-widget.test.ts`
Expected: 7 tests pass.

**Step 5: Commit**

```bash
git add pi/agent/extensions/autoralph/lib/status-widget.ts \
        pi/agent/extensions/autoralph/lib/status-widget.test.ts
git commit -m "feat(autoralph): add iteration status widget"
```

---

## Task 11: lib/report.ts — final report formatter

**Files:**

- Create: `pi/agent/extensions/autoralph/lib/report.ts`
- Create: `pi/agent/extensions/autoralph/lib/report.test.ts`

**Step 1: Write the failing tests**

Create `pi/agent/extensions/autoralph/lib/report.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReport } from "./report.ts";
import type { IterationRecord } from "./history.ts";

const rec = (
  n: number,
  outcome: IterationRecord["outcome"],
  reflection = false,
  summary = `iter ${n}`,
): IterationRecord => ({
  iteration: n,
  outcome,
  summary,
  headBefore: "sha0",
  headAfter:
    outcome === "in_progress" || outcome === "complete" ? `abc${n}234` : "sha0",
  durationMs: 1000,
  reflection,
});

const baseInput = {
  designPath: ".designs/2026-04-20-rate-limiter.md",
  branchName: "workflow",
  commitsAhead: 4,
  taskFilePath: ".autoralph/2026-04-20-rate-limiter.md",
  finalHandoff: "All checklist items complete; tests passing locally.",
  totalElapsedMs: 14 * 60_000 + 22_000,
};

test("report: complete outcome lists all iterations + commits + handoff", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "complete",
    history: [
      rec(1, "in_progress", false, "bootstrap: read design, write task file"),
      rec(2, "in_progress", false, "add rate limiter config + types"),
      rec(3, "in_progress", false, "wire config into middleware"),
    ],
  });
  assert.match(text, /Autoralph Report/);
  assert.match(text, /Outcome: complete/);
  assert.match(text, /after 3 iterations/);
  assert.match(text, /14:22/);
  assert.match(text, /1\. bootstrap/);
  assert.match(text, /\(abc2234\)/);
  assert.match(text, /Final handoff:/);
  assert.match(text, /All checklist items complete/);
});

test("report: reflection iteration gets reflection glyph", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "complete",
    history: [
      rec(1, "in_progress"),
      rec(2, "in_progress", true, "reflection: noted test gap"),
    ],
  });
  const reflectionLine = text
    .split("\n")
    .find((l) => l.includes("2. reflection"));
  assert.ok(reflectionLine);
  assert.match(reflectionLine!, /🪞/);
});

test("report: max-iterations outcome", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "max-iterations",
    history: [rec(1, "in_progress"), rec(2, "in_progress")],
  });
  assert.match(text, /Outcome: max-iterations/);
});

test("report: failed outcome surfaces last summary", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "failed",
    history: [
      rec(1, "in_progress"),
      rec(2, "failed", false, "blocked: missing rate-limiter package"),
    ],
  });
  assert.match(text, /Outcome: failed/);
  assert.match(text, /blocked: missing rate-limiter package/);
});

test("report: stuck outcome", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "stuck",
    history: [
      rec(1, "in_progress"),
      rec(2, "timeout"),
      rec(3, "timeout"),
      rec(4, "timeout"),
    ],
  });
  assert.match(text, /Outcome: stuck \(3 consecutive timeouts\)/);
});

test("report: cancelled outcome shows elapsed", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "cancelled",
    history: [rec(1, "in_progress")],
  });
  assert.match(text, /Outcome: cancelled/);
});

test("report: iteration without commit shows '(no commit)'", () => {
  const text = formatReport({
    ...baseInput,
    outcome: "complete",
    history: [rec(1, "in_progress", false, "planning iteration")],
  });
  // headBefore === headAfter (both "sha0") → no commit
  const planningLine = text.split("\n").find((l) => l.includes("1. planning"));
  assert.ok(planningLine);
  assert.match(planningLine!, /\(no commit\)/);
});
```

**Step 2: Run to confirm failure**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/report.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement `lib/report.ts`**

Create `pi/agent/extensions/autoralph/lib/report.ts`:

```typescript
import type { IterationRecord } from "./history.ts";

export type FinalOutcome =
  | "complete"
  | "max-iterations"
  | "failed"
  | "stuck"
  | "cancelled";

export interface ReportInput {
  designPath: string;
  branchName: string;
  commitsAhead: number;
  taskFilePath: string;
  finalHandoff: string | null;
  totalElapsedMs: number;
  outcome: FinalOutcome;
  history: IterationRecord[];
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function outcomeLine(
  outcome: FinalOutcome,
  history: IterationRecord[],
  elapsedMs: number,
): string {
  const elapsed = formatElapsed(elapsedMs);
  const n = history.length;
  switch (outcome) {
    case "complete":
      return `Outcome: complete  (after ${n} iterations, ${elapsed} elapsed)`;
    case "max-iterations":
      return `Outcome: max-iterations  (${n} iterations, ${elapsed} elapsed)`;
    case "failed": {
      const last = history[history.length - 1];
      const reason = last?.summary ?? "no summary available";
      return `Outcome: failed  (${n} iterations, ${elapsed} elapsed)\nReason:  ${reason}`;
    }
    case "stuck":
      return `Outcome: stuck (3 consecutive timeouts)  (${n} iterations, ${elapsed} elapsed)`;
    case "cancelled":
      return `Outcome: cancelled  (${n} iterations, ${elapsed} elapsed)`;
  }
}

function rowGlyph(r: IterationRecord): string {
  if (r.reflection) return "🪞";
  switch (r.outcome) {
    case "complete":
    case "in_progress":
      return "✔ ";
    case "failed":
      return "✗ ";
    case "timeout":
      return "⏱ ";
    case "parse_error":
    case "dispatch_error":
      return "✗ ";
  }
}

function shaSuffix(r: IterationRecord): string {
  return r.headAfter !== r.headBefore
    ? `(${r.headAfter.slice(0, 7)})`
    : "(no commit)";
}

export function formatReport(input: ReportInput): string {
  const lines: string[] = [];
  lines.push("━━━ Autoralph Report ━━━");
  lines.push("");
  lines.push(`Design:  ${input.designPath}`);
  lines.push(
    `Branch:  ${input.branchName}  (${input.commitsAhead} commits ahead of main)`,
  );
  lines.push(outcomeLine(input.outcome, input.history, input.totalElapsedMs));
  lines.push("");
  lines.push(`Iterations (${input.history.length}):`);
  for (const r of input.history) {
    const glyph = rowGlyph(r);
    const num = String(r.iteration).padStart(2, " ");
    const summary = r.summary;
    const sha = shaSuffix(r);
    lines.push(`  ${glyph} ${num}. ${summary}    ${sha}`);
  }
  lines.push("");
  lines.push(`Final task file: ${input.taskFilePath}`);
  if (input.finalHandoff) {
    lines.push(`Final handoff:   ${JSON.stringify(input.finalHandoff)}`);
  }
  return lines.join("\n");
}
```

**Step 4: Run tests to verify pass**

Run: `npx tsx --test pi/agent/extensions/autoralph/lib/report.test.ts`
Expected: 7 tests pass.

**Step 5: Commit**

```bash
git add pi/agent/extensions/autoralph/lib/report.ts \
        pi/agent/extensions/autoralph/lib/report.test.ts
git commit -m "feat(autoralph): add final report formatter"
```

---

## Task 12: index.ts — orchestrator + command registration

**Files:**

- Modify: `pi/agent/extensions/autoralph/index.ts` (replace the noop stubs from Task 1 with the real orchestrator).

This is the wiring step: parse args, run preflight, set up the AbortController, build the iteration loop, drive the status widget, persist handoff + history each iteration, emit the final report, and tear down. Mirrors `pi/agent/extensions/autopilot/index.ts` but for the single-phase loop.

No new test file — `index.ts` matches autopilot's pattern (no top-level wiring tests; the unit tests on `iterate.ts`, `report.ts`, `status-widget.ts`, etc. cover the logic).

**Step 1: Replace `pi/agent/extensions/autoralph/index.ts`**

```typescript
import { execFile } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  dispatch as rawDispatch,
  type DispatchOptions,
  type DispatchResult,
} from "./lib/dispatch.ts";
import {
  appendHistory,
  readHistory,
  type IterationRecord,
} from "./lib/history.ts";
import { isBootstrap, readHandoff, writeHandoff } from "./lib/handoff.ts";
import { formatReport, type FinalOutcome } from "./lib/report.ts";
import { createStatusWidget, type StatusWidget } from "./lib/status-widget.ts";
import { runIteration } from "./phases/iterate.ts";
import { preflight } from "./preflight.ts";

const execFileP = promisify(execFile);

const AUTORALPH_DIR = ".autoralph";
const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_REFLECT_EVERY = 5;
const DEFAULT_TIMEOUT_MINS = 15;
const MAX_CONSECUTIVE_TIMEOUTS = 3;

interface ActiveRun {
  controller: AbortController;
  startedAt: number;
}
let activeRun: ActiveRun | null = null;

interface ParsedArgs {
  designPath: string;
  reflectEvery: number;
  maxIterations: number;
  timeoutMins: number;
}

function parseArgs(input: string): ParsedArgs | { error: string } {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { error: "missing design file path" };
  const out: ParsedArgs = {
    designPath: "",
    reflectEvery: DEFAULT_REFLECT_EVERY,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    timeoutMins: DEFAULT_TIMEOUT_MINS,
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--reflect-every") {
      const v = parseInt(tokens[++i] ?? "", 10);
      if (!Number.isFinite(v) || v < 0)
        return { error: "--reflect-every requires a non-negative integer" };
      out.reflectEvery = v;
    } else if (t === "--max-iterations") {
      const v = parseInt(tokens[++i] ?? "", 10);
      if (!Number.isFinite(v) || v < 1)
        return { error: "--max-iterations requires a positive integer" };
      out.maxIterations = v;
    } else if (t === "--iteration-timeout-mins") {
      const v = parseInt(tokens[++i] ?? "", 10);
      if (!Number.isFinite(v) || v < 1)
        return {
          error: "--iteration-timeout-mins requires a positive integer",
        };
      out.timeoutMins = v;
    } else if (t.startsWith("--")) {
      return { error: `unknown flag: ${t}` };
    } else if (!out.designPath) {
      out.designPath = t;
    } else {
      return { error: `unexpected positional argument: ${t}` };
    }
  }
  if (!out.designPath) return { error: "missing design file path" };
  return out;
}

function makeGetHead(cwd: string): () => Promise<string> {
  return async () => {
    const { stdout } = await execFileP("git", ["rev-parse", "HEAD"], { cwd });
    return stdout.trim();
  };
}

async function resolveBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileP("git", ["branch", "--show-current"], {
      cwd,
    });
    return stdout.trim() || "(detached)";
  } catch {
    return "(unknown)";
  }
}

async function resolveCommitsAhead(
  cwd: string,
  baseSha: string,
): Promise<number> {
  try {
    const { stdout } = await execFileP(
      "git",
      ["rev-list", "--count", `${baseSha}..HEAD`],
      { cwd },
    );
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

function makeWrappedDispatch(
  widget: StatusWidget,
  signal: AbortSignal,
): (opts: DispatchOptions) => Promise<DispatchResult> {
  return async (opts) => {
    const intent = opts.intent ?? "subagent";
    const handle = widget.subagent(intent);
    try {
      return await rawDispatch({
        ...opts,
        signal: opts.signal ?? signal,
        onEvent: (event) => {
          opts.onEvent?.(event);
          handle.onEvent(event);
        },
      });
    } finally {
      handle.finish();
    }
  };
}

function designBasename(designPath: string): string {
  return basename(designPath, extname(designPath));
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("autoralph-cancel", {
    description: "Cancel the currently running /autoralph loop.",
    handler: async (_args, ctx) => {
      if (!activeRun) {
        ctx.ui.notify("/autoralph-cancel: no autoralph run is active", "info");
        return;
      }
      ctx.ui.notify(
        "/autoralph-cancel: cancelling — will stop after current iteration",
        "warning",
      );
      activeRun.controller.abort();
    },
  });

  pi.registerCommand("autoralph", {
    description:
      "Run the autonomous Ralph-style iteration loop on a design document.",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();

      const parsed = parseArgs(args);
      if ("error" in parsed) {
        ctx.ui.notify(
          `/autoralph: ${parsed.error} (usage: /autoralph <design.md> [--reflect-every N] [--max-iterations N] [--iteration-timeout-mins N])`,
          "error",
        );
        return;
      }

      if (activeRun) {
        ctx.ui.notify(
          "/autoralph: a run is already active — use /autoralph-cancel to stop it first",
          "error",
        );
        return;
      }

      const cwd = process.cwd();
      const pre = await preflight({ designPath: parsed.designPath, cwd });
      if (!pre.ok) {
        ctx.ui.notify(`/autoralph: ${pre.reason}`, "error");
        return;
      }

      const controller = new AbortController();
      const startedAt = Date.now();
      activeRun = { controller, startedAt };

      const widget = createStatusWidget({
        ui: ctx.hasUI ? ctx.ui : undefined,
        theme: ctx.hasUI ? ctx.ui.theme : undefined,
      });
      widget.setIteration(0, parsed.maxIterations);

      const dispatch = makeWrappedDispatch(widget, controller.signal);
      const getHead = makeGetHead(cwd);

      const slug = designBasename(parsed.designPath);
      const taskFilePath = join(cwd, AUTORALPH_DIR, `${slug}.md`);
      const handoffPath = join(cwd, AUTORALPH_DIR, `${slug}.handoff.json`);
      const historyPath = join(cwd, AUTORALPH_DIR, `${slug}.history.json`);

      ctx.ui.notify(
        `/autoralph: started (base ${pre.baseSha.slice(0, 7)})`,
        "info",
      );

      const pipeline = async () => {
        let outcome: FinalOutcome = "max-iterations";
        let consecutiveTimeouts = 0;
        let finalHandoff: string | null = await readHandoff(handoffPath);

        try {
          for (let i = 1; i <= parsed.maxIterations; i++) {
            if (controller.signal.aborted) {
              outcome = "cancelled";
              break;
            }
            widget.setIteration(i, parsed.maxIterations);

            const bootstrap = await isBootstrap(handoffPath);
            const priorHandoff = bootstrap
              ? null
              : await readHandoff(handoffPath);
            const isReflection =
              parsed.reflectEvery > 0 &&
              i > 1 &&
              (i - 1) % parsed.reflectEvery === 0;

            const result = await runIteration({
              iteration: i,
              maxIterations: parsed.maxIterations,
              designPath: parsed.designPath,
              taskFilePath: taskFilePath,
              priorHandoff,
              isReflection,
              timeoutMs: parsed.timeoutMins * 60_000,
              cwd,
              dispatch,
              getHead,
              signal: controller.signal,
            });

            const record: IterationRecord = {
              iteration: i,
              outcome: result.outcome,
              summary: result.summary,
              headBefore: result.headBefore,
              headAfter: result.headAfter,
              durationMs: result.durationMs,
              reflection: isReflection,
            };
            await appendHistory(historyPath, record);
            widget.setHistory(await readHistory(historyPath));

            if (result.handoff !== null) {
              await writeHandoff(handoffPath, result.handoff);
              finalHandoff = result.handoff;
            }

            if (result.outcome === "timeout") {
              consecutiveTimeouts++;
              if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
                outcome = "stuck";
                break;
              }
              continue;
            }
            consecutiveTimeouts = 0;

            if (controller.signal.aborted) {
              outcome = "cancelled";
              break;
            }
            if (result.outcome === "complete") {
              outcome = "complete";
              break;
            }
            if (result.outcome === "failed") {
              outcome = "failed";
              break;
            }
            // in_progress, parse_error, dispatch_error → continue loop
          }

          const history = await readHistory(historyPath);
          const [branchName, commitsAhead] = await Promise.all([
            resolveBranch(cwd),
            resolveCommitsAhead(cwd, pre.baseSha),
          ]);
          const text = formatReport({
            designPath: parsed.designPath,
            branchName,
            commitsAhead,
            taskFilePath: resolve(taskFilePath),
            finalHandoff,
            totalElapsedMs: Date.now() - startedAt,
            outcome,
            history,
          });
          pi.sendMessage({
            customType: "autoralph-report",
            content: [{ type: "text", text }],
            display: true,
            details: {},
          });
        } finally {
          widget.dispose();
          activeRun = null;
        }
      };

      const run = pipeline().catch((err) => {
        ctx.ui.notify(
          `/autoralph: pipeline crashed — ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      });
      if (!ctx.hasUI) await run;
      else void run;
    },
  });
}
```

**Step 2: Run typecheck to verify it compiles**

Run: `make typecheck`
Expected: passes (zero errors).

**Step 3: Run the full test suite**

Run: `make test`
Expected: all tests pass (existing autopilot + new autoralph tests).

**Step 4: Commit**

```bash
git add pi/agent/extensions/autoralph/index.ts
git commit -m "feat(autoralph): wire orchestrator + commands"
```

---

## Task 13: Add README.md for the extension

**Files:**

- Create: `pi/agent/extensions/autoralph/README.md`

**Step 1: Lift the design doc as the extension README**

```bash
cp .designs/2026-04-20-autoralph.md pi/agent/extensions/autoralph/README.md
```

**Step 2: Verify it exists and renders**

Run: `wc -l pi/agent/extensions/autoralph/README.md`
Expected: file exists, several hundred lines.

**Step 3: Commit**

```bash
git add pi/agent/extensions/autoralph/README.md
git commit -m "docs(autoralph): add README from design doc"
```

---

## Task 14: Final smoke — run typecheck + test together

**Step 1: Run typecheck**

Run: `make typecheck`
Expected: passes.

**Step 2: Run full test suite**

Run: `make test`
Expected: passes — both autopilot's tests and autoralph's new tests (preflight: 5, dispatch: same as autopilot, parse: same as autopilot, schemas: 6, handoff: 5, history: 5, iterate: 9, status-widget: 7, report: 7).

**Step 3: Verify directory structure matches the plan**

Run: `find pi/agent/extensions/autoralph -type f | sort`
Expected output (paths only):

```
pi/agent/extensions/autoralph/README.md
pi/agent/extensions/autoralph/index.ts
pi/agent/extensions/autoralph/lib/dispatch.test.ts
pi/agent/extensions/autoralph/lib/dispatch.ts
pi/agent/extensions/autoralph/lib/handoff.test.ts
pi/agent/extensions/autoralph/lib/handoff.ts
pi/agent/extensions/autoralph/lib/history.test.ts
pi/agent/extensions/autoralph/lib/history.ts
pi/agent/extensions/autoralph/lib/parse.test.ts
pi/agent/extensions/autoralph/lib/parse.ts
pi/agent/extensions/autoralph/lib/report.test.ts
pi/agent/extensions/autoralph/lib/report.ts
pi/agent/extensions/autoralph/lib/schemas.test.ts
pi/agent/extensions/autoralph/lib/schemas.ts
pi/agent/extensions/autoralph/lib/status-widget.test.ts
pi/agent/extensions/autoralph/lib/status-widget.ts
pi/agent/extensions/autoralph/phases/iterate.test.ts
pi/agent/extensions/autoralph/phases/iterate.ts
pi/agent/extensions/autoralph/preflight.test.ts
pi/agent/extensions/autoralph/preflight.ts
pi/agent/extensions/autoralph/prompts/iterate.md
pi/agent/extensions/autoralph/prompts/reflection-block.md
```

If everything passes, the extension is feature-complete per the design. Manual smoke (re-stowing, invoking `/autoralph` against a real design doc) is the user's responsibility — there is no automated end-to-end test that would exercise the real Pi subagent runtime.

<!-- No top-level documentation updates needed — CLAUDE.md and README.md describe the per-extension directory pattern in general; the new extension is self-documenting via its own README. -->
