# MCP Broker Meta-Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Replace the `broker-cli`-based Pi integration with three native MCP meta-tools (`mcp_search`, `mcp_describe`, `mcp_call`) that talk directly to the MCP broker via the official TypeScript SDK.

**Architecture:** A shared `BrokerClient` wraps `@modelcontextprotocol/sdk`'s `StreamableHTTPClientTransport`, handling lazy connect, session reuse, and a cached provider list. Three Pi tools share that client via closure. The existing bash guard is kept but its steering text is rewritten to point at `mcp_call`. A namespace hint is injected into the system prompt via `before_agent_start` so the agent sees available provider prefixes up front — this preserves cache stability because the tools array stays static.

**Tech Stack:** TypeScript, `@mariozechner/pi-coding-agent`, `@sinclair/typebox`, `@modelcontextprotocol/sdk` (already a repo-root dep).

**Design reference:** `.designs/2026-04-11-mcp-broker-meta-tools.md` — the rationale, decisions, error-handling table, and cache-stability argument all live there. Read it before starting.

---

## Preconditions

- `@modelcontextprotocol/sdk ^1.29.0` is already declared in `package.json:13` at the repo root. Do **not** add a per-extension `package.json`.
- Typecheck runs from the repo root via `make typecheck` (invokes `npx -p typescript tsc` against `tsconfig.json`, which globs `pi/agent/extensions/**/*.ts`).
- All file paths below are **relative to the repo root**. Never hardcode an absolute path.
- Only run `make stow-pi` if the user explicitly asks — this is a source edit, not a deploy.

## Task 1: Create `BrokerClient`

**Files:**

- Create: `pi/agent/extensions/mcp-broker/client.ts`

**Step 1: Write the client module**

Create `pi/agent/extensions/mcp-broker/client.ts` with this content:

```typescript
/**
 * MCP client wrapper for the broker.
 *
 * Owns a single long-lived MCP client connection to the broker over
 * Streamable HTTP. Lazy-connects on first use, caches the fetched tool
 * list (so provider namespaces and schemas can be read without a round
 * trip on every call), and exposes a small surface consumed by tools.ts
 * and the namespace-hint hook in index.ts.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

export type BrokerTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export class BrokerClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private cachedTools: BrokerTool[] | null = null;
  private cachedProviders: string[] | null = null;

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    const endpoint = process.env.MCP_BROKER_ENDPOINT;
    const token = process.env.MCP_BROKER_AUTH_TOKEN;
    if (!endpoint || !token) {
      throw new Error(
        "broker endpoint not configured — set MCP_BROKER_ENDPOINT and MCP_BROKER_AUTH_TOKEN",
      );
    }

    this.connecting = (async () => {
      const transport = new StreamableHTTPClientTransport(
        new URL(`${endpoint}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      );
      const client = new Client(
        { name: "pi-mcp-broker", version: "0.1.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      this.client = client;
      return client;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async listTools(): Promise<BrokerTool[]> {
    const client = await this.getClient();
    const result = await client.listTools();
    const tools: BrokerTool[] = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    this.cachedTools = tools;
    this.cachedProviders = extractProviders(tools);
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    const client = await this.getClient();
    return client.callTool({ name, arguments: args }, undefined, {
      signal,
      timeout: APPROVAL_TIMEOUT_MS,
    });
  }

  /** Return cached tools without a network call. Populated by listTools. */
  getCachedTools(): BrokerTool[] | null {
    return this.cachedTools;
  }

  /** Return cached provider namespaces without a network call. */
  getCachedProviders(): string[] | null {
    return this.cachedProviders;
  }

  /** Drop the current client so the next call reconnects. */
  reset(): void {
    this.client = null;
    this.cachedTools = null;
    this.cachedProviders = null;
  }
}

function extractProviders(tools: BrokerTool[]): string[] {
  const set = new Set<string>();
  for (const tool of tools) {
    const dot = tool.name.indexOf(".");
    if (dot > 0) set.add(tool.name.slice(0, dot));
  }
  return Array.from(set).sort();
}
```

**Step 2: Typecheck**

Run: `make typecheck`
Expected: no errors. If `tsc` complains about a missing `tools` field or a mismatched type from the SDK, read the actual SDK types at `node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.d.ts` and adjust — do not paper over with `as any`.

**Step 3: Commit**

```bash
git add pi/agent/extensions/mcp-broker/client.ts
git commit -m "feat(mcp-broker): add BrokerClient for direct MCP access"
```

---

## Task 2: Create `tools.ts` with the three meta-tools

**Files:**

- Create: `pi/agent/extensions/mcp-broker/tools.ts`

**Step 1: Write the tools module**

Create `pi/agent/extensions/mcp-broker/tools.ts`:

````typescript
/**
 * Three Pi tools that wrap the MCP broker:
 *   - mcp_search: list/filter broker tools by name/description substring
 *   - mcp_describe: return full description + input schema for a named tool
 *   - mcp_call: invoke a broker tool with a JSON argument object
 *
 * All three share one BrokerClient via closure so the MCP session is
 * reused across invocations.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { BrokerClient, BrokerTool } from "./client.js";

const SEARCH_PARAMS = Type.Object({
  query: Type.String({
    description:
      'Case-insensitive substring to match against tool name and description. Pass empty string "" to list everything.',
  }),
});

const DESCRIBE_PARAMS = Type.Object({
  name: Type.String({
    description: "Exact tool name, e.g. 'github.create_pr'.",
  }),
});

const CALL_PARAMS = Type.Object({
  name: Type.String({
    description: "Exact tool name from mcp_search.",
  }),
  arguments: Type.Object(
    {},
    {
      additionalProperties: true,
      description:
        "Arguments matching the tool's inputSchema. Use mcp_describe to see the schema first.",
    },
  ),
});

function summarize(tool: BrokerTool): string {
  const desc = (tool.description ?? "").split("\n")[0]?.trim() ?? "";
  return desc ? `${tool.name} — ${desc}` : tool.name;
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
    details: {},
  };
}

export function registerTools(pi: ExtensionAPI, client: BrokerClient): void {
  pi.registerTool({
    name: "mcp_search",
    label: "MCP Search",
    description:
      "Search tools exposed by the MCP broker. Tool names follow <provider>.<tool>. Pass a substring query to filter by name or description, or an empty string to list everything.",
    parameters: SEARCH_PARAMS,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      let tools: BrokerTool[];
      try {
        tools = await client.listTools();
      } catch (err) {
        return errorResult(
          `mcp_search failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const q = params.query.trim().toLowerCase();
      const matches = q
        ? tools.filter((t) => {
            const name = t.name.toLowerCase();
            const desc = (t.description ?? "").toLowerCase();
            return name.includes(q) || desc.includes(q);
          })
        : tools;
      const text = matches.length
        ? matches.map(summarize).join("\n")
        : `No broker tools match "${params.query}".`;
      return {
        content: [{ type: "text" as const, text }],
        details: { matchCount: matches.length, totalCount: tools.length },
      };
    },
  });

  pi.registerTool({
    name: "mcp_describe",
    label: "MCP Describe",
    description:
      "Return the full description and JSON Schema input for a named broker tool. Use mcp_search first to discover names.",
    parameters: DESCRIBE_PARAMS,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      let tools: BrokerTool[];
      try {
        tools = await client.listTools();
      } catch (err) {
        return errorResult(
          `mcp_describe failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) {
        return errorResult(
          `No broker tool named "${params.name}". Run mcp_search to find available tools.`,
        );
      }
      const schemaJson = JSON.stringify(tool.inputSchema ?? {}, null, 2);
      const text = [
        `Tool: ${tool.name}`,
        "",
        tool.description ?? "(no description)",
        "",
        "Input schema:",
        "```json",
        schemaJson,
        "```",
      ].join("\n");
      return {
        content: [{ type: "text" as const, text }],
        details: { name: tool.name },
      };
    },
  });

  pi.registerTool({
    name: "mcp_call",
    label: "MCP Call",
    description:
      "Invoke a broker tool. Use mcp_describe to learn the input schema first. Calls that need human approval block for up to 10 minutes.",
    parameters: CALL_PARAMS,
    async execute(_id, params, signal, _onUpdate, _ctx) {
      try {
        const result = await client.callTool(
          params.name,
          params.arguments,
          signal,
        );
        return {
          content: result.content ?? [],
          isError: Boolean(result.isError),
          details: { name: params.name },
        };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        const message = err instanceof Error ? err.message : String(err);
        const looksLikeSession = /session/i.test(message);
        if (looksLikeSession) {
          client.reset();
          try {
            const retried = await client.callTool(
              params.name,
              params.arguments,
              signal,
            );
            return {
              content: retried.content ?? [],
              isError: Boolean(retried.isError),
              details: { name: params.name, retried: true },
            };
          } catch (retryErr) {
            const retryMsg =
              retryErr instanceof Error ? retryErr.message : String(retryErr);
            return errorResult(
              `mcp_call failed after session retry: ${retryMsg}`,
            );
          }
        }
        return errorResult(`mcp_call failed: ${message}`);
      }
    },
  });
}
````

**Step 2: Typecheck**

Run: `make typecheck`
Expected: no errors. If `registerTool`'s signature complains about `execute`'s parameters or return shape, read `node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts` and align. Do not suppress with `any`.

**Step 3: Commit**

```bash
git add pi/agent/extensions/mcp-broker/tools.ts
git commit -m "feat(mcp-broker): add mcp_search/describe/call meta-tools"
```

---

## Task 3: Rewrite the guard's steering text

**Files:**

- Modify: `pi/agent/extensions/mcp-broker/guard.ts`

**Step 1: Rewrite the prompt append and steer messages**

Open `pi/agent/extensions/mcp-broker/guard.ts`. Three edits, all text-only — the bash-regex interception logic (`BLOCK_COMMAND_SPLIT_RE`, `GH_RE`, `GIT_REMOTE_RE`, `findBlockedCommand`, the `tool_call` handler at lines 93-126) is unchanged.

**Edit A:** Remove the now-unused `BROKER_CLI_RE` constant (declared at line 26). It was whitelisting `broker-cli`; we're not invoking `broker-cli` anymore, and no other code references it.

Delete this line:

```typescript
const BROKER_CLI_RE = new RegExp(`${COMMAND_PREFIX}broker-cli\\b`);
```

And delete the corresponding check inside `findBlockedCommand`:

```typescript
if (BROKER_CLI_RE.test(segment)) continue;
```

**Edit B:** Replace `BROKER_PROMPT_APPEND` (lines 32-38). The new text references the meta-tools instead of `broker-cli`:

```typescript
const BROKER_PROMPT_APPEND = [
  "Broker guidance:",
  "- Use local git commands for local-only repository work.",
  "- Use mcp_call with the broker's git tools for remote git operations (push/pull/fetch/ls-remote/remote) instead of running them through bash.",
  "- Use mcp_call with the broker's github tools instead of the GitHub CLI (gh).",
  "- Discover available broker tools with mcp_search; inspect a tool's schema with mcp_describe before calling it.",
].join("\n");
```

**Edit C:** Replace `getSteerMessage` (lines 63-78):

```typescript
function getSteerMessage(match: BlockedCommandMatch, _cwd: string) {
  if (match.kind === "github-cli") {
    return [
      "The previous bash command was blocked because GitHub access in this environment should go through the MCP broker, not gh.",
      `Blocked command segment: ${match.segment}`,
      'Run mcp_search with query "github" to find the broker tool you need, then mcp_describe for its schema, then mcp_call to invoke it.',
    ].join("\n\n");
  }

  return [
    "The previous bash command was blocked because remote git operations in this environment should go through the MCP broker, not direct git bash commands.",
    `Blocked command segment: ${match.segment}`,
    'Run mcp_search with query "git" to find the broker tool you need, then mcp_describe for its schema, then mcp_call to invoke it.',
  ].join("\n\n");
}
```

Note the `cwd` parameter is now unused but kept for signature compatibility with the caller; prefix with `_` as shown.

Also update the block-reason strings at lines 56-61:

```typescript
function getBlockReason(kind: BlockedCommandKind) {
  if (kind === "github-cli") {
    return "Blocked GitHub CLI command. Use mcp_call with broker github tools instead.";
  }
  return "Blocked remote git command. Use mcp_call with broker git tools instead.";
}
```

Also update the top-of-file JSDoc comment (lines 1-13): replace "Broker CLI" phrasings with "MCP broker meta-tools" phrasings. Keep it accurate — the guard still appends a reminder to the system prompt, still blocks `gh`/remote-git bash calls, still injects one steer per turn — only the recommended alternative changed.

**Step 2: Typecheck**

Run: `make typecheck`
Expected: no errors.

**Step 3: Commit**

```bash
git add pi/agent/extensions/mcp-broker/guard.ts
git commit -m "refactor(mcp-broker): point guard steering at mcp_call"
```

---

## Task 4: Wire up the extension in `index.ts`

**Files:**

- Modify: `pi/agent/extensions/mcp-broker/index.ts`

**Step 1: Replace index.ts**

The current file (21 lines) registers skill paths via `resources_discover` and initializes the guard. Replace its contents entirely with:

```typescript
/**
 * MCP Broker extension for Pi.
 *
 * Registers three meta-tools (mcp_search, mcp_describe, mcp_call) that
 * talk directly to the broker over MCP Streamable HTTP, plus the bash
 * guard that steers the agent away from native gh/git in favor of
 * mcp_call. Also injects a one-line namespace hint into the system
 * prompt at agent start so the agent sees the live set of provider
 * prefixes without having to probe.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BrokerClient } from "./client.js";
import initGuard from "./guard.js";
import { registerTools } from "./tools.js";

export default function (pi: ExtensionAPI) {
  const client = new BrokerClient();

  registerTools(pi, client);
  initGuard(pi);

  // Pre-fetch the tool list on session start so the namespace hint is
  // ready by the time before_agent_start fires. Silently skip on
  // failure — the meta-tools still work, and the hint is a nice-to-have.
  pi.on("session_start", async () => {
    try {
      await client.listTools();
    } catch {
      // Broker unreachable or env unset. mcp_search will surface the real
      // error on the first agent call.
    }
  });

  // Inject the namespace hint into the system prompt. This is the
  // cache-safe place for session-scoped dynamic context: the tools array
  // stays static, and the system prompt is stable within a session.
  pi.on("before_agent_start", async (event) => {
    const providers = client.getCachedProviders();
    if (!providers || providers.length === 0) {
      return undefined;
    }
    const hint = [
      `The MCP broker currently exposes tools in these namespaces: ${providers.join(", ")}.`,
      "Use mcp_search to find specific tools; tool names follow <namespace>.<tool>.",
    ].join("\n");
    return {
      systemPrompt: `${event.systemPrompt}\n\n${hint}`,
    };
  });
}
```

Key things to notice:

- The `resources_discover` handler is **gone** — there's no bundled skill to register anymore. Task 5 deletes the directory.
- Two extensions of `before_agent_start` end up being registered: this one (namespace hint) and the guard's existing one (broker-guidance prompt append). Pi's extension runner chains `systemPrompt` return values across handlers — verify this is true by reading `node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/runner.d.ts` if the manual smoke in Task 8 shows only one of the two appending.
- The `session_start` fetch is best-effort. Intentionally swallowing the error here is correct — the first `mcp_call` or `mcp_search` will surface the real error to the agent via `errorResult` in `tools.ts`.

**Step 2: Typecheck**

Run: `make typecheck`
Expected: no errors. Common failures: `event.systemPrompt` typing, import path of `./tools.js` vs `./tools`. Pi extensions use `.js` extensions in imports even though sources are `.ts` (NodeNext resolution). Match the existing guard import in `index.ts` original: `import initGuard from "./guard.js"`.

**Step 3: Commit**

```bash
git add pi/agent/extensions/mcp-broker/index.ts
git commit -m "feat(mcp-broker): register meta-tools and namespace hint"
```

---

## Task 5: Delete the bundled `broker-cli` skill

**Files:**

- Delete: `pi/agent/extensions/mcp-broker/skills/` (directory and all contents)

**Step 1: Delete the directory**

```bash
rm -rf pi/agent/extensions/mcp-broker/skills
```

**Step 2: Verify no code still references the skill**

Run: `git grep -n "broker-cli" pi/agent/extensions/mcp-broker/`
Expected: **no matches** inside the extension directory. (Matches elsewhere in the repo, like `AGENTS.md` or `README.md`, are fine — they get handled in later tasks.)

If there are matches inside the extension, something was missed in Task 3 or Task 4. Fix before proceeding.

**Step 3: Typecheck**

Run: `make typecheck`
Expected: no errors.

**Step 4: Commit**

```bash
git add -u pi/agent/extensions/mcp-broker/skills
git commit -m "chore(mcp-broker): remove bundled broker-cli skill"
```

---

## Task 6: Rewrite the extension README

**Files:**

- Modify: `pi/agent/extensions/mcp-broker/README.md` (replace entire contents)

**Step 1: Replace README contents**

Write this as the new `pi/agent/extensions/mcp-broker/README.md`:

```markdown
# mcp-broker

Pi extension that exposes the MCP broker to the agent via three meta-tools (`mcp_search`, `mcp_describe`, `mcp_call`) plus a bash guard that redirects native `gh` and remote-git calls to the broker.

## What it does

- **Meta-tools** — registers `mcp_search`, `mcp_describe`, and `mcp_call`, which share one long-lived MCP client connection to the broker. The agent discovers tools with `mcp_search`, inspects their schemas with `mcp_describe`, and invokes them with `mcp_call`. The upstream broker tool set stays out of the agent's tool list, so the prompt cache prefix stays stable regardless of how many broker tools are discovered.
- **Namespace hint** — on `session_start` the extension pre-fetches the broker's tool list and caches the unique namespace prefixes (e.g. `git`, `github`). `before_agent_start` injects a one-line hint into the system prompt so the agent knows which providers exist without having to probe.
- **Guard** — blocks direct `gh` and remote git (`push`, `pull`, `fetch`, `ls-remote`, `remote`) in bash and steers the agent to use `mcp_call` instead. Local git is unaffected.

## Usage

Typical agent flow:

1. `mcp_search` with a substring query (e.g. `"pr"`, `"git"`, empty string for everything). Returns name + one-line description per match.
2. `mcp_describe` for any candidate that looks right. Returns the full description and JSON Schema for `arguments`.
3. `mcp_call` with the exact name and an arguments object matching the schema.

Tool calls that require human approval block for up to 10 minutes, matching the broker's own approval timeout. After 10 minutes without an approval decision, `mcp_call` returns an error and the agent can retry.

## Configuration

Set these environment variables before starting Pi:

- `MCP_BROKER_ENDPOINT` — base URL of the broker (the extension connects to `${MCP_BROKER_ENDPOINT}/mcp`).
- `MCP_BROKER_AUTH_TOKEN` — bearer token for the broker's MCP endpoint.

If either variable is missing, the meta-tools are still registered, but any call returns a clear configuration error — Pi remains usable on machines without a broker.

## Guard behavior

When `gh ...` or a remote git operation is detected in bash:

1. The bash call is blocked with a short reason.
2. A steering message tells the agent to use `mcp_search` / `mcp_describe` / `mcp_call` with the appropriate provider namespace.
3. A UI notification appears once per turn.

The guard also appends short broker guidance to the system prompt on each turn.

## File layout

- `index.ts` — entry point, instantiates `BrokerClient`, wires up tools, guard, and namespace-hint hook
- `client.ts` — `BrokerClient` wrapping `@modelcontextprotocol/sdk`'s `StreamableHTTPClientTransport`
- `tools.ts` — `mcp_search`, `mcp_describe`, `mcp_call` definitions
- `guard.ts` — bash interception and steering logic

## Inspiration

- [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) — proxy-tool pattern for exposing an MCP broker to Pi through a minimal set of meta-tools rather than one-tool-per-upstream-tool fan-out. Influenced the decision to go with a small static surface instead of fanning upstream tools into the Pi tool list, and demonstrated the value of making the meta-tool's search/describe path feel first-class.
- Claude Code's `ToolSearch` + `defer_loading` pattern — studied and explicitly not copied. Claude Code accepts prompt-cache invalidation on tool discovery in exchange for context-window savings; this extension optimizes in the other direction (cache stability > per-call token efficiency) because Pi has no API-level `defer_loading` support and our sessions are long-lived.
```

**Step 2: Sanity check**

Run: `git diff pi/agent/extensions/mcp-broker/README.md | head -60`
Expected: see the new content replacing the old.

**Step 3: Commit**

```bash
git add pi/agent/extensions/mcp-broker/README.md
git commit -m "docs(mcp-broker): rewrite README for meta-tools model"
```

---

## Task 7: Update `AGENTS.md` to reference the meta-tools

**Files:**

- Modify: `pi/agent/AGENTS.md` (the "Broker-backed External Access" section at lines 19-25)

**Step 1: Replace the section**

Open `pi/agent/AGENTS.md`. Replace the section currently reading:

```markdown
## Broker-backed External Access

- This environment is intentionally minimal: do not assume direct access to external services via local secrets or ad hoc authenticated CLIs.
- When a task needs authenticated or broker-backed access to external systems, use the `broker-cli` skill and invoke `broker-cli` through `bash`.
- Treat the broker catalog as dynamic. Discover available namespaces and tools with `broker-cli --help` and `broker-cli <namespace> --help` before choosing a command.
- Use broker-backed tools for operations such as remote git or GitHub access. `git` and `github` are common examples, but additional namespaces may also be available.
- If the task is purely local, prefer local tools and do not route it through the broker.
```

with:

```markdown
## Broker-backed External Access

- This environment is intentionally minimal: do not assume direct access to external services via local secrets or ad hoc authenticated CLIs.
- When a task needs authenticated or broker-backed access to external systems, use the `mcp_search`, `mcp_describe`, and `mcp_call` tools provided by the `mcp-broker` extension.
- Treat the broker catalog as dynamic. The session's system prompt lists the currently available provider namespaces; use `mcp_search` to find specific tools and `mcp_describe` to inspect a tool's schema before calling it.
- Tool names follow `<namespace>.<tool>`. Use broker-backed tools for operations such as remote git or GitHub access — `git` and `github` are common examples, but additional namespaces may also be available.
- If the task is purely local, prefer local tools and do not route it through the broker.
```

**Step 2: Verify no other broker-cli references remain in files the plan should touch**

Run: `git grep -n "broker-cli" pi/`
Expected matches are only in paths outside the `mcp-broker` extension directory that describe broker-cli as a **tool the agent should not use via bash** — if any are out of date, fix them in this task. If the only remaining match is inside documentation discussing historical context, that's fine.

Re-read each hit and decide case-by-case. Do not blanket-replace.

**Step 3: Commit**

```bash
git add pi/agent/AGENTS.md
git commit -m "docs(agents): point broker access at mcp_call meta-tools"
```

---

## Task 8: Final verification — typecheck + manual smoke

**Files:** none

**Step 1: Typecheck**

Run: `make typecheck`
Expected: clean. Fix any errors before continuing.

**Step 2: Lint the commit history**

Run: `git log --oneline main..HEAD` (or `git log --oneline -10` if not on a branch)
Expected: one commit per task (7 commits), each with a conventional-commits subject under 50 chars, no stray WIPs.

**Step 3: Manual end-to-end smoke (only if the user has a running broker)**

This step is **manual and interactive** — do not attempt to script it. Only run it if the user has a local or reachable broker and both env vars set. If the user doesn't have a broker handy, stop here, report completion, and flag the smoke as "not run — requires live broker".

With `MCP_BROKER_ENDPOINT` and `MCP_BROKER_AUTH_TOKEN` set, in a fresh Pi session:

1. Verify the system prompt contains the namespace hint. Ask the agent: "what broker namespaces do you see?" It should name the namespaces without calling any tool.
2. Run `mcp_search "git"` and confirm it returns name + description pairs for git-namespace tools.
3. Run `mcp_describe` on a specific git tool (e.g., `git.git_list_remotes`) and confirm you see the JSON schema.
4. Run `mcp_call` on a safe read-only tool (e.g., `git.git_list_remotes` on a local repo path) and confirm a valid result round-trips.
5. Run `mcp_call` on a tool that requires human approval. Confirm the call blocks, then approve it in the dashboard and confirm the call completes successfully.
6. Run `mcp_call` on an approval-gated tool and leave it un-approved for 10+ minutes. Confirm you get the "approval timed out" error, not a silent hang.
7. Try to invoke `gh repo list` via bash. Confirm the guard blocks it and the steer message mentions `mcp_call` and `mcp_search "github"`, not `broker-cli`.
8. Try `git push` via bash. Confirm the guard blocks it and the steer message points at `mcp_call` with git broker tools.
9. Unset `MCP_BROKER_ENDPOINT`, restart Pi, and call `mcp_search`. Confirm the error is "broker endpoint not configured — set MCP_BROKER_ENDPOINT and MCP_BROKER_AUTH_TOKEN" and no stack trace leaks into the agent response.

**Step 4: Report**

Tell the user:

- Which steps of the manual smoke were actually run versus skipped (smoke is skipped entirely if no broker).
- Any unexpected behavior observed.
- The commit range for review.

Do **not** run `make stow-pi` unless the user explicitly asks — this repo manages stow as a deliberate action, not a plan side-effect.

<!-- All documentation files touched by this plan (README.md, AGENTS.md) are updated in Tasks 6 and 7. No further doc tasks needed. -->
