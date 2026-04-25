# subagents

Pi extension that provides tools for delegating work to child Pi processes as focused subagents.

## Public API

Other extensions may import the following from `api.ts`. Anything not listed here is internal and may change without notice.

```ts
import { spawnSubagent, formatSpawnFailure } from "../subagents/api.ts";
import type { SpawnInvocation, SpawnOutcome } from "../subagents/api.ts";
```

- `spawnSubagent(options: SpawnInvocation): Promise<SpawnOutcome>` — low-level child-process spawn that backs `spawn_agent`. Use when you need to run a Pi subagent from extension code without going through the LLM tool interface. Honors `signal` for cancellation.
- `formatSpawnFailure(outcome: SpawnOutcome): string` — canonical error formatter for a failed `SpawnOutcome`. Produces the same error text rendered by the `spawn_agent` tool.
- `SpawnInvocation`, `SpawnOutcome` — input/output types for `spawnSubagent`.

## Tools

### `spawn_agent`

Launch a subagent to handle a task autonomously. The subagent runs in its own context window with a fixed tool set determined by the agent type.

**Parameters:**

| Parameter       | Type    | Required | Description                                                     |
| --------------- | ------- | -------- | --------------------------------------------------------------- |
| `agent`         | string  | yes      | Agent type: `explore`, `review`, `research`, or `code`          |
| `intent`        | string  | yes      | Short label shown in activity titles (3–6 words)                |
| `prompt`        | string  | yes      | Full task — brief the agent like a colleague who just walked in |
| `show_activity` | boolean | no       | Show live progress updates (default: true)                      |

Agent types are loaded dynamically from `~/.pi/agent/agents/*.md` at startup. The built-in types are defined in `pi/agent/agents/` in this repo and symlinked via `make stow`. Custom agents can be added by dropping additional `.md` files in that directory — no code changes required.

The built-in types:

| Type       | Tools                   | Extensions   | Model        | Thinking |
| ---------- | ----------------------- | ------------ | ------------ | -------- |
| `explore`  | read, ls, find, grep    | —            | gpt-5.4-mini | medium   |
| `review`   | read, ls, find, grep    | —            | gpt-5.4      | high     |
| `research` | read, ls, find, grep    | `web-access` | gpt-5.4      | high     |
| `code`     | read, bash, edit, write | `autoformat` | gpt-5.4      | medium   |

`explore`, `review`, and `research` are read-only. `research` adds web search and fetch via the `web-access` extension. `code` has full write access including shell.

**Returns** the subagent's final assistant message on success, or a formatted error on failure including exit code and stderr.

---

### `spawn_agents`

Launch multiple subagents in parallel. Each runs independently in its own context window. Results are returned as a combined document once all agents complete.

**Parameters:**

| Parameter         | Type   | Required | Description                                    |
| ----------------- | ------ | -------- | ---------------------------------------------- |
| `agents`          | array  | yes      | List of agents to run concurrently (minimum 1) |
| `agents[].agent`  | string | yes      | Agent type (same options as `spawn_agent`)     |
| `agents[].intent` | string | yes      | Short label for this agent                     |
| `agents[].prompt` | string | yes      | Task for this agent                            |

**Returns** a single document with each agent's result under a `## <type> · <intent>` heading, separated by `---`.

## UI behavior

**`spawn_agent`** — while running, shows recent tool events and a running status line:

```
 **Explore agent** Find auth flows
 - read: src/auth/middleware.ts
 Running: 4 tool uses (14s)
```

On completion:

```
 **Explore agent** Find auth flows
 Done: 5 tool uses · 20.3k tokens · 20s
```

On error, the error message is shown inline. Pass `show_activity: false` to suppress live updates.

**`spawn_agents`** — shows each agent as a section separated by blank lines:

```
 **Spawn agents** Find auth flows, Run tests, Check config

 **Explore agent** Find auth flows
 - read: src/auth.ts
 Running: 4 tool uses (14s)

 **Code agent** Run tests
 Done: 5 tool uses · 20.3k tokens · 20s

 **Review agent** Check config
 - bash: npm test
 Running: 1 tool use (3s)
```

Each agent shows its type, intent, recent tool events, and a Running/Done status line. On failure, a header `N of M agents failed` is shown above the agent sections.

Activity widgets are removed when all subagents finish, error, or are aborted.

## System prompt injection

When loaded, the extension hooks `before_agent_start` to append delegation guidance to the system prompt — when to delegate, when to use `spawn_agents` for parallel work, and the list of available agent types with their descriptions. This means the guidance only appears when the extension is actually active; it is not hardcoded in `AGENTS.md`.

## How it works

Each spawn:

1. Looks up the agent type config (tools, model, thinking level, system prompt)
2. Resolves extension short names (e.g. `web-access`) to concrete paths — searched in order: `.pi/extensions/`, `~/.pi/agent/extensions/`, and any roots listed in `settings.json`
3. Launches `pi --mode json -p --no-session` as a child process with the resolved tool allowlist and extension paths
4. Streams JSONL events from the child process to track phase, active tool, and current command
5. Returns the child's final assistant message, or a formatted failure message on non-zero exit

Recursion is blocked by default. Each spawn sets `PI_SUBAGENT_DEPTH` in the child environment (`currentDepth + 1`). The `spawn_agent` and `spawn_agents` tools call `spawnSubagent` without specifying `maxDepth`, which defaults to `1` — so a subagent (running at depth 1) cannot spawn another subagent. The `MAX_SUBAGENT_DEPTH = 5` constant in `types.ts` is an absolute ceiling, reachable only by direct callers of the programmatic `spawnSubagent` API that explicitly pass a higher `maxDepth`. Aborting the parent tool call sends SIGTERM to child processes with a 2-second grace period before SIGKILL.

## Notes

- `intent` is required for every call and drives activity titles — keep it short and descriptive
- Each subagent starts with a fresh context; session inheritance is not supported
- `research` requires the `web-access` extension to be installed and discoverable by the name `web-access`
- `code` skills and prompt templates are enabled; all other agent types disable them
- `spawn_agents` runs all agents concurrently; result order matches input order

## Agent file format

Each agent is a markdown file with YAML frontmatter:

```markdown
---
name: explore
description: Read-only codebase research — finding files and answering questions
tools: read
extensions:
model: openai-codex/gpt-5.4-mini
thinking: medium
disable_skills: true
disable_prompt_templates: true
---

System prompt body...
```

Fields: `name` (defaults to filename without extension), `description` (shown in the tool's agent list), `tools` (comma-separated), `extensions` (comma-separated, empty means none), `model` (inherits parent model if omitted), `thinking` (inherits parent thinking level if omitted), `disable_skills`, `disable_prompt_templates`.

## Inspiration

- [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) — slash commands (`/run`, `/chain`, `/parallel`), an interactive Agents Manager overlay, reusable chain files (`.chain.md`), and background/foreground execution modes
- [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) — parallel execution with configurable concurrency limits, a persistent live widget, mid-run steering, custom agent definitions via markdown, and cross-extension communication through event-based RPC
- Claude Code subagents — the `Agent` tool in the Claude Code CLI, supporting specialized agent types, worktree isolation, and background execution

## File layout

- `index.ts` — tool registrations and execution orchestration
- `api.ts` — public surface re-exported for other extensions (see **Public API** above)
- `loader.ts` — agent discovery and frontmatter parsing
- `spawn.ts` — child process spawning, CLI argument construction, and result handling
- `activity.ts` — live activity tracking and UI widget updates
- `types.ts` — interfaces, schemas, and shared types
- `utils.ts` — extension path resolution
