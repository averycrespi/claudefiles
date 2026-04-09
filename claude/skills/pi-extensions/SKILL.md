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

**Single-file extension:**

```
pi/agent/extensions/my-extension.ts
```

**Multi-file extension** (when you need helpers or npm deps):

```
pi/agent/extensions/my-extension/
├── index.ts          ← required entry point, exports default function
├── helpers.ts
└── package.json      ← if npm deps needed
```

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

**Tool override:** register with the same name as a built-in (`"read"`, `"edit"`, `"write"`, `"bash"`, `"grep"`) to replace it. The original built-in renderer is reused if you don't provide `renderCall`/`renderResult`.

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
}
ctx.ui.setStatus("my-extension", "status text"); // footer widget, always safe
```

## Workflow

1. Fetch the relevant upstream docs/examples for the pattern you need.
2. Decide: single file (`extensions/name.ts`) or subdirectory (`extensions/name/index.ts`)?
3. Write the extension.
4. Run `npx tsc` from the repo root to verify types.
5. Test by running pi in the target working directory — the extension loads automatically.
