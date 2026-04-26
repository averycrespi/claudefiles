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

## Prior art

- [davidorex/pi-project-workflows](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-workflows) — another take on structured Pi workflows.
