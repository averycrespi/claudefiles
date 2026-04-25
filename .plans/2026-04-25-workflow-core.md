# workflow-core Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Build the `workflow-core` Pi extension that exposes Subagent, Run, Widget, Report, and Log primitives plus opt-in render/report/preflight helpers, per `.designs/2026-04-25-workflow-core.md`.

**Architecture:** Library-style Pi extension; registers no slash commands itself (consumed by sibling extensions like autopilot/autoralph). Public surface in `api.ts`, `render.ts`, `report.ts`, `preflight.ts`. Internals in `lib/`. Bottom-up build order: pure helpers → Subagent → Widget → Log → Run (the integrator). TDD throughout with `node:test` + `tsx`.

**Tech Stack:** TypeScript (strict), TypeBox schemas, `node:test` + `tsx`, Pi extension API (`@mariozechner/pi-coding-agent`), `subagents` extension's `spawnSubagent`.

**Spec reference:** `.designs/2026-04-25-workflow-core.md` is the authoritative spec for behavior. Tasks reference design sections by number (e.g. §3 Widget). Tests verify behavior against the spec; impl is whatever passes.

**Test conventions:** Files colocated as `*.test.ts`. Run via `npx tsx --test pi/agent/extensions/workflow-core/**/*.test.ts` or `make test`. Imports use `.ts` extensions (`from "./foo.ts"`). Use `import { describe, test } from "node:test"; import { strict as assert } from "node:assert"`.

**Dependency injection for testability:** Subagent factory accepts a `spawn` function (defaults to real `spawnSubagent`). Widget factory accepts `now()` and `tickMs`. Log factory accepts a base directory (use `os.tmpdir()` in tests).

---

## Task 1: Scaffold extension directory and no-op entry point

**Files:**

- Create: `pi/agent/extensions/workflow-core/index.ts`
- Create: `pi/agent/extensions/workflow-core/lib/types.ts`

**Step 1: Create the directory tree.**

```bash
mkdir -p pi/agent/extensions/workflow-core/lib pi/agent/extensions/workflow-core/render pi/agent/extensions/workflow-core/report
```

**Step 2: Write `index.ts` as a no-op default export.**

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// workflow-core registers no commands of its own. Sibling extensions
// (autopilot, autoralph, etc.) consume its primitives via api.ts.
export default function (_pi: ExtensionAPI): void {}
```

**Step 3: Write `lib/types.ts` with the shared type vocabulary from the design (§1, §3).**

```ts
import type { TSchema, Static } from "@sinclair/typebox";

export type ToolName =
  | "read"
  | "write"
  | "edit"
  | "bash"
  | "ls"
  | "find"
  | "grep";

export type RetryPolicy = "none" | "one-retry-on-dispatch";

export interface DispatchSpec<S extends TSchema> {
  intent: string;
  prompt: string;
  schema: S;
  schemaName?: string; // for log; defaults to "<anonymous>"
  tools: ReadonlyArray<ToolName>;
  extensions?: string[];
  model?: string;
  thinking?: "low" | "medium" | "high";
  timeoutMs?: number;
  retry?: RetryPolicy;
}

export type DispatchResult<S extends TSchema> =
  | { ok: true; data: Static<S>; raw: string }
  | {
      ok: false;
      reason: "dispatch" | "parse" | "schema" | "timeout" | "aborted";
      error: string;
      raw?: string;
    };

export type ToolEvent = unknown; // forwarded from Pi; opaque to us

export interface SubagentSlot {
  id: number;
  intent: string;
  startedAt: number;
  recentEvents: ReadonlyArray<ToolEvent>;
  status: "running" | "finished";
}
```

**Step 4: Verify typecheck passes.**

Run: `make typecheck`
Expected: PASS (no output or "tsc --noEmit" success)

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/
git commit -m "feat(workflow-core): scaffold extension directory"
```

---

## Task 2: Port `lib/parse.ts` from autopilot

**Files:**

- Create: `pi/agent/extensions/workflow-core/lib/parse.ts`
- Create: `pi/agent/extensions/workflow-core/lib/parse.test.ts`

**Step 1: Write the failing tests.**

````ts
// lib/parse.test.ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { Type } from "@sinclair/typebox";
import { parseJsonReport } from "./parse.ts";

const Schema = Type.Object({ ok: Type.Boolean(), n: Type.Number() });

describe("parseJsonReport", () => {
  test("happy path", () => {
    const r = parseJsonReport(`{"ok": true, "n": 42}`, Schema);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.data, { ok: true, n: 42 });
  });

  test("strips ```json fences", () => {
    const r = parseJsonReport('```json\n{"ok": true, "n": 1}\n```', Schema);
    assert.equal(r.ok, true);
  });

  test("strips leading prose to find the first JSON object", () => {
    const r = parseJsonReport(
      'Some prose before.\n{"ok": true, "n": 1}\nTrailing prose.',
      Schema,
    );
    assert.equal(r.ok, true);
  });

  test("invalid JSON returns ok:false reason 'parse'", () => {
    const r = parseJsonReport("{not json", Schema);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /JSON parse error/);
  });

  test("schema mismatch returns ok:false with field paths", () => {
    const r = parseJsonReport(`{"ok": "yes", "n": 1}`, Schema);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /Schema validation/);
  });
});
````

**Step 2: Run tests, see them fail.**

Run: `npx tsx --test pi/agent/extensions/workflow-core/lib/parse.test.ts`
Expected: FAIL — `parseJsonReport` not found.

**Step 3: Implement `parse.ts` (lifted verbatim from `pi/agent/extensions/autopilot/lib/parse.ts`).**

````ts
import { Value } from "@sinclair/typebox/value";
import type { TSchema, Static } from "@sinclair/typebox";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function parseJsonReport<S extends TSchema>(
  raw: string,
  schema: S,
): ParseResult<Static<S>> {
  const stripped = stripWrappers(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as Error).message}` };
  }
  if (!Value.Check(schema, parsed)) {
    const errors = [...Value.Errors(schema, parsed)]
      .slice(0, 3)
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    return { ok: false, error: `Schema validation failed: ${errors}` };
  }
  return { ok: true, data: parsed as Static<S> };
}

function stripWrappers(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (fence) return fence[1].trim();
  const match = raw.match(/\{[\s\S]*\}/);
  return (match ? match[0] : raw).trim();
}
````

**Step 4: Run tests, see them pass.**

Run: `npx tsx --test pi/agent/extensions/workflow-core/lib/parse.test.ts`
Expected: PASS — all 5 tests.

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/parse.ts pi/agent/extensions/workflow-core/lib/parse.test.ts
git commit -m "feat(workflow-core): add parseJsonReport"
```

---

## Task 3: Preflight helpers

**Files:**

- Create: `pi/agent/extensions/workflow-core/preflight.ts`
- Create: `pi/agent/extensions/workflow-core/preflight.test.ts`

Per design §5, three composable helpers: `requireFile`, `requireCleanTree`, `captureHead`.

**Step 1: Write failing tests.**

```ts
// preflight.test.ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { requireFile, requireCleanTree, captureHead } from "./preflight.ts";

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wc-preflight-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync(
    "git",
    [
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=T",
      "commit",
      "--allow-empty",
      "-m",
      "init",
    ],
    { cwd: dir },
  );
  return dir;
}

describe("requireFile", () => {
  test("ok when file exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wc-rf-"));
    const p = join(dir, "x.txt");
    writeFileSync(p, "hi");
    const r = await requireFile(p);
    assert.equal(r.ok, true);
    rmSync(dir, { recursive: true });
  });

  test("ok:false when missing", async () => {
    const r = await requireFile("/no/such/path/xyz");
    assert.equal(r.ok, false);
  });
});

describe("requireCleanTree", () => {
  test("ok on a clean repo", async () => {
    const dir = makeRepo();
    const r = await requireCleanTree(dir);
    assert.equal(r.ok, true);
    rmSync(dir, { recursive: true });
  });

  test("ok:false when there are uncommitted changes", async () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "dirty.txt"), "dirty");
    const r = await requireCleanTree(dir);
    assert.equal(r.ok, false);
    rmSync(dir, { recursive: true });
  });
});

describe("captureHead", () => {
  test("returns the HEAD sha as a 40-char hex string", async () => {
    const dir = makeRepo();
    const sha = await captureHead(dir);
    assert.match(sha, /^[0-9a-f]{40}$/);
    rmSync(dir, { recursive: true });
  });
});
```

**Step 2: Run tests, see them fail.**

Run: `npx tsx --test pi/agent/extensions/workflow-core/preflight.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement `preflight.ts`.**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";

const exec = promisify(execFile);

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function requireFile(
  path: string,
): Promise<Result<{ path: string }>> {
  try {
    const st = await stat(path);
    if (!st.isFile())
      return { ok: false, error: `not a regular file: ${path}` };
    return { ok: true, data: { path } };
  } catch (e) {
    return {
      ok: false,
      error: `cannot read file: ${path} (${(e as Error).message})`,
    };
  }
}

export async function requireCleanTree(
  cwd: string,
): Promise<Result<Record<string, never>>> {
  try {
    const { stdout } = await exec("git", ["status", "--porcelain"], { cwd });
    if (stdout.trim().length > 0) {
      return {
        ok: false,
        error: "working tree is not clean (uncommitted changes)",
      };
    }
    return { ok: true, data: {} };
  } catch (e) {
    return { ok: false, error: `git status failed: ${(e as Error).message}` };
  }
}

export async function captureHead(cwd: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}
```

**Step 4: Run tests, see them pass.**

Run: `npx tsx --test pi/agent/extensions/workflow-core/preflight.test.ts`
Expected: PASS — 5 tests.

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/preflight.ts pi/agent/extensions/workflow-core/preflight.test.ts
git commit -m "feat(workflow-core): add preflight helpers"
```

---

## Task 4: Report helper — `header`

**Files:**

- Create: `pi/agent/extensions/workflow-core/report/header.ts`
- Create: `pi/agent/extensions/workflow-core/report/header.test.ts`

**Step 1: Write failing test.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { formatHeader } from "./header.ts";

describe("formatHeader", () => {
  test("renders title surrounded by box-drawing markers", () => {
    assert.equal(formatHeader("Autopilot Report"), "━━━ Autopilot Report ━━━");
  });
});
```

**Step 2: Run, see fail.**

Run: `npx tsx --test pi/agent/extensions/workflow-core/report/header.test.ts`
Expected: FAIL.

**Step 3: Implement.**

```ts
export function formatHeader(title: string): string {
  return `━━━ ${title} ━━━`;
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/report/header.ts pi/agent/extensions/workflow-core/report/header.test.ts
git commit -m "feat(workflow-core): add report formatHeader helper"
```

---

## Task 5: Report helper — `rows` (`formatLabelValueRow`)

**Files:**

- Create: `pi/agent/extensions/workflow-core/report/rows.ts`
- Create: `pi/agent/extensions/workflow-core/report/rows.test.ts`

**Step 1: Write failing tests.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { formatLabelValueRow } from "./rows.ts";

describe("formatLabelValueRow", () => {
  test("default label width pads to 9 chars + colon", () => {
    assert.equal(
      formatLabelValueRow("Design", ".designs/x.md"),
      "Design:   .designs/x.md",
    );
  });

  test("custom label width", () => {
    assert.equal(
      formatLabelValueRow("Design", "x.md", { labelWidth: 12 }),
      "Design:        x.md",
    );
  });

  test("label longer than width still renders one space after colon", () => {
    assert.equal(
      formatLabelValueRow("VeryLongLabel", "x", { labelWidth: 5 }),
      "VeryLongLabel: x",
    );
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement.**

```ts
export interface FormatLabelValueRowOpts {
  labelWidth?: number;
}

export function formatLabelValueRow(
  label: string,
  value: string,
  opts: FormatLabelValueRowOpts = {},
): string {
  const labelWidth = opts.labelWidth ?? 9;
  const labelPart = `${label}:`;
  const padding =
    labelPart.length >= labelWidth
      ? " "
      : " ".repeat(labelWidth - labelPart.length + 1);
  return `${labelPart}${padding}${value}`;
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/report/rows.ts pi/agent/extensions/workflow-core/report/rows.test.ts
git commit -m "feat(workflow-core): add report formatLabelValueRow helper"
```

---

## Task 6: Report helper — `sections` (`formatSection`, `formatGitInfoBlock`, `formatKnownIssues`)

**Files:**

- Create: `pi/agent/extensions/workflow-core/report/sections.ts`
- Create: `pi/agent/extensions/workflow-core/report/sections.test.ts`

**Step 1: Write failing tests.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  formatSection,
  formatGitInfoBlock,
  formatKnownIssues,
} from "./sections.ts";

describe("formatSection", () => {
  test("titled section with indented body lines", () => {
    assert.deepEqual(
      formatSection("Tasks (5/5)", ["✔ 1. add config", "✔ 2. wire it"]),
      ["Tasks (5/5):", "  ✔ 1. add config", "  ✔ 2. wire it"],
    );
  });

  test("empty body section emits just the title line", () => {
    assert.deepEqual(formatSection("Verify", []), ["Verify:"]);
  });
});

describe("formatGitInfoBlock", () => {
  test("renders branch and commit count", () => {
    assert.deepEqual(
      formatGitInfoBlock({ branch: "feature", commitsAhead: 3 }),
      ["Branch:   feature  (3 commits ahead of main)"],
    );
  });

  test("custom base branch", () => {
    assert.deepEqual(
      formatGitInfoBlock({ branch: "f", commitsAhead: 1, baseBranch: "trunk" }),
      ["Branch:   f  (1 commit ahead of trunk)"],
    );
  });
});

describe("formatKnownIssues", () => {
  test("empty list renders nothing (caller decides whether to include section)", () => {
    assert.deepEqual(formatKnownIssues([]), []);
  });

  test("non-empty list renders Known issues section", () => {
    const out = formatKnownIssues(["lint warning in foo.ts:42"]);
    assert.deepEqual(out, ["Known issues:", "  └ lint warning in foo.ts:42"]);
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement.**

```ts
import { formatLabelValueRow } from "./rows.ts";

export function formatSection(
  title: string,
  indentedLines: string[],
): string[] {
  const out: string[] = [`${title}:`];
  for (const line of indentedLines) out.push(`  ${line}`);
  return out;
}

export interface GitInfoBlockOpts {
  branch: string;
  commitsAhead: number;
  baseBranch?: string;
}

export function formatGitInfoBlock(opts: GitInfoBlockOpts): string[] {
  const base = opts.baseBranch ?? "main";
  const noun = opts.commitsAhead === 1 ? "commit" : "commits";
  return [
    formatLabelValueRow(
      "Branch",
      `${opts.branch}  (${opts.commitsAhead} ${noun} ahead of ${base})`,
    ),
  ];
}

export function formatKnownIssues(issues: string[]): string[] {
  if (issues.length === 0) return [];
  const out = ["Known issues:"];
  for (const i of issues) out.push(`  └ ${i}`);
  return out;
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/report/sections.ts pi/agent/extensions/workflow-core/report/sections.test.ts
git commit -m "feat(workflow-core): add report section helpers"
```

---

## Task 7: Report helper — `banners` (cancelled + failure)

**Files:**

- Create: `pi/agent/extensions/workflow-core/report/banners.ts`
- Create: `pi/agent/extensions/workflow-core/report/banners.test.ts`

**Step 1: Write failing tests.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { formatCancelledBanner, formatFailureBanner } from "./banners.ts";

describe("formatCancelledBanner", () => {
  test("formats elapsed as MM:SS", () => {
    assert.equal(formatCancelledBanner(125000), "Cancelled by user at 02:05");
  });

  test("zero elapsed", () => {
    assert.equal(formatCancelledBanner(0), "Cancelled by user at 00:00");
  });
});

describe("formatFailureBanner", () => {
  test("formats reason inline", () => {
    assert.equal(
      formatFailureBanner("plan parse error"),
      "Failed: plan parse error",
    );
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement.**

```ts
function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatCancelledBanner(elapsedMs: number): string {
  return `Cancelled by user at ${mmss(elapsedMs)}`;
}

export function formatFailureBanner(reason: string): string {
  return `Failed: ${reason}`;
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/report/banners.ts pi/agent/extensions/workflow-core/report/banners.test.ts
git commit -m "feat(workflow-core): add report banner helpers"
```

---

## Task 8: Report public re-exports (`report.ts`)

**Files:**

- Create: `pi/agent/extensions/workflow-core/report.ts`

**Step 1: Re-export from sub-modules.**

```ts
export { formatHeader } from "./report/header.ts";
export { formatLabelValueRow } from "./report/rows.ts";
export type { FormatLabelValueRowOpts } from "./report/rows.ts";
export {
  formatSection,
  formatGitInfoBlock,
  formatKnownIssues,
} from "./report/sections.ts";
export type { GitInfoBlockOpts } from "./report/sections.ts";
export {
  formatCancelledBanner,
  formatFailureBanner,
} from "./report/banners.ts";
```

**Step 2: Verify typecheck.**

Run: `make typecheck`
Expected: PASS.

**Step 3: Commit.**

```bash
git add pi/agent/extensions/workflow-core/report.ts
git commit -m "feat(workflow-core): expose report helpers via report.ts"
```

---

## Task 9: Render helper — `clock`

**Files:**

- Create: `pi/agent/extensions/workflow-core/render/clock.ts`
- Create: `pi/agent/extensions/workflow-core/render/clock.test.ts`

**Step 1: Write failing tests.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { renderClock } from "./clock.ts";

describe("renderClock", () => {
  test("MM:SS for under an hour", () => {
    assert.equal(renderClock(125000), "02:05");
  });
  test("clamps negative to 00:00", () => {
    assert.equal(renderClock(-50), "00:00");
  });
  test("HH:MM:SS over an hour", () => {
    assert.equal(renderClock(3661000), "01:01:01");
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement.**

```ts
export function renderClock(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hh > 0) return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  return `${pad(mm)}:${pad(ss)}`;
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/render/clock.ts pi/agent/extensions/workflow-core/render/clock.test.ts
git commit -m "feat(workflow-core): add renderClock helper"
```

---

## Task 10: Render helper — `breadcrumb`

**Files:**

- Create: `pi/agent/extensions/workflow-core/render/breadcrumb.ts`
- Create: `pi/agent/extensions/workflow-core/render/breadcrumb.test.ts`

**Step 1: Write failing tests.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { renderStageBreadcrumb } from "./breadcrumb.ts";

describe("renderStageBreadcrumb", () => {
  test("joins stages with arrow separator", () => {
    assert.equal(
      renderStageBreadcrumb({
        stages: ["plan", "implement", "verify"],
        active: "implement",
      }),
      "plan › implement › verify",
    );
  });

  test("no active stage still renders", () => {
    assert.equal(
      renderStageBreadcrumb({ stages: ["a", "b"], active: null }),
      "a › b",
    );
  });

  test("theme adapter is invoked for active stage when provided", () => {
    const calls: string[] = [];
    const theme = {
      bold: (s: string) => {
        calls.push(`bold:${s}`);
        return s;
      },
      fg: (kind: string, s: string) => {
        calls.push(`fg:${kind}:${s}`);
        return s;
      },
    };
    renderStageBreadcrumb({ stages: ["a", "b"], active: "b", theme });
    assert.ok(
      calls.some((c) => c.startsWith("bold:b") || c.startsWith("fg:accent:b")),
    );
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement.**

```ts
export interface BreadcrumbTheme {
  bold(s: string): string;
  fg(kind: string, s: string): string;
}

export interface BreadcrumbOpts {
  stages: ReadonlyArray<string>;
  active: string | null;
  theme?: BreadcrumbTheme;
}

export function renderStageBreadcrumb(opts: BreadcrumbOpts): string {
  const sep = " › ";
  const styled = opts.stages.map((s) => {
    if (!opts.theme) return s;
    if (s === opts.active) return opts.theme.bold(opts.theme.fg("accent", s));
    return opts.theme.fg("muted", s);
  });
  return styled.join(sep);
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/render/breadcrumb.ts pi/agent/extensions/workflow-core/render/breadcrumb.test.ts
git commit -m "feat(workflow-core): add renderStageBreadcrumb helper"
```

---

## Task 11: Render helper — `counter`

**Files:**

- Create: `pi/agent/extensions/workflow-core/render/counter.ts`
- Create: `pi/agent/extensions/workflow-core/render/counter.test.ts`

**Step 1: Write failing tests.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { renderCounter } from "./counter.ts";

describe("renderCounter", () => {
  test("with total: 'iter 7/50'", () => {
    assert.equal(
      renderCounter({ label: "iter", current: 7, total: 50 }),
      "iter 7/50",
    );
  });
  test("without total: 'iter 7'", () => {
    assert.equal(renderCounter({ label: "iter", current: 7 }), "iter 7");
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement.**

```ts
export interface CounterTheme {
  fg(kind: string, s: string): string;
}

export interface CounterOpts {
  label: string;
  current: number;
  total?: number;
  theme?: CounterTheme;
}

export function renderCounter(opts: CounterOpts): string {
  const value =
    opts.total !== undefined
      ? `${opts.current}/${opts.total}`
      : `${opts.current}`;
  return `${opts.label} ${value}`;
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/render/counter.ts pi/agent/extensions/workflow-core/render/counter.test.ts
git commit -m "feat(workflow-core): add renderCounter helper"
```

---

## Task 12: Render helper — `subagents`

**Files:**

- Create: `pi/agent/extensions/workflow-core/render/subagents.ts`
- Create: `pi/agent/extensions/workflow-core/render/subagents.test.ts`

Per design §3, this turns `SubagentSlot[]` into the `↳ <intent> (MM:SS)` lines plus last-K events under each.

**Step 1: Write failing tests.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { renderSubagents } from "./subagents.ts";
import type { SubagentSlot } from "../lib/types.ts";

const fixedNow = 1000000;

function slot(p: Partial<SubagentSlot>): SubagentSlot {
  return {
    id: 1,
    intent: "Plan",
    startedAt: fixedNow - 65000,
    recentEvents: [],
    status: "running",
    ...p,
  };
}

describe("renderSubagents", () => {
  test("empty slots returns empty array", () => {
    assert.deepEqual(renderSubagents([], { now: () => fixedNow }), []);
  });

  test("single running slot renders intent + clock", () => {
    const lines = renderSubagents([slot({})], { now: () => fixedNow });
    assert.equal(lines[0], "↳ Plan (01:05)");
  });

  test("finished slots are not rendered", () => {
    assert.deepEqual(
      renderSubagents([slot({ status: "finished" })], { now: () => fixedNow }),
      [],
    );
  });

  test("multiple running slots each get a line", () => {
    const lines = renderSubagents(
      [slot({ id: 1, intent: "A" }), slot({ id: 2, intent: "B" })],
      { now: () => fixedNow },
    );
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^↳ A /);
    assert.match(lines[1], /^↳ B /);
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement.**

```ts
import { renderClock } from "./clock.ts";
import type { SubagentSlot } from "../lib/types.ts";

export interface RenderSubagentsTheme {
  fg(kind: string, s: string): string;
}

export interface RenderSubagentsOpts {
  theme?: RenderSubagentsTheme;
  now?: () => number;
}

export function renderSubagents(
  slots: ReadonlyArray<SubagentSlot>,
  opts: RenderSubagentsOpts = {},
): string[] {
  const now = opts.now ?? Date.now;
  const lines: string[] = [];
  for (const s of slots) {
    if (s.status !== "running") continue;
    const elapsed = now() - s.startedAt;
    lines.push(`↳ ${s.intent} (${renderClock(elapsed)})`);
  }
  return lines;
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/render/subagents.ts pi/agent/extensions/workflow-core/render/subagents.test.ts
git commit -m "feat(workflow-core): add renderSubagents helper"
```

---

## Task 13: Render public re-exports (`render.ts`)

**Files:**

- Create: `pi/agent/extensions/workflow-core/render.ts`

**Step 1: Write the re-exports.**

```ts
export { renderClock } from "./render/clock.ts";
export { renderStageBreadcrumb } from "./render/breadcrumb.ts";
export type { BreadcrumbOpts, BreadcrumbTheme } from "./render/breadcrumb.ts";
export { renderCounter } from "./render/counter.ts";
export type { CounterOpts, CounterTheme } from "./render/counter.ts";
export { renderSubagents } from "./render/subagents.ts";
export type {
  RenderSubagentsOpts,
  RenderSubagentsTheme,
} from "./render/subagents.ts";
```

**Step 2: Verify typecheck.**

Run: `make typecheck`
Expected: PASS.

**Step 3: Commit.**

```bash
git add pi/agent/extensions/workflow-core/render.ts
git commit -m "feat(workflow-core): expose render helpers via render.ts"
```

---

## Task 14: Subagent — happy-path `dispatch`

**Files:**

- Create: `pi/agent/extensions/workflow-core/lib/subagent.ts`
- Create: `pi/agent/extensions/workflow-core/lib/subagent.test.ts`

Subagent factory takes a `spawn` function (defaults to real `spawnSubagent`) so tests can inject a fake. Per design §1.

**Step 1: Write the failing test.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { Type } from "@sinclair/typebox";
import { createSubagent } from "./subagent.ts";

const Schema = Type.Object({ outcome: Type.String(), n: Type.Number() });

function fakeSpawn(stdout: string) {
  return async () => ({
    ok: true,
    aborted: false,
    stdout,
    stderr: "",
    exitCode: 0,
    signal: null,
  });
}

describe("Subagent.dispatch — happy path", () => {
  test("returns ok:true with parsed data", async () => {
    const sub = createSubagent({
      spawn: fakeSpawn(`{"outcome":"go","n":7}`),
      cwd: "/tmp",
    });
    const r = await sub.dispatch({
      intent: "test",
      prompt: "do",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.data, { outcome: "go", n: 7 });
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement minimal happy path.**

```ts
// lib/subagent.ts
import type { TSchema } from "@sinclair/typebox";
import {
  spawnSubagent,
  type SpawnOutcome,
  type SpawnInvocation,
} from "../../subagents/api.ts";
import { parseJsonReport } from "./parse.ts";
import type { DispatchResult, DispatchSpec, ToolName } from "./types.ts";

export interface Subagent {
  dispatch<S extends TSchema>(
    spec: DispatchSpec<S>,
  ): Promise<DispatchResult<S>>;
}

export interface CreateSubagentOpts {
  cwd: string;
  spawn?: (inv: SpawnInvocation) => Promise<SpawnOutcome>;
  signal?: AbortSignal;
  onSubagentEvent?: (id: number, event: unknown) => void;
  onSubagentLifecycle?: (
    event:
      | {
          kind: "start";
          id: number;
          spec: DispatchSpec<TSchema>;
          parentId?: number;
        }
      | {
          kind: "end";
          id: number;
          result: DispatchResult<TSchema>;
          durationMs: number;
        },
  ) => void;
}

export function createSubagent(opts: CreateSubagentOpts): Subagent {
  const spawn = opts.spawn ?? spawnSubagent;
  let nextId = 0;

  async function dispatchOne<S extends TSchema>(
    spec: DispatchSpec<S>,
    parentId?: number,
  ): Promise<DispatchResult<S>> {
    const id = ++nextId;
    const startedAt = Date.now();
    opts.onSubagentLifecycle?.({ kind: "start", id, spec, parentId });
    const outcome = await spawn({
      prompt: spec.prompt,
      toolAllowlist: spec.tools as readonly ToolName[] as any,
      extensionAllowlist: spec.extensions ?? [],
      model: spec.model,
      thinking: spec.thinking,
      cwd: opts.cwd,
      signal: opts.signal,
      onEvent: (e) => opts.onSubagentEvent?.(id, e),
    });
    let result: DispatchResult<S>;
    if (!outcome.ok) {
      result = {
        ok: false,
        reason: outcome.aborted ? "aborted" : "dispatch",
        error: outcome.errorMessage ?? `exit ${outcome.exitCode}`,
        raw: outcome.stdout,
      };
    } else {
      const parsed = parseJsonReport(outcome.stdout, spec.schema);
      if (parsed.ok) {
        result = { ok: true, data: parsed.data, raw: outcome.stdout };
      } else {
        const reason = parsed.error.startsWith("JSON parse")
          ? "parse"
          : "schema";
        result = {
          ok: false,
          reason,
          error: parsed.error,
          raw: outcome.stdout,
        };
      }
    }
    opts.onSubagentLifecycle?.({
      kind: "end",
      id,
      result: result as DispatchResult<TSchema>,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }

  return {
    dispatch: (spec) => dispatchOne(spec),
  };
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/subagent.ts pi/agent/extensions/workflow-core/lib/subagent.test.ts
git commit -m "feat(workflow-core): add Subagent.dispatch happy path"
```

---

## Task 15: Subagent — failure modes (parse, schema, dispatch, aborted)

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/subagent.test.ts` (add tests)

The implementation in Task 14 already handles these; this task's job is to lock the behavior with tests.

**Step 1: Add tests for each failure mode.**

```ts
// Append to lib/subagent.test.ts

import type { SpawnOutcome } from "../../subagents/api.ts";

const failedSpawn = (
  errorMessage: string,
  aborted = false,
): (() => Promise<SpawnOutcome>) => {
  return async () => ({
    ok: false,
    aborted,
    stdout: "",
    stderr: "",
    exitCode: 1,
    signal: null,
    errorMessage,
  });
};

describe("Subagent.dispatch — failures", () => {
  test("dispatch failure → reason: 'dispatch'", async () => {
    const sub = createSubagent({ spawn: failedSpawn("crashed"), cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "dispatch");
      assert.match(r.error, /crashed/);
    }
  });

  test("aborted dispatch → reason: 'aborted'", async () => {
    const sub = createSubagent({
      spawn: failedSpawn("aborted by signal", true),
      cwd: "/tmp",
    });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "aborted");
  });

  test("invalid JSON → reason: 'parse'", async () => {
    const sub = createSubagent({
      spawn: fakeSpawn("not valid json"),
      cwd: "/tmp",
    });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "parse");
  });

  test("schema mismatch → reason: 'schema'", async () => {
    const sub = createSubagent({
      spawn: fakeSpawn(`{"outcome":1,"n":"x"}`),
      cwd: "/tmp",
    });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "schema");
  });
});
```

**Step 2: Run tests, all should pass against the existing implementation.**

If any fail, adjust `subagent.ts` to match.

**Step 3: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/subagent.test.ts pi/agent/extensions/workflow-core/lib/subagent.ts
git commit -m "test(workflow-core): cover Subagent.dispatch failure modes"
```

---

## Task 16: Subagent — retry-on-dispatch policy

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/subagent.ts` (add retry logic)
- Modify: `pi/agent/extensions/workflow-core/lib/subagent.test.ts` (add tests)

Per design §1: retry default is `one-retry-on-dispatch`. Guards: don't retry on aborted, on parse/schema, or when run-level signal already aborted. Retry's intent is suffixed `(retry)`. Two ids are emitted (start/end pairs) — design §10 retry handling.

**Step 1: Write failing tests.**

```ts
describe("Subagent.dispatch — retry policy", () => {
  test("retries once on transient dispatch failure (default policy)", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          aborted: false,
          stdout: "",
          stderr: "",
          exitCode: 1,
          signal: null,
          errorMessage: "transient",
        };
      }
      return {
        ok: true,
        aborted: false,
        stdout: `{"outcome":"x","n":1}`,
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "Plan",
      prompt: "x",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, true);
    assert.equal(calls, 2);
  });

  test("does not retry parse failures", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      return {
        ok: true,
        aborted: false,
        stdout: "not json",
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
  });

  test("does not retry aborted dispatches", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      return {
        ok: false,
        aborted: true,
        stdout: "",
        stderr: "",
        exitCode: null,
        signal: "SIGTERM" as NodeJS.Signals,
        errorMessage: "aborted",
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
  });

  test("does not retry when retry policy is 'none'", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      return {
        ok: false,
        aborted: false,
        stdout: "",
        stderr: "",
        exitCode: 1,
        signal: null,
        errorMessage: "transient",
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
      retry: "none",
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
  });

  test("does not retry when run-level signal already aborted", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      return {
        ok: false,
        aborted: false,
        stdout: "",
        stderr: "",
        exitCode: 1,
        signal: null,
        errorMessage: "transient",
      };
    };
    const ctl = new AbortController();
    ctl.abort();
    const sub = createSubagent({
      spawn: spawn as any,
      cwd: "/tmp",
      signal: ctl.signal,
    });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
  });

  test("retry's intent gets '(retry)' suffix in the lifecycle event", async () => {
    let calls = 0;
    const spawn = async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          aborted: false,
          stdout: "",
          stderr: "",
          exitCode: 1,
          signal: null,
          errorMessage: "transient",
        };
      }
      return {
        ok: true,
        aborted: false,
        stdout: `{"outcome":"x","n":1}`,
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const intents: string[] = [];
    const sub = createSubagent({
      spawn: spawn as any,
      cwd: "/tmp",
      onSubagentLifecycle: (e) => {
        if (e.kind === "start") intents.push(e.spec.intent);
      },
    });
    await sub.dispatch({
      intent: "Plan",
      prompt: "x",
      schema: Schema,
      tools: [],
    });
    assert.deepEqual(intents, ["Plan", "Plan (retry)"]);
  });
});
```

**Step 2: Run, see them fail.**

**Step 3: Add retry logic to `subagent.ts`.**

Wrap `dispatchOne` invocation in `dispatch` with the retry policy:

```ts
// Replace `return { dispatch: (spec) => dispatchOne(spec) };` with:
return {
  dispatch: async (spec) => {
    const policy = spec.retry ?? "one-retry-on-dispatch";
    const first = await dispatchOne(spec);
    if (policy === "none") return first;
    if (first.ok) return first;
    if (first.reason !== "dispatch") return first;
    if (opts.signal?.aborted) return first;
    return dispatchOne(
      { ...spec, intent: `${spec.intent} (retry)` },
      // parent_id wiring: we use the running id counter; the previous
      // dispatch reserved nextId-1.
      nextId,
    );
  },
};
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/subagent.ts pi/agent/extensions/workflow-core/lib/subagent.test.ts
git commit -m "feat(workflow-core): one-retry-on-dispatch policy"
```

---

## Task 17: Subagent — `parallel`

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/subagent.ts` (add `parallel`)
- Modify: `pi/agent/extensions/workflow-core/lib/subagent.test.ts` (add tests)

**Step 1: Write failing tests.**

```ts
describe("Subagent.parallel", () => {
  test("dispatches all specs concurrently and returns results in order", async () => {
    const order: string[] = [];
    const spawn = async (inv: any) => {
      order.push(`start:${inv.prompt}`);
      await new Promise((r) => setTimeout(r, inv.prompt === "fast" ? 5 : 50));
      order.push(`end:${inv.prompt}`);
      return {
        ok: true,
        aborted: false,
        stdout: `{"outcome":"x","n":1}`,
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const results = await sub.parallel([
      { intent: "a", prompt: "slow", schema: Schema, tools: [] },
      { intent: "b", prompt: "fast", schema: Schema, tools: [] },
    ]);
    assert.equal(results.length, 2);
    // both started before either ended
    assert.equal(order[0].startsWith("start:"), true);
    assert.equal(order[1].startsWith("start:"), true);
    // fast finished first
    assert.equal(order[2], "end:fast");
  });

  test("concurrency=1 serializes dispatches", async () => {
    const order: string[] = [];
    const spawn = async (inv: any) => {
      order.push(`s:${inv.prompt}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`e:${inv.prompt}`);
      return {
        ok: true,
        aborted: false,
        stdout: `{"outcome":"x","n":1}`,
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    await sub.parallel(
      [
        { intent: "a", prompt: "1", schema: Schema, tools: [] },
        { intent: "b", prompt: "2", schema: Schema, tools: [] },
      ],
      { concurrency: 1 },
    );
    // each dispatch fully completes before the next starts
    assert.deepEqual(order, ["s:1", "e:1", "s:2", "e:2"]);
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Add `parallel` to the Subagent interface and implementation.**

```ts
// Add to interface Subagent:
//   parallel<S extends TSchema>(
//     specs: DispatchSpec<S>[],
//     opts?: { concurrency?: number },
//   ): Promise<DispatchResult<S>[]>;

// Add to the returned object:
async function parallel<S extends TSchema>(
  specs: DispatchSpec<S>[],
  parOpts?: { concurrency?: number },
): Promise<DispatchResult<S>[]> {
  const concurrency = parOpts?.concurrency ?? specs.length;
  const results = new Array<DispatchResult<S>>(specs.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= specs.length) return;
      results[i] = await self.dispatch(specs[i]);
    }
  }
  const self: Subagent = { dispatch: /* same as before */, parallel };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, specs.length) }, () => worker()),
  );
  return results;
}
```

The above sketch needs a small refactor since `self` references the same closure: extract `dispatchWithRetry` as a named helper so `parallel` can call it directly. Final shape:

```ts
export function createSubagent(opts: CreateSubagentOpts): Subagent {
  // ... nextId, dispatchOne as before ...

  const dispatchWithRetry = async <S extends TSchema>(
    spec: DispatchSpec<S>,
  ): Promise<DispatchResult<S>> => {
    const policy = spec.retry ?? "one-retry-on-dispatch";
    const first = await dispatchOne(spec);
    if (policy === "none" || first.ok || first.reason !== "dispatch")
      return first;
    if (opts.signal?.aborted) return first;
    return dispatchOne({ ...spec, intent: `${spec.intent} (retry)` }, nextId);
  };

  const parallel = async <S extends TSchema>(
    specs: DispatchSpec<S>[],
    parOpts?: { concurrency?: number },
  ): Promise<DispatchResult<S>[]> => {
    const concurrency = parOpts?.concurrency ?? specs.length;
    const results = new Array<DispatchResult<S>>(specs.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= specs.length) return;
        results[i] = await dispatchWithRetry(specs[i]);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.max(1, Math.min(concurrency, specs.length)) },
        () => worker(),
      ),
    );
    return results;
  };

  return { dispatch: dispatchWithRetry, parallel };
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/subagent.ts pi/agent/extensions/workflow-core/lib/subagent.test.ts
git commit -m "feat(workflow-core): add Subagent.parallel"
```

---

## Task 18: Subagent — wall-clock timeout

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/subagent.ts` (timeout)
- Modify: `pi/agent/extensions/workflow-core/lib/subagent.test.ts` (test)

**Step 1: Write failing test.**

```ts
describe("Subagent.dispatch — timeout", () => {
  test("aborts when wall-clock exceeds timeoutMs (returns reason: 'timeout')", async () => {
    const spawn = async (inv: any): Promise<any> => {
      // hang until the signal aborts
      await new Promise<void>((resolve, reject) => {
        inv.signal?.addEventListener("abort", () => {
          resolve();
        });
      });
      return {
        ok: false,
        aborted: true,
        stdout: "",
        stderr: "",
        exitCode: null,
        signal: "SIGTERM",
        errorMessage: "aborted",
      };
    };
    const sub = createSubagent({ spawn: spawn as any, cwd: "/tmp" });
    const r = await sub.dispatch({
      intent: "x",
      prompt: "y",
      schema: Schema,
      tools: [],
      timeoutMs: 20,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "timeout");
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement timeout wrapping in `dispatchOne`.**

Wrap the spawn call with a `setTimeout` that calls `controller.abort()` and tracks the timeout flag, so the result's `reason` becomes `"timeout"` rather than `"aborted"`.

```ts
// Inside dispatchOne, before the spawn call:
const childCtl = new AbortController();
const linkAbort = () => childCtl.abort();
opts.signal?.addEventListener("abort", linkAbort);
let timedOut = false;
const timer = spec.timeoutMs
  ? setTimeout(() => {
      timedOut = true;
      childCtl.abort();
    }, spec.timeoutMs)
  : null;

try {
  const outcome = await spawn({
    /* ... */
    signal: childCtl.signal,
    onEvent: (e) => opts.onSubagentEvent?.(id, e),
  });
  // ...
  if (!outcome.ok) {
    const reason = timedOut
      ? "timeout"
      : outcome.aborted
        ? "aborted"
        : "dispatch";
    result = {
      ok: false,
      reason,
      error: outcome.errorMessage ?? `exit ${outcome.exitCode}`,
      raw: outcome.stdout,
    };
  } else {
    /* ... parse path ... */
  }
} finally {
  if (timer) clearTimeout(timer);
  opts.signal?.removeEventListener("abort", linkAbort);
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/subagent.ts pi/agent/extensions/workflow-core/lib/subagent.test.ts
git commit -m "feat(workflow-core): wall-clock timeout on dispatch"
```

---

## Task 19: Widget — title/body/footer setters (static + function form)

**Files:**

- Create: `pi/agent/extensions/workflow-core/lib/widget.ts`
- Create: `pi/agent/extensions/workflow-core/lib/widget.test.ts`

Per design §3. Function-form re-evaluated on tick. Captured ui via `setWidget(key, lines | undefined)`.

**Step 1: Write failing tests.**

```ts
import { describe, test, mock } from "node:test";
import { strict as assert } from "node:assert";
import { createWidget } from "./widget.ts";

function fakeUi() {
  const calls: Array<{ key: string; lines?: string[] }> = [];
  return {
    calls,
    setWidget(key: string, lines: string[] | undefined) {
      calls.push({ key, lines });
    },
  };
}

describe("Widget — setters", () => {
  test("setTitle/Body/Footer with strings renders synchronously", () => {
    const ui = fakeUi();
    const w = createWidget({ key: "test", ui, now: () => 0 });
    w.setTitle("hi");
    w.setBody(["a", "b"]);
    w.setFooter("/cancel");
    const last = ui.calls[ui.calls.length - 1].lines!;
    assert.deepEqual(last, ["hi", "a", "b", "/cancel"]);
    w.dispose();
  });

  test("function-form is re-evaluated on tick", async () => {
    const ui = fakeUi();
    let counter = 0;
    const w = createWidget({ key: "test", ui, now: () => 0, tickMs: 5 });
    w.setBody(() => [`n=${counter}`]);
    counter = 1;
    await new Promise((r) => setTimeout(r, 12));
    const lines = ui.calls.flatMap((c) => c.lines ?? []);
    assert.ok(lines.some((l) => l === "n=1"));
    w.dispose();
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement minimal widget.**

```ts
import type { SubagentSlot, ToolEvent } from "./types.ts";

export interface WidgetUi {
  setWidget(key: string, lines: string[] | undefined): void;
}

export interface WidgetTheme {
  fg(kind: string, s: string): string;
  bold(s: string): string;
}

export interface Widget {
  setTitle(content: string | (() => string)): void;
  setBody(content: string[] | (() => string[])): void;
  setFooter(content: string | (() => string)): void;
  readonly subagents: ReadonlyArray<SubagentSlot>;
  elapsedMs(): number;
  readonly theme?: WidgetTheme;
  dispose(): void;

  // Internal seam for the framework: drive subagent slots from lifecycle events
  _emitSubagentLifecycle(
    ev:
      | { kind: "start"; id: number; intent: string }
      | { kind: "event"; id: number; event: ToolEvent }
      | { kind: "end"; id: number },
  ): void;
}

export interface CreateWidgetOpts {
  key: string;
  ui: WidgetUi;
  theme?: WidgetTheme;
  now?: () => number;
  tickMs?: number;
  maxRecentEventsPerSlot?: number;
}

export function createWidget(opts: CreateWidgetOpts): Widget {
  const now = opts.now ?? Date.now;
  const tickMs = opts.tickMs ?? 1000;
  const maxK = opts.maxRecentEventsPerSlot ?? 3;
  const startedAt = now();
  let title: string | (() => string) = "";
  let body: string[] | (() => string[]) = [];
  let footer: string | (() => string) = "";
  const slots = new Map<number, { slot: SubagentSlot; events: ToolEvent[] }>();
  const tick = setInterval(() => render(), tickMs);

  function visibleSubagents(): SubagentSlot[] {
    return [...slots.values()].map((s) => s.slot);
  }

  function evalContent<T>(c: T | (() => T)): T {
    return typeof c === "function" ? (c as () => T)() : c;
  }

  function render(): void {
    const t = evalContent<string>(title as any);
    const b = evalContent<string[]>(body as any);
    const f = evalContent<string>(footer as any);
    const lines: string[] = [];
    if (t) lines.push(t);
    lines.push(...b);
    if (f) lines.push(f);
    opts.ui.setWidget(opts.key, lines);
  }

  return {
    setTitle(c) {
      title = c;
      render();
    },
    setBody(c) {
      body = c;
      render();
    },
    setFooter(c) {
      footer = c;
      render();
    },
    get subagents() {
      return visibleSubagents();
    },
    elapsedMs() {
      return now() - startedAt;
    },
    theme: opts.theme,
    dispose() {
      clearInterval(tick);
      opts.ui.setWidget(opts.key, undefined);
    },
    _emitSubagentLifecycle(ev) {
      if (ev.kind === "start") {
        slots.set(ev.id, {
          slot: {
            id: ev.id,
            intent: ev.intent,
            startedAt: now(),
            recentEvents: [],
            status: "running",
          },
          events: [],
        });
      } else if (ev.kind === "event") {
        const entry = slots.get(ev.id);
        if (!entry) return;
        entry.events.push(ev.event);
        if (entry.events.length > maxK)
          entry.events.splice(0, entry.events.length - maxK);
        entry.slot = { ...entry.slot, recentEvents: [...entry.events] };
      } else {
        const entry = slots.get(ev.id);
        if (!entry) return;
        entry.slot = { ...entry.slot, status: "finished" };
      }
      render();
    },
  };
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/widget.ts pi/agent/extensions/workflow-core/lib/widget.test.ts
git commit -m "feat(workflow-core): add Widget setters with function-form re-evaluation"
```

---

## Task 20: Widget — subagent slot lifecycle and dispose semantics

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/widget.test.ts` (add tests)

The subagent slot logic was already implemented in Task 19's `_emitSubagentLifecycle`. This task locks the behavior with tests.

**Step 1: Add failing tests.**

```ts
describe("Widget — subagent slot lifecycle", () => {
  test("start adds a running slot with intent and startedAt", () => {
    const ui = fakeUi();
    let nowVal = 1000;
    const w = createWidget({ key: "test", ui, now: () => nowVal });
    w._emitSubagentLifecycle({ kind: "start", id: 1, intent: "Plan" });
    const s = w.subagents[0];
    assert.equal(s.id, 1);
    assert.equal(s.intent, "Plan");
    assert.equal(s.status, "running");
    assert.equal(s.startedAt, 1000);
    w.dispose();
  });

  test("event appends to recentEvents (trims to max K)", () => {
    const ui = fakeUi();
    const w = createWidget({
      key: "test",
      ui,
      now: () => 0,
      maxRecentEventsPerSlot: 2,
    });
    w._emitSubagentLifecycle({ kind: "start", id: 1, intent: "x" });
    w._emitSubagentLifecycle({ kind: "event", id: 1, event: "a" });
    w._emitSubagentLifecycle({ kind: "event", id: 1, event: "b" });
    w._emitSubagentLifecycle({ kind: "event", id: 1, event: "c" });
    assert.deepEqual(w.subagents[0].recentEvents, ["b", "c"]);
    w.dispose();
  });

  test("end transitions slot to finished", () => {
    const ui = fakeUi();
    const w = createWidget({ key: "test", ui, now: () => 0 });
    w._emitSubagentLifecycle({ kind: "start", id: 1, intent: "x" });
    w._emitSubagentLifecycle({ kind: "end", id: 1 });
    assert.equal(w.subagents[0].status, "finished");
    w.dispose();
  });
});

describe("Widget — dispose", () => {
  test("dispose stops the tick and clears the widget", () => {
    const ui = fakeUi();
    const w = createWidget({ key: "test", ui, now: () => 0, tickMs: 10 });
    w.setTitle("hi");
    const before = ui.calls.length;
    w.dispose();
    const after = ui.calls.length;
    // dispose triggers a final setWidget(undefined)
    assert.ok(after > before);
    assert.equal(ui.calls[ui.calls.length - 1].lines, undefined);
  });
});
```

**Step 2: Run, see them pass (or fix any rough edges in widget.ts).**

**Step 3: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/widget.test.ts pi/agent/extensions/workflow-core/lib/widget.ts
git commit -m "test(workflow-core): cover Widget subagent slot lifecycle and dispose"
```

---

## Task 21: Log — events.jsonl writer

**Files:**

- Create: `pi/agent/extensions/workflow-core/lib/log.ts`
- Create: `pi/agent/extensions/workflow-core/lib/log.test.ts`

The RunLogger owns: events.jsonl writes, sidecar prompt/output files, run.json + final-report.txt at end. Per design §10.

**Step 1: Write failing tests for the writer.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunLogger } from "./log.ts";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wc-log-"));
}

describe("createRunLogger — events.jsonl", () => {
  test("writes one valid JSON line per logEvent call, ending in newline", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: "s",
      args: {},
      preflight: {},
      now: () => new Date("2026-01-01T00:00:00Z").getTime(),
    });
    logger.logEvent({ type: "test.a", payload: { x: 1 } });
    logger.logEvent({ type: "test.b", payload: { y: 2 } });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content.trim().split("\n");
    assert.ok(lines.length >= 4); // run.start + 2 + run.end
    for (const l of lines) {
      const obj = JSON.parse(l);
      assert.ok(obj.ts);
      assert.ok(obj.type);
    }
    rmSync(root, { recursive: true });
  });

  test("auto-emits run.start at construction and run.end on close", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: { foo: 1 },
      preflight: {},
    });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.equal(lines[0].type, "run.start");
    assert.deepEqual(lines[0].args, { foo: 1 });
    assert.equal(lines[lines.length - 1].type, "run.end");
    assert.equal(lines[lines.length - 1].outcome, "success");
    rmSync(root, { recursive: true });
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement minimal writer.**

```ts
// lib/log.ts
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

export interface RunLoggerInit {
  baseDir: string; // root, e.g. ~/.pi/workflow-runs
  workflow: string;
  slug: string | null;
  args: unknown;
  preflight: unknown;
  retainRuns?: number; // default 20
  now?: () => number;
}

export interface RunLogger {
  runDir: string; // <baseDir>/<workflow>/<timestamp>[-<slug>]
  workflowDir: string; // <runDir>/workflow/
  promptsDir: string;
  outputsDir: string;
  logEvent(opts: { type: string; payload?: Record<string, unknown> }): void;
  writePrompt(filename: string, content: string): void;
  writeOutput(filename: string, content: string): void;
  writeFinalReport(text: string): void;
  close(opts: {
    outcome: "success" | "cancelled" | "crashed";
    error: string | null;
    subagentCount?: number;
    subagentRetries?: number;
  }): Promise<void>;
}

function isoTs(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
}

function sanitizeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createRunLogger(init: RunLoggerInit): Promise<RunLogger> {
  const now = init.now ?? Date.now;
  const startedAtMs = now();
  const ts = isoTs(startedAtMs);
  const slugPart = init.slug ? `-${sanitizeSlug(init.slug)}` : "";
  const baseDir = join(init.baseDir, init.workflow);
  const runDir = join(baseDir, `${ts}${slugPart}`);
  mkdirSync(runDir, { recursive: true });
  const workflowDir = join(runDir, "workflow");
  const promptsDir = join(runDir, "prompts");
  const outputsDir = join(runDir, "outputs");
  for (const d of [workflowDir, promptsDir, outputsDir])
    mkdirSync(d, { recursive: true });

  const eventsPath = join(runDir, "events.jsonl");
  let sealed = false;

  function tsString(): string {
    return new Date(now()).toISOString();
  }

  function writeLine(obj: unknown): void {
    if (sealed) return;
    appendFileSync(eventsPath, JSON.stringify(obj) + "\n");
  }

  // Apply retention BEFORE creating runDir is the correct order; here we
  // already created it, so prune leaving the new run alone:
  applyRetention(baseDir, init.retainRuns ?? 20, runDir);

  // run.start
  writeLine({
    ts: tsString(),
    type: "run.start",
    workflow: init.workflow,
    cwd: process.cwd(),
    args: init.args,
    preflight: init.preflight,
  });

  function logEvent(o: {
    type: string;
    payload?: Record<string, unknown>;
  }): void {
    writeLine({ ts: tsString(), type: o.type, ...(o.payload ?? {}) });
  }

  function writePrompt(filename: string, content: string): void {
    writeFileSync(join(promptsDir, filename), content);
  }

  function writeOutput(filename: string, content: string): void {
    writeFileSync(join(outputsDir, filename), content);
  }

  function writeFinalReport(text: string): void {
    writeFileSync(join(runDir, "final-report.txt"), text);
  }

  async function close(o: {
    outcome: "success" | "cancelled" | "crashed";
    error: string | null;
    subagentCount?: number;
    subagentRetries?: number;
  }): Promise<void> {
    if (sealed) return;
    const endedAtMs = now();
    writeLine({
      ts: tsString(),
      type: "run.end",
      outcome: o.outcome,
      elapsed_ms: endedAtMs - startedAtMs,
      error: o.error,
    });
    sealed = true;
    writeFileSync(
      join(runDir, "run.json"),
      JSON.stringify(
        {
          workflow: init.workflow,
          slug: init.slug,
          started_at: new Date(startedAtMs).toISOString(),
          ended_at: new Date(endedAtMs).toISOString(),
          elapsed_ms: endedAtMs - startedAtMs,
          outcome: o.outcome,
          args: init.args,
          subagent_count: o.subagentCount ?? 0,
          subagent_retries: o.subagentRetries ?? 0,
          log_path: "events.jsonl",
          report_path: "final-report.txt",
          error: o.error,
        },
        null,
        2,
      ),
    );
  }

  return {
    runDir,
    workflowDir,
    promptsDir,
    outputsDir,
    logEvent,
    writePrompt,
    writeOutput,
    writeFinalReport,
    close,
  };
}

function applyRetention(
  baseDir: string,
  keep: number,
  currentRun: string,
): void {
  let entries: { name: string; full: string; mtimeMs: number }[];
  try {
    entries = readdirSync(baseDir)
      .map((n) => {
        const full = join(baseDir, n);
        try {
          return { name: n, full, mtimeMs: statSync(full).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(
        (e): e is { name: string; full: string; mtimeMs: number } => e !== null,
      );
  } catch {
    return;
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
  for (let i = keep; i < entries.length; i++) {
    if (entries[i].full === currentRun) continue;
    try {
      rmSync(entries[i].full, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/log.ts pi/agent/extensions/workflow-core/lib/log.test.ts
git commit -m "feat(workflow-core): add events.jsonl writer + run.json + retention"
```

---

## Task 22: Log — workflow event auto-prefix + post-close drop

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/log.ts` (add `logWorkflow` method)
- Modify: `pi/agent/extensions/workflow-core/lib/log.test.ts` (add tests)

Per design §10: `ctx.log("foo", payload)` is auto-prefixed to `<workflow>.foo`. Also: calls after `close()` are silently dropped.

**Step 1: Write failing tests.**

```ts
describe("createRunLogger — workflow events", () => {
  test("logWorkflow auto-prefixes type with workflow name", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "autopilot",
      slug: null,
      args: {},
      preflight: {},
    });
    logger.logWorkflow("task.complete", { id: 3 });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const evt = lines.find((l: any) => l.type === "autopilot.task.complete");
    assert.ok(evt, "expected prefixed event in log");
    assert.equal((evt as any).id, 3);
    rmSync(root, { recursive: true });
  });

  test("logEvent / logWorkflow after close are silently dropped", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    await logger.close({ outcome: "success", error: null });
    logger.logWorkflow("late", {});
    logger.logEvent({ type: "later" });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.ok(!lines.some((l: any) => l.type === "wf.late"));
    assert.ok(!lines.some((l: any) => l.type === "later"));
    rmSync(root, { recursive: true });
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Add `logWorkflow` to RunLogger.**

```ts
// In RunLogger interface:
logWorkflow(type: string, payload?: Record<string, unknown>): void;

// In createRunLogger return:
logWorkflow(type, payload) {
  if (sealed) return;
  writeLine({ ts: tsString(), type: `${init.workflow}.${type}`, ...(payload ?? {}) });
},
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/log.ts pi/agent/extensions/workflow-core/lib/log.test.ts
git commit -m "feat(workflow-core): auto-prefix workflow events; drop post-close calls"
```

---

## Task 23: Log — subagent lifecycle + sidecars

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/log.ts` (add `recordSubagentStart` / `recordSubagentEnd`)
- Modify: `pi/agent/extensions/workflow-core/lib/log.test.ts` (add tests)

The framework calls these from inside its Subagent wrapper. Lifecycle: write the prompt sidecar, emit `subagent.start` referencing it; on end, write the output sidecar (if ok), emit `subagent.end` referencing it.

**Step 1: Write failing tests.**

```ts
describe("createRunLogger — subagent lifecycle", () => {
  test("recordSubagentStart writes prompt sidecar and emits start event with prompt_path", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    logger.recordSubagentStart({
      id: 1,
      intent: "Plan",
      schema: "PlanReport",
      tools: ["read"],
      extensions: [],
      prompt: "do the plan",
    });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const start = lines.find((l: any) => l.type === "subagent.start");
    assert.ok(start);
    assert.equal((start as any).id, 1);
    assert.match((start as any).prompt_path, /^prompts\/0*1-plan\.txt$/);
    const promptText = readFileSync(
      join(logger.promptsDir, "001-plan.txt"),
      "utf8",
    );
    assert.equal(promptText, "do the plan");
    rmSync(root, { recursive: true });
  });

  test("recordSubagentEnd writes output sidecar on success and emits end event", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    logger.recordSubagentStart({
      id: 1,
      intent: "Plan",
      schema: "PlanReport",
      tools: [],
      extensions: [],
      prompt: "x",
    });
    logger.recordSubagentEnd({
      id: 1,
      ok: true,
      durationMs: 1234,
      output: { hello: "world" },
    });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const end = lines.find((l: any) => l.type === "subagent.end");
    assert.equal((end as any).ok, true);
    assert.equal((end as any).duration_ms, 1234);
    assert.match((end as any).output_path, /^outputs\/0*1-plan\.json$/);
    const outputJson = readFileSync(
      join(logger.outputsDir, "001-plan.json"),
      "utf8",
    );
    assert.deepEqual(JSON.parse(outputJson), { hello: "world" });
    rmSync(root, { recursive: true });
  });

  test("recordSubagentEnd on failure emits reason+error and no output sidecar", async () => {
    const root = makeRoot();
    const logger = await createRunLogger({
      baseDir: root,
      workflow: "wf",
      slug: null,
      args: {},
      preflight: {},
    });
    logger.recordSubagentStart({
      id: 1,
      intent: "x",
      schema: "X",
      tools: [],
      extensions: [],
      prompt: "p",
    });
    logger.recordSubagentEnd({
      id: 1,
      ok: false,
      durationMs: 500,
      reason: "parse",
      error: "bad json",
    });
    await logger.close({ outcome: "success", error: null });
    const content = readFileSync(join(logger.runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const end = lines.find((l: any) => l.type === "subagent.end");
    assert.equal((end as any).ok, false);
    assert.equal((end as any).reason, "parse");
    assert.equal((end as any).error, "bad json");
    assert.equal((end as any).output_path, undefined);
    rmSync(root, { recursive: true });
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Add the recording methods.**

```ts
// In RunLogger interface:
recordSubagentStart(o: {
  id: number;
  intent: string;
  schema: string;
  tools: ReadonlyArray<string>;
  extensions: ReadonlyArray<string>;
  prompt: string;
  parentId?: number;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  retry?: string;
}): void;

recordSubagentEnd(o: {
  id: number;
  ok: boolean;
  durationMs: number;
  output?: unknown;
  reason?: "dispatch" | "parse" | "schema" | "timeout" | "aborted";
  error?: string;
}): void;

// Helpers:
function sidecarBase(id: number, intent: string): string {
  const intentSlug = intent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${id.toString().padStart(3, "0")}-${intentSlug || "subagent"}`;
}

// In createRunLogger return:
recordSubagentStart(o) {
  if (sealed) return;
  const base = sidecarBase(o.id, o.intent);
  const promptFile = `${base}.txt`;
  writeFileSync(join(promptsDir, promptFile), o.prompt);
  writeLine({
    ts: tsString(), type: "subagent.start",
    id: o.id, intent: o.intent, schema: o.schema,
    tools: o.tools, extensions: o.extensions, model: o.model,
    thinking: o.thinking, timeout_ms: o.timeoutMs, retry: o.retry,
    parent_id: o.parentId,
    prompt_path: `prompts/${promptFile}`,
  });
},
recordSubagentEnd(o) {
  if (sealed) return;
  const base = sidecarBase(o.id, /* we need original intent — store or look up */ "subagent");
  // Better: track intent-by-id internally.
  // (Pseudocode — see below for the proper implementation.)
},
```

Refactor: track `intentById` so the end recording knows which sidecar base to use.

```ts
const intentById = new Map<number, string>();

recordSubagentStart(o) {
  if (sealed) return;
  intentById.set(o.id, o.intent);
  const base = sidecarBase(o.id, o.intent);
  const promptFile = `${base}.txt`;
  writeFileSync(join(promptsDir, promptFile), o.prompt);
  writeLine({
    ts: tsString(), type: "subagent.start",
    id: o.id, intent: o.intent, schema: o.schema,
    tools: o.tools, extensions: o.extensions, model: o.model,
    thinking: o.thinking, timeout_ms: o.timeoutMs, retry: o.retry,
    parent_id: o.parentId,
    prompt_path: `prompts/${promptFile}`,
  });
},
recordSubagentEnd(o) {
  if (sealed) return;
  const intent = intentById.get(o.id) ?? "subagent";
  const base = sidecarBase(o.id, intent);
  let outputPath: string | undefined;
  if (o.ok && o.output !== undefined) {
    const outFile = `${base}.json`;
    writeFileSync(join(outputsDir, outFile), JSON.stringify(o.output, null, 2));
    outputPath = `outputs/${outFile}`;
  }
  writeLine({
    ts: tsString(), type: "subagent.end",
    id: o.id, ok: o.ok, duration_ms: o.durationMs,
    reason: o.reason, error: o.error, output_path: outputPath,
  });
},
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/log.ts pi/agent/extensions/workflow-core/lib/log.test.ts
git commit -m "feat(workflow-core): record subagent lifecycle + write prompt/output sidecars"
```

---

## Task 24: Run — registerWorkflow scaffolding (commands, lock, detach)

**Files:**

- Create: `pi/agent/extensions/workflow-core/lib/run.ts`
- Create: `pi/agent/extensions/workflow-core/lib/run.test.ts`

Per design §2. Tests use a fake `ExtensionAPI` that records `registerCommand` calls and lets us drive command handlers manually.

**Step 1: Write failing tests.**

```ts
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

interface CommandSpec {
  description: string;
  handler: (args: string, ctx: any) => Promise<void> | void;
}
function fakePi() {
  const commands = new Map<string, CommandSpec>();
  return {
    commands,
    registerCommand(name: string, spec: CommandSpec) {
      commands.set(name, spec);
    },
    sendMessage(_m: any) {},
    waitForIdle() {},
    notify(_m: string, _level: string) {},
    hasUI: false,
    ui: { theme: undefined as any },
  };
}

import { registerWorkflow } from "./run.ts";

describe("registerWorkflow — commands + lock", () => {
  test("registers /<name>-start and /<name>-cancel", () => {
    const pi = fakePi();
    registerWorkflow(pi as any, {
      name: "demo",
      description: "demo",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async () => null,
    });
    assert.ok(pi.commands.has("demo-start"));
    assert.ok(pi.commands.has("demo-cancel"));
  });

  test("second /<name>-start while one is active fails immediately", async () => {
    const pi = fakePi();
    let resolveRun!: () => void;
    registerWorkflow(pi as any, {
      name: "demo",
      description: "demo",
      parseArgs: () => ({ ok: true, args: {} }),
      run: () =>
        new Promise((r) => {
          resolveRun = () => r(null);
        }),
    });
    const start = pi.commands.get("demo-start")!;
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    let firstFinished = false;
    start.handler("", ctx).then(() => {
      firstFinished = true;
    });
    // The handler should have returned almost immediately (detach pattern).
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(firstFinished, true);

    // Now invoke a second time while the run is still pending:
    const notifications: { msg: string; level: string }[] = [];
    const ctx2: any = {
      waitForIdle: () => {},
      ui: {
        notify: (msg: string, level: string) =>
          notifications.push({ msg, level }),
        theme: undefined,
      },
    };
    await start.handler("", ctx2);
    assert.ok(notifications.some((n) => /already active/.test(n.msg)));
    resolveRun();
  });

  test("/<name>-start handler returns immediately (detach pattern)", async () => {
    const pi = fakePi();
    let runEntered = false;
    let resolveRun!: () => void;
    registerWorkflow(pi as any, {
      name: "demo",
      description: "demo",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async () => {
        runEntered = true;
        await new Promise<void>((r) => {
          resolveRun = r;
        });
        return null;
      },
    });
    const start = pi.commands.get("demo-start")!;
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    const t0 = Date.now();
    await start.handler("", ctx);
    const dt = Date.now() - t0;
    // Handler returns within ~50ms even though run is still running:
    assert.ok(dt < 50, `handler took ${dt}ms (should detach)`);
    // Give run a moment to start
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(runEntered, true);
    resolveRun();
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Implement minimal `registerWorkflow` (lock + detach + commands only).**

```ts
// lib/run.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface WorkflowDefinition<Args, Pre = unknown> {
  name: string;
  description: string;
  parseArgs(
    raw: string,
  ): { ok: true; args: Args } | { ok: false; error: string };
  preflight?(
    cwd: string,
    args: Args,
    signal: AbortSignal,
  ): Promise<{ ok: true; data: Pre } | { ok: false; error: string }>;
  run(
    ctx: any /* RunContext — completed in later tasks */,
  ): Promise<string[] | null>;
  runSlug?(args: Args, preflight: Pre): string;
  retainRuns?: number;
  emitLogPath?: boolean;
}

interface ActiveRun {
  controller: AbortController;
  startedAt: number;
}

export function registerWorkflow<Args, Pre>(
  pi: ExtensionAPI,
  def: WorkflowDefinition<Args, Pre>,
): void {
  let active: ActiveRun | null = null;

  pi.registerCommand(`${def.name}-cancel`, {
    description: `Cancel the currently running /${def.name}-start.`,
    handler: async (_args, ctx) => {
      if (!active) {
        ctx.ui.notify(`/${def.name}-cancel: no run is active`, "info");
        return;
      }
      ctx.ui.notify(`/${def.name}-cancel: cancelling`, "warning");
      active.controller.abort();
    },
  });

  pi.registerCommand(`${def.name}-start`, {
    description: def.description,
    handler: async (args, ctx) => {
      await ctx.waitForIdle?.();
      if (active) {
        ctx.ui.notify(
          `/${def.name}-start: a run is already active — use /${def.name}-cancel to stop it first`,
          "error",
        );
        return;
      }
      const parsed = def.parseArgs(args);
      if (!parsed.ok) {
        ctx.ui.notify(`/${def.name}-start: ${parsed.error}`, "error");
        return;
      }
      const controller = new AbortController();
      active = { controller, startedAt: Date.now() };
      const pipeline = async () => {
        try {
          await def.run({ args: parsed.args, signal: controller.signal });
        } finally {
          active = null;
        }
      };
      // Detach: do NOT await
      pipeline();
    },
  });
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/run.ts pi/agent/extensions/workflow-core/lib/run.test.ts
git commit -m "feat(workflow-core): registerWorkflow with commands + lock + detach"
```

---

## Task 25: Run — preflight + abort signal propagation

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/run.ts`
- Modify: `pi/agent/extensions/workflow-core/lib/run.test.ts`

**Step 1: Write failing tests.**

```ts
describe("registerWorkflow — preflight", () => {
  test("preflight failure aborts before run() is called", async () => {
    const pi = fakePi();
    let runCalled = false;
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      preflight: async () => ({ ok: false, error: "missing file" }),
      run: async () => {
        runCalled = true;
        return null;
      },
    });
    const notes: any[] = [];
    const ctx = {
      waitForIdle: () => {},
      ui: {
        notify: (m: string, l: string) => notes.push({ m, l }),
        theme: undefined,
      },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(runCalled, false);
    assert.ok(notes.some((n) => /missing file/.test(n.m)));
  });
});

describe("registerWorkflow — abort", () => {
  test("/<name>-cancel aborts the controller signal seen by run()", async () => {
    const pi = fakePi();
    let signalSeen!: AbortSignal;
    let resolveRun!: () => void;
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async (ctx: any) => {
        signalSeen = ctx.signal;
        await new Promise<void>((r) => {
          ctx.signal.addEventListener("abort", () => {
            r();
          });
          resolveRun = r;
        });
        return null;
      },
    });
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(signalSeen.aborted, false);
    await pi.commands.get("d-cancel")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(signalSeen.aborted, true);
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Add preflight handling and signal propagation.**

```ts
// In the start handler, after parseArgs:
let preflightData: any = {};
if (def.preflight) {
  const pre = await def.preflight(
    process.cwd(),
    parsed.args,
    controller.signal,
  );
  if (!pre.ok) {
    ctx.ui.notify(`/${def.name}-start: ${pre.error}`, "error");
    return;
  }
  preflightData = pre.data;
}

const pipeline = async () => {
  try {
    await def.run({
      args: parsed.args,
      signal: controller.signal,
      preflight: preflightData,
      cwd: process.cwd(),
      ui: pi,
      startedAt: active!.startedAt,
    });
  } finally {
    active = null;
  }
};
```

(Note: `controller` allocation needs to move to before preflight so that preflight can also accept the signal.)

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/run.ts pi/agent/extensions/workflow-core/lib/run.test.ts
git commit -m "feat(workflow-core): preflight + abort signal propagation"
```

---

## Task 26: Run — wire Subagent + Widget into RunContext

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/run.ts`
- Modify: `pi/agent/extensions/workflow-core/lib/run.test.ts`

**Step 1: Write failing tests.**

```ts
describe("registerWorkflow — RunContext wiring", () => {
  test("ctx.subagent.dispatch routes events into ctx.widget.subagents", async () => {
    const pi = fakePi();
    let observedSlots: any[] = [];
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async (ctx: any) => {
        // Inject a fake spawn via the test seam; simpler: just check slot allocation
        const startId = ctx._startSubagent?.("Plan");
        observedSlots = [...ctx.widget.subagents];
        ctx._endSubagent?.(startId);
        return null;
      },
    });
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    // Test seam — we expect a running slot was visible during run()
    assert.ok(observedSlots.length >= 1);
  });
});
```

(Note: This test approach uses internal seams. An alternative is to construct the workflow with a fake spawn and exercise `ctx.subagent.dispatch` end-to-end — that's the more honest approach. Use the `subagentSpawn?` injection on `registerWorkflow` for testability.)

**Better test (revise the above):**

```ts
test("dispatch through ctx.subagent allocates and frees a widget slot", async () => {
  const pi = fakePi();
  const seenSlots: any[][] = [];
  const fakeSpawn = async () => ({
    ok: true,
    aborted: false,
    stdout: `{}`,
    stderr: "",
    exitCode: 0,
    signal: null,
  });
  const { Type } = await import("@sinclair/typebox");
  const Schema = Type.Object({});
  registerWorkflow(
    pi as any,
    {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async (ctx: any) => {
        const dispatchPromise = ctx.subagent.dispatch({
          intent: "Plan",
          prompt: "x",
          schema: Schema,
          tools: [],
        });
        // Capture mid-flight slot state
        await new Promise((r) => setTimeout(r, 5));
        seenSlots.push([...ctx.widget.subagents]);
        await dispatchPromise;
        seenSlots.push([...ctx.widget.subagents]);
        return null;
      },
    },
    { spawn: fakeSpawn },
  );
  const ctx: any = {
    waitForIdle: () => {},
    ui: { notify: () => {}, theme: undefined },
  };
  await pi.commands.get("d-start")!.handler("", ctx);
  await new Promise((r) => setTimeout(r, 50));
  // First snapshot: at least one running slot
  assert.ok(seenSlots[0].length >= 1);
  // Second snapshot: the slot is finished
  assert.equal(
    seenSlots[1].every((s) => s.status === "finished"),
    true,
  );
});
```

This requires `registerWorkflow` to accept a second arg with test seams (e.g. `spawn`).

**Step 2: Run, see fail.**

**Step 3: Implement.**

Extend `registerWorkflow` to accept optional `RegisterOpts` (spawn injection, ui injection for widget). Build the Subagent + Widget inside the pipeline. Wire `onSubagentLifecycle` from Subagent into `_emitSubagentLifecycle` on the Widget.

```ts
import { createWidget } from "./widget.ts";
import { createSubagent } from "./subagent.ts";

export interface RegisterWorkflowOpts {
  spawn?: any; // typeof spawnSubagent
  widgetUi?: { setWidget: (key: string, lines?: string[]) => void };
}

export function registerWorkflow<Args, Pre>(
  pi: ExtensionAPI,
  def: WorkflowDefinition<Args, Pre>,
  testOpts: RegisterWorkflowOpts = {},
): void {
  // ... lock as before ...
  // In the pipeline:
  const widgetUi =
    (testOpts.widgetUi ?? (pi as any).hasUI)
      ? { setWidget: (pi as any).setWidget?.bind(pi) ?? (() => {}) }
      : { setWidget: () => {} };
  const widget = createWidget({
    key: def.name,
    ui: widgetUi as any,
    theme: (pi as any).hasUI ? (pi as any).ui?.theme : undefined,
  });
  const subagent = createSubagent({
    cwd: process.cwd(),
    spawn: testOpts.spawn,
    signal: controller.signal,
    onSubagentEvent: (id, ev) =>
      widget._emitSubagentLifecycle({ kind: "event", id, event: ev }),
    onSubagentLifecycle: (e) => {
      if (e.kind === "start")
        widget._emitSubagentLifecycle({
          kind: "start",
          id: e.id,
          intent: e.spec.intent,
        });
      else widget._emitSubagentLifecycle({ kind: "end", id: e.id });
    },
  });
  try {
    await def.run({
      args: parsed.args,
      signal: controller.signal,
      preflight: preflightData,
      cwd: process.cwd(),
      ui: pi,
      startedAt: active!.startedAt,
      subagent,
      widget,
    });
  } finally {
    widget.dispose();
    active = null;
  }
}
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/run.ts pi/agent/extensions/workflow-core/lib/run.test.ts
git commit -m "feat(workflow-core): wire Subagent + Widget into RunContext"
```

---

## Task 27: Run — report emission with framework-appended `Log:` line

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/run.ts`
- Modify: `pi/agent/extensions/workflow-core/lib/run.test.ts`

**Step 1: Write failing tests.**

```ts
describe("registerWorkflow — report emission", () => {
  test("string[] return is sent via pi.sendMessage with customType=<name>-report", async () => {
    const pi = fakePi();
    const messages: any[] = [];
    pi.sendMessage = (m: any) => {
      messages.push(m);
    };
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async () => ["line one", "line two"],
    });
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].customType, "d-report");
    const text: string = messages[0].content[0].text;
    assert.match(text, /^line one\nline two/);
  });

  test("framework appends 'Log: <path>' line when emitLogPath defaults true", async () => {
    const pi = fakePi();
    const messages: any[] = [];
    pi.sendMessage = (m: any) => {
      messages.push(m);
    };
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async () => ["body"],
    });
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    const text: string = messages[0].content[0].text;
    assert.match(text, /\nLog:\s+.*\/d\//);
  });

  test("emitLogPath:false suppresses the Log line", async () => {
    const pi = fakePi();
    const messages: any[] = [];
    pi.sendMessage = (m: any) => {
      messages.push(m);
    };
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async () => ["body"],
      emitLogPath: false,
    });
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    const text: string = messages[0].content[0].text;
    assert.doesNotMatch(text, /\nLog:/);
  });

  test("null return suppresses both the report and the log line", async () => {
    const pi = fakePi();
    const messages: any[] = [];
    pi.sendMessage = (m: any) => {
      messages.push(m);
    };
    registerWorkflow(pi as any, {
      name: "d",
      description: "",
      parseArgs: () => ({ ok: true, args: {} }),
      run: async () => null,
    });
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("d-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(messages.length, 0);
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Wire `createRunLogger` into the pipeline + report emission.**

Inside the pipeline:

```ts
import { createRunLogger } from "./log.ts";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

const logBaseDir =
  testOpts.logBaseDir ?? join(homedir(), ".pi", "workflow-runs");
const slug = def.runSlug?.(parsed.args, preflightData) ?? null;
const logger = await createRunLogger({
  baseDir: logBaseDir,
  workflow: def.name,
  slug,
  args: parsed.args,
  preflight: preflightData,
  retainRuns: def.retainRuns,
});

// Pass logger.workflowDir + logger.logWorkflow into ctx.
// Wire subagent.onSubagentLifecycle to also call logger.recordSubagentStart/End.

const ctx = {
  args: parsed.args,
  signal: controller.signal,
  preflight: preflightData,
  cwd: process.cwd(),
  ui: pi,
  startedAt: active!.startedAt,
  subagent,
  widget,
  log: (type: string, payload?: Record<string, unknown>) =>
    logger.logWorkflow(type, payload),
  workflowDir: logger.workflowDir,
};

let outcome: "success" | "cancelled" | "crashed" = "success";
let error: string | null = null;
let lines: string[] | null = null;
try {
  lines = await def.run(ctx);
  if (controller.signal.aborted) outcome = "cancelled";
} catch (e) {
  outcome = "crashed";
  error = (e as Error).message;
  lines = [`/${def.name}: run crashed: ${error}`];
}

if (lines !== null) {
  let text = lines.join("\n");
  if (def.emitLogPath !== false) {
    text = `${text}\nLog:     ${logger.runDir}`;
  }
  pi.sendMessage({
    customType: `${def.name}-report`,
    content: [{ type: "text", text }],
    display: true,
    details: {},
  });
  logger.writeFinalReport(text);
}

await logger.close({ outcome, error });
widget.dispose();
active = null;
```

(Make `RegisterWorkflowOpts.logBaseDir` accept a tmp path so tests don't write to `~/.pi/`.)

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/run.ts pi/agent/extensions/workflow-core/lib/run.test.ts
git commit -m "feat(workflow-core): emit report + append Log line + write final-report.txt"
```

---

## Task 28: Run — wire subagent lifecycle into the logger (start/end + retry parent_id)

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/run.ts`
- Modify: `pi/agent/extensions/workflow-core/lib/run.test.ts`

**Step 1: Write failing tests.**

```ts
describe("registerWorkflow — subagent log integration", () => {
  test("subagent dispatch produces a subagent.start + subagent.end pair in events.jsonl", async () => {
    const pi = fakePi();
    pi.sendMessage = () => {};
    const tmpRoot = mkdtempSync(join(tmpdir(), "wc-rw-"));
    const fakeSpawn = async () => ({
      ok: true,
      aborted: false,
      stdout: `{}`,
      stderr: "",
      exitCode: 0,
      signal: null,
    });
    const { Type } = await import("@sinclair/typebox");
    let runDir = "";
    registerWorkflow(
      pi as any,
      {
        name: "wf",
        description: "",
        parseArgs: () => ({ ok: true, args: {} }),
        run: async (ctx: any) => {
          runDir = ctx.workflowDir.replace(/\/workflow$/, "");
          await ctx.subagent.dispatch({
            intent: "Plan",
            prompt: "p",
            schema: Type.Object({}),
            tools: [],
          });
          return null;
        },
      },
      { spawn: fakeSpawn, logBaseDir: tmpRoot },
    );
    const ctx: any = {
      waitForIdle: () => {},
      ui: { notify: () => {}, theme: undefined },
    };
    await pi.commands.get("wf-start")!.handler("", ctx);
    await new Promise((r) => setTimeout(r, 50));
    const content = readFileSync(join(runDir, "events.jsonl"), "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.ok(lines.find((l: any) => l.type === "subagent.start"));
    assert.ok(lines.find((l: any) => l.type === "subagent.end"));
    rmSync(tmpRoot, { recursive: true });
  });
});
```

**Step 2: Run, see fail.**

**Step 3: Wire the subagent lifecycle callback to call into the logger.**

Update the `onSubagentLifecycle` and `onSubagentEvent` handlers in the pipeline to also call `logger.recordSubagentStart` / `recordSubagentEnd`. Build the Subagent's `onSubagentLifecycle` as a fan-out: widget + logger.

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/run.ts pi/agent/extensions/workflow-core/lib/run.test.ts
git commit -m "feat(workflow-core): record subagent lifecycle into events.jsonl"
```

---

## Task 29: Run — `cwd` injection and final widget cleanup on cancel

**Files:**

- Modify: `pi/agent/extensions/workflow-core/lib/run.ts`
- Modify: `pi/agent/extensions/workflow-core/lib/run.test.ts`

This task tightens up things missed in earlier passes:

- `RegisterWorkflowOpts.cwd` injection (default `process.cwd()`).
- Widget disposed on every exit path (including throw / cancel).
- `run.json` records `subagent_count` and `subagent_retries`.

**Step 1: Add tests for cancel-mid-run, crash, and counter accuracy.**

```ts
test("cancel mid-run still emits report with cancelled outcome in run.json", async () => {
  // ... build workflow that awaits abort, then cancel and verify run.json outcome === "cancelled"
});

test("subagent_count and subagent_retries reflect actual dispatches", async () => {
  // ... a fake spawn that fails first time, succeeds second; confirm run.json:
  //     subagent_count: 2, subagent_retries: 1
});
```

**Step 2: Run, see fail.**

**Step 3: Track counts in `registerWorkflow`'s subagent lifecycle hook and pass to `logger.close`.**

```ts
let subagentCount = 0;
let subagentRetries = 0;
const onLifecycle = (e: any) => {
  widget._emitSubagentLifecycle(/* ... */);
  if (e.kind === "start") {
    subagentCount++;
    if (e.parentId !== undefined) subagentRetries++;
    logger.recordSubagentStart({
      /* ... */
    });
  } else {
    logger.recordSubagentEnd({
      /* ... */
    });
  }
};
// ...
await logger.close({
  outcome,
  error,
  subagentCount,
  subagentRetries,
});
```

**Step 4: Run, see pass.**

**Step 5: Commit.**

```bash
git add pi/agent/extensions/workflow-core/lib/run.ts pi/agent/extensions/workflow-core/lib/run.test.ts
git commit -m "feat(workflow-core): track subagent counts; clean widget on all exit paths"
```

---

## Task 30: Public surface — `api.ts`

**Files:**

- Create: `pi/agent/extensions/workflow-core/api.ts`

**Step 1: Re-export the public API.**

```ts
export { registerWorkflow } from "./lib/run.ts";
export type { WorkflowDefinition, RegisterWorkflowOpts } from "./lib/run.ts";

export { createSubagent } from "./lib/subagent.ts";
export type { Subagent, CreateSubagentOpts } from "./lib/subagent.ts";

export { createWidget } from "./lib/widget.ts";
export type {
  Widget,
  WidgetUi,
  WidgetTheme,
  CreateWidgetOpts,
} from "./lib/widget.ts";

export { parseJsonReport } from "./lib/parse.ts";
export type { ParseResult } from "./lib/parse.ts";

export type {
  DispatchSpec,
  DispatchResult,
  RetryPolicy,
  ToolName,
  ToolEvent,
  SubagentSlot,
} from "./lib/types.ts";

// RunContext is the shape passed to `run()`. We export it as a type
// reference for workflow authors, even though they don't construct it.
export type RunContext<Args = unknown, Pre = unknown> = {
  args: Args;
  cwd: string;
  signal: AbortSignal;
  preflight: Pre;
  subagent: Subagent;
  widget: Widget;
  ui: import("@mariozechner/pi-coding-agent").ExtensionAPI;
  startedAt: number;
  log(type: string, payload?: Record<string, unknown>): void;
  workflowDir: string;
};
```

**Step 2: Verify typecheck.**

Run: `make typecheck`
Expected: PASS.

**Step 3: Commit.**

```bash
git add pi/agent/extensions/workflow-core/api.ts
git commit -m "feat(workflow-core): expose public api.ts"
```

---

## Task 31: Run full suite + typecheck

**Step 1: Run typecheck.**

Run: `make typecheck`
Expected: PASS.

**Step 2: Run all tests.**

Run: `make test`
Expected: PASS — all workflow-core tests pass alongside existing extensions.

**Step 3: If anything fails, fix and re-commit.** No new code unless tests demand it.

**Step 4: No commit if there are no changes.**

---

## Task 32: Write `README.md`

**Files:**

- Create: `pi/agent/extensions/workflow-core/README.md`

User-focused intro per design §11. ~2-3 pages. Links out to INTEGRATION.md and the design doc.

**Step 1: Draft the README.**

````markdown
# workflow-core

Pi extension that provides primitives for building structured-state-machine-around-subagents workflows. Sibling extensions (autopilot, autoralph, future PR-review / debug / triage / etc.) consume it as a library.

## What it gives you

Four primitives plus opt-in helpers:

- **Subagent** — typed dispatch with retries. Schema-validated parsed output, tagged result on failure (`dispatch | parse | schema | timeout | aborted`).
- **Run** — slash-command registration, single-active-run lock, abort plumbing, "always emit a report" guarantee, per-run logging directory.
- **Widget** — sticky live UI with title / body / footer. Function-form setters re-evaluated on tick. Live `subagents` data, theme, elapsed clock.
- **Report** — workflow's `run` returns `string[] | null`; framework emits, mirrors to disk, optionally appends a `Log:` line.

Plus opt-in helpers in `render.ts` (clock, breadcrumb, counter, subagents), `report.ts` (header, rows, sections, banners), and `preflight.ts` (file / clean-tree / capture-head).

## Hello world

```ts
import { registerWorkflow } from "../workflow-core/api.ts";
import { Type } from "@sinclair/typebox";

export default function (pi) {
  registerWorkflow(pi, {
    name: "hello",
    description: "Say hi via a subagent.",
    parseArgs: (raw) => ({ ok: true, args: { topic: raw.trim() || "world" } }),
    run: async (ctx) => {
      const r = await ctx.subagent.dispatch({
        intent: "Greet",
        prompt: `Greet me about ${ctx.args.topic} as JSON {"line":"..."}.`,
        schema: Type.Object({ line: Type.String() }),
        tools: [],
      });
      if (!r.ok) return [`Failed: ${r.error}`];
      return ["━━━ Hello Report ━━━", "", r.data.line];
    },
  });
}
```
````

`/hello-start <topic>` runs the workflow. `/hello-cancel` aborts.

## When to use it

Use `workflow-core` when your workflow:

- Orchestrates one or more subagent dispatches with structured outputs.
- Needs a live UI surface during the run (status widget).
- Should be cancellable mid-run.
- Should emit a final report.
- Benefits from per-run observability (events.jsonl + sidecar prompts/outputs).

If your extension just registers a static command that runs synchronously, you don't need workflow-core.

## Documentation

- [INTEGRATION.md](./INTEGRATION.md) — full reference for building workflows: per-primitive API, helper modules, common patterns, gotchas, testing.
- [`.designs/2026-04-25-workflow-core.md`](../../../../.designs/2026-04-25-workflow-core.md) — design rationale: why we built it this way, what we considered and rejected.

````

**Step 2: Verify the markdown renders.** (Skip if no preview tool.)

**Step 3: Commit.**

```bash
git add pi/agent/extensions/workflow-core/README.md
git commit -m "docs(workflow-core): add README"
````

---

## Task 33: Write `INTEGRATION.md` skeleton

**Files:**

- Create: `pi/agent/extensions/workflow-core/INTEGRATION.md`

Per the design (§11), INTEGRATION.md is best fleshed out iteratively as workflows migrate onto the core. For v1, ship a skeleton: section headers, brief notes per section, plus the gotchas captured from the design conversation. This gives future migrators a structure to add to.

**Step 1: Draft the skeleton.**

````markdown
# Building workflows on workflow-core

> Reference for extension authors building a new workflow on top of `workflow-core`. Organized by API user's perspective. For design rationale see [`.designs/2026-04-25-workflow-core.md`](../../../../.designs/2026-04-25-workflow-core.md).

## Walkthrough: a minimal workflow end-to-end

Walk a new author through building a small workflow step-by-step. _To be fleshed out as autoralph / autopilot migrate onto workflow-core._

## API reference

### Subagent

Typed dispatch with retries. See [`api.ts`](./api.ts) for the full type signatures.

`ctx.subagent.dispatch(spec)` — single dispatch. Returns a tagged `DispatchResult`. Failure modes: `dispatch | parse | schema | timeout | aborted`. Default retry policy is `one-retry-on-dispatch`; opt out with `retry: "none"`.

`ctx.subagent.parallel(specs, opts?)` — fan-out with optional concurrency limit.

### Run

`registerWorkflow(pi, def)` registers `/<name>-start` and `/<name>-cancel`. The `run(ctx)` function returns `Promise<string[] | null>` — those lines become the final report.

### Widget

`ctx.widget.setTitle / setBody / setFooter` accept `string | () => string` (or `string[]`). Function form is re-evaluated on tick + on subagent events. Live data: `widget.subagents`, `widget.elapsedMs()`, `widget.theme`.

### Report

The framework appends `Log: <path>` after the workflow's lines (opt-out via `emitLogPath: false`). Workflow owns its banners on cancel/failure — use `formatCancelledBanner` / `formatFailureBanner` from `report.ts`.

### Logging

`ctx.log(type, payload)` writes a workflow-named-prefixed event (`<workflow>.<type>`) to events.jsonl. Calls after `run()` returns are silently dropped.

`ctx.workflowDir` points at `<run-dir>/workflow/` — write any workflow-owned files there.

## Helpers

### render.ts

- `renderClock(elapsedMs)` — `MM:SS` (or `HH:MM:SS` past an hour).
- `renderStageBreadcrumb({stages, active, theme?})` — `plan › implement › verify`-style header.
- `renderCounter({label, current, total?, theme?})` — `iter 7/50` or `iter 7`.
- `renderSubagents(slots, opts?)` — `↳ <intent> (MM:SS)` lines for each running slot.

### report.ts

- `formatHeader(title)` — boxed title.
- `formatLabelValueRow(label, value, opts?)` — padded `Label:   value` row.
- `formatGitInfoBlock({branch, commitsAhead, baseBranch?})` — `Branch:   <branch>  (N commits ahead of <base>)`.
- `formatSection(title, indentedLines)` — titled, indented section.
- `formatKnownIssues(issues)` — `Known issues:` section (empty input → empty array).
- `formatCancelledBanner(elapsedMs)` / `formatFailureBanner(reason)`.

### preflight.ts

- `requireFile(path)` / `requireCleanTree(cwd)` / `captureHead(cwd)`.

## Common patterns

### Sequential subagent dispatches with halt-on-failure

```ts
for (const item of items) {
  const r = await ctx.subagent.dispatch(/* ... */);
  if (!r.ok) return [`Failed at ${item.name}: ${r.error}`];
}
```
````

### Parallel reviewers

```ts
const results = await ctx.subagent.parallel([
  reviewer1Spec,
  reviewer2Spec,
  reviewer3Spec,
]);
const ok = results.filter((r) => r.ok);
```

### Capped fix loop

```ts
let rounds = 0;
while (rounds < 2 && !ctx.signal.aborted) {
  const check = await ctx.subagent.dispatch(checkSpec);
  if (!check.ok || isPassing(check.data)) break;
  const fix = await ctx.subagent.dispatch(fixSpec(check.data));
  if (!fix.ok) break;
  rounds++;
}
```

(_v1 ships no pattern helpers — these inline loops are intentional. See design §6._)

## Gotchas

- **The detach pattern.** `registerWorkflow` returns immediately from the slash-command handler so `/<name>-cancel` can fire. If you write your own runner, remember not to `await` your pipeline inside the handler.
- **Function-form widget setters.** `setBody(() => ...)` is re-evaluated on every tick and every subagent event. Don't put expensive work in there — keep it pure rendering of state.
- **`ctx.log` workflow-name auto-prefix.** `ctx.log("foo", ...)` writes `<workflow>.foo` in events.jsonl. Don't include the workflow name yourself.
- **Framework owns the run-dir top level.** Write your own files only inside `ctx.workflowDir`. Never write to events.jsonl, run.json, prompts/, outputs/.
- **Tagged results, not throws.** `subagent.dispatch` never throws on subagent failure. Always check `r.ok`.

## Testing your workflow

_To be fleshed out as workflows migrate. The framework's `RegisterWorkflowOpts` accepts `spawn` and `logBaseDir` injection points for tests._

````

**Step 2: Verify the markdown renders.**

**Step 3: Commit.**

```bash
git add pi/agent/extensions/workflow-core/INTEGRATION.md
git commit -m "docs(workflow-core): add INTEGRATION skeleton"
````

---

## Task 34: Update `pi/README.md` to list `workflow-core`

**Files:**

- Modify: `pi/README.md` (extension table)

**Step 1: Insert a row in the extension table, alphabetically positioned.**

The table currently has `web-access` as its last row. Add a `workflow-core` row right after it.

```diff
 | `web-access`     | Web search, fetch, GitHub, and PDF tools                        |
+| `workflow-core`  | Primitives for structured-state-machine-around-subagents workflows |
```

**Step 2: Verify by reading the file** — alignment should still be reasonable; if column widths shift, adjust the trailing pipes.

**Step 3: Commit.**

```bash
git add pi/README.md
git commit -m "docs(pi): list workflow-core extension"
```

---

## Final verification

Run full sweep before reporting done:

```bash
make typecheck
make test
```

Both must pass. If anything fails, diagnose and add a fix task; do not skip.

<!-- Documentation note: README and INTEGRATION are added by Tasks 32-33. pi/README updated in Task 34. The design doc (`.designs/2026-04-25-workflow-core.md`) is the archived spec and stays unchanged. INTEGRATION.md is a deliberate skeleton — fleshed out iteratively as autopilot/autoralph migrate onto the core (per design §11). -->
