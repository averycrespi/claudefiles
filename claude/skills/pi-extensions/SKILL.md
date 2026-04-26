---
name: pi-extensions
description: Use when writing, editing, or debugging Pi coding agent extensions
---

# Writing Pi Extensions

Pi extensions are TypeScript modules that customize the pi coding agent. They live in `pi/agent/extensions/` in this repo and are symlinked into `~/.pi/agent/extensions/` via GNU Stow (already set up — edits take effect immediately, no stow needed).

The upstream documentation and examples are the authoritative reference. Before writing a non-trivial extension, fetch the relevant section from the pi-mono repo:

- Full extension guide: `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md`
- All type definitions: `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts`
- Official examples: `https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions`

## Extension anatomy

Every extension exports a **synchronous** factory function that receives the `ExtensionAPI` object and registers tools, events, and commands during load time. No async calls during factory execution.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // register tools, events, commands here
}
```

**Imports available:**

- `@mariozechner/pi-coding-agent` — core types and helpers (`ExtensionAPI`, etc.)
- `@sinclair/typebox` — JSON Schema for tool parameters (`Type`, `Static`)
- `@mariozechner/pi-tui` — TUI rendering components (`Text`, etc.)
- `node:*` — Node.js built-ins
- npm packages — add a `package.json` inside the extension subdirectory

## File structure

Every extension lives in its own subdirectory with an `index.ts` entry point:

```
pi/agent/extensions/my-extension/
├── index.ts          ← required entry point, exports default function
├── helpers.ts
├── index.test.ts     ← co-located tests are safe here (not loaded)
└── package.json      ← if npm deps needed
```

Pi does support single-file top-level extensions (`extensions/name.ts`), but we don't use them in this repo — the loader treats every top-level `*.ts` as an extension entry point, so a co-located `name.test.ts` gets loaded as a broken extension and breaks Pi startup. Always use the subdirectory layout so you can add tests later without having to restructure.

Larger extensions can nest further (`autopilot/` has `lib/`, `phases/`, `prompts/`). The only hard requirement is a top-level `index.ts` that exports the factory function.

## Sharing code across extensions

For helpers that don't belong to any one extension (render helpers, general utilities), put them in `pi/agent/extensions/_shared/`. That directory has no `index.ts`, so the loader skips it; other extensions import via relative path:

```ts
import { firstLine, formatDuration } from "../_shared/render.ts";
```

An extension can also expose a public surface to other extensions by creating an `api.ts` that re-exports its stable API. Siblings then import from that file:

```ts
// autopilot/index.ts
import { taskList } from "../task-list/api.ts";
import { spawnSubagent } from "../subagents/api.ts";
```

Two things to know about cross-extension imports:

- **Singletons share via module caching.** `task-list/api.ts` does `export const taskList = createStore()`. Because Node caches imported modules, every extension that imports `taskList` sees the same store — that's how the autopilot pipeline drives the task list that `task-list` renders.
- **Cross-extension imports create a load-order dependency.** If `autopilot` imports from `task-list`, it silently requires `task-list` to be installed. Consider whether the coupling is worth it; if the helper is general-purpose, `_shared/` is the better home.

When a library outgrows `_shared/` — its own subtree, types, a curated public API — promote it to a top-level underscore-prefixed directory with its own `api.ts`. `_workflow-core/` is the worked example: no `index.ts` (loader skips it), an `api.ts` that re-exports the stable surface, and nested `lib/`, `render/`, `report/` for internals. Sibling extensions import via `../_workflow-core/api.ts` like any other cross-extension public surface. Use this when the code has its own conceptual identity beyond "shared helpers"; otherwise stay in `_shared/`.

## Registering tools

```typescript
import { Type, type Static } from "@sinclair/typebox";

const params = Type.Object({
  path: Type.String({ description: "File path" }),
  count: Type.Optional(Type.Number({ description: "Number of items" })),
});

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What it does and when to use it",
  parameters: params,

  async execute(toolCallId, params: Static<typeof params>, signal, onUpdate, ctx) {
    if (!ctx.hasUI) { /* handle headless */ }
    return {
      content: [{ type: "text" as const, text: "result" }],
      details: {},   // metadata for session reconstruction
    };
  },

  // Optional: custom TUI rendering
  renderCall(args, theme, context) { ... },
  renderResult(result, { isPartial }, theme, context) { ... },
});
```

**Dynamic parameter schemas.** `parameters` is a regular value — compose it at registration time when the schema depends on load-time config:

```typescript
function buildSpawnAgentsParams(agentDescription: string) {
  return Type.Object({
    agents: Type.Array(
      Type.Object({
        agent: Type.String({ description: agentDescription }),
        prompt: Type.String(),
      }),
      { minItems: 1 },
    ),
  });
}

pi.registerTool({
  name: "spawn_agents",
  parameters: buildSpawnAgentsParams(buildAgentDescription(loadAgents())),
  async execute(id, params: SpawnAgentsParams, ...) { /* ... */ },
});
```

Typical use: surfacing discovered configuration (available agent types, registered providers) in a parameter's description so the model sees it. When `parameters` is built by a function, `Static<typeof params>` doesn't work directly — declare an explicit `SpawnAgentsParams` interface and use it for `execute`'s `params` type.

**Tool override:** register with the same name as a built-in (`"read"`, `"edit"`, `"write"`, `"bash"`, `"grep"`) to replace it. The original built-in renderer is reused if you don't provide `renderCall`/`renderResult`.

### Rendering tool calls in the TUI

Tools should implement `renderCall` and `renderResult` with compact, one-line output so the TUI footer doesn't overflow. We've converged on a specific shape — read `references/tui-rendering.md` before writing renderers, and import shared helpers (`firstLine`, `getResultText`, `getRelativeLabel`, `formatDuration`, `partialElapsed`, `clearPartialTimer`, ...) from `pi/agent/extensions/_shared/render.ts` rather than reimplementing them per-extension.

## Handling events

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName !== "bash") return;
  if (isBad(event.input.command)) return { block: true, reason: "Not allowed" };
  event.input.command = `modified ${event.input.command}`; // mutate in place
});

pi.on("tool_result", async (event, ctx) => { ... });

pi.on("before_agent_start", async (event) => {
  return { systemPrompt: `${event.systemPrompt}\n\nExtra guidance.` };
});

pi.on("context", async (event, ctx) => {
  // Prepend messages to every outbound LLM call
  return {
    messages: [
      { role: "user", content: [{ type: "text", text: "..." }], timestamp: Date.now() },
      ...event.messages,
    ],
  };
});
```

Key events: `session_start`, `turn_start`, `turn_end`, `before_agent_start`, `agent_start`, `agent_end`, `context`, `tool_call`, `tool_result`, `input`, `user_bash`. See `types.ts` for the full list and return shapes.

## Custom messages

When an extension needs to render persistent, structured UI inline in the chat log (not just in the footer), combine `pi.registerMessageRenderer` with `pi.sendMessage` in display mode:

```typescript
const CUSTOM_TYPE = "my-extension";

pi.registerMessageRenderer<MyPayload>(
  CUSTOM_TYPE,
  (message, _options, theme) => {
    const state = message.details;
    if (!state) return undefined; // falls back to `content` text
    return new Text(renderLines(state, theme).join("\n"), 0, 0);
  },
);

pi.sendMessage<MyPayload>({
  customType: CUSTOM_TYPE,
  content: [{ type: "text", text: summaryForReplay(state) }],
  display: true,
  details: state,
});
```

- The `details` payload is what the renderer reads back; keep it serializable so session replay works.
- `content` is the plain-text fallback shown in session replay and in environments where the extension isn't loaded — make it a useful summary, not a placeholder.
- Return `undefined` from the renderer on missing/invalid payload; Pi renders the `content` text instead.
- Debounce high-frequency updates so the log doesn't flood — `task-list` uses a 100ms debounce on store mutations.

## Registering slash commands

```typescript
pi.registerCommand("my-command", {
  description: "What this command does",
  handler: async (args, ctx) => {
    await ctx.waitForIdle();
    pi.sendUserMessage("Do something");
  },
});
```

## Sending steer messages

```typescript
pi.sendMessage(
  {
    customType: "my-extension",
    content: "Retry using the correct tool.",
    display: false,
    details: {},
  },
  { deliverAs: "steer" },
);
```

## UI interactions

Always check `ctx.hasUI` before calling UI methods:

```typescript
if (ctx.hasUI) {
  ctx.ui.notify("Something happened", "warning");
  const ok = await ctx.ui.confirm("Title", "Are you sure?");
  const choice = await ctx.ui.select("Pick one", ["A", "B", "C"]);
  const text = await ctx.ui.input("Label", "placeholder");

  ctx.ui.setStatus("my-extension", "status text"); // single-line footer entry
  ctx.ui.setWidget("my-extension", ["line 1", "line 2"]); // multi-line footer block
  // pass undefined to clear either
}
```

Use `setStatus` for a single-line footer entry and `setWidget` when you need multiple lines (autopilot's stage breadcrumb, subagents' activity tree). Both are keyed so multiple extensions can coexist.

For full keyboard-driven modals that need their own render loop, use `ctx.ui.custom<T>(...)` — see `ask-user/index.ts` for the reference implementation.

## Workflow

1. Fetch the relevant upstream docs/examples for the pattern you need.
2. Create the extension directory at `extensions/name/` with an `index.ts` entry point.
3. Write the extension.
4. Run `make typecheck` from the repo root to verify types.
5. Write co-located unit tests (`*.test.ts`) for pure logic — tests use `node:test` via `tsx` and import source with `.ts` extensions. Run with `make test`. Keep tests to pure logic; TUI, event loop, and subagent spawn paths are covered by running pi end-to-end.
6. Integration-test by running pi in the target working directory — the extension loads automatically.
