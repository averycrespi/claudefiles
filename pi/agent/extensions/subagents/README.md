# subagents

Pi extension that exposes a single tool, `spawn_agents`, for delegating work to child Pi processes as focused subagents.

## Public API

Other extensions may import the following from `api.ts`. Anything not listed here is internal and may change without notice.

```ts
import { spawnSubagent, formatSpawnFailure } from "../subagents/api.ts";
import type { SpawnInvocation, SpawnOutcome } from "../subagents/api.ts";
```

- `spawnSubagent(options: SpawnInvocation): Promise<SpawnOutcome>` — low-level child-process spawn used by `spawn_agents` under the hood. Use when you need to run a Pi subagent from extension code without going through the LLM tool interface. Honors `signal` for cancellation.
- `formatSpawnFailure(outcome: SpawnOutcome): string` — canonical error formatter for a failed `SpawnOutcome`. Produces the same error text rendered when an agent within `spawn_agents` fails.
- `SpawnInvocation`, `SpawnOutcome` — input/output types for `spawnSubagent`.

## Tool

### `spawn_agents`

Launch one or more subagents in parallel. Each runs independently in its own context window with a fixed tool set determined by the agent type. Pass a single agent when delegating one task; pass multiple when you have independent tasks that can run concurrently. Results are returned as a combined document once all agents complete.

**Parameters:**

| Parameter         | Type   | Required | Description                                                     |
| ----------------- | ------ | -------- | --------------------------------------------------------------- |
| `agents`          | array  | yes      | List of agents to run concurrently (minimum 1)                  |
| `agents[].agent`  | string | yes      | Agent type: `explore`, `review`, `research`, or `code`          |
| `agents[].intent` | string | yes      | Short label shown in activity titles (3–6 words)                |
| `agents[].prompt` | string | yes      | Full task — brief the agent like a colleague who just walked in |

Agent types are loaded dynamically from `~/.pi/agent/agents/*.md` at startup. The built-in types are defined in `pi/agent/agents/` in this repo and symlinked via `make stow`. Custom agents can be added by dropping additional `.md` files in that directory — no code changes required.

The built-in types:

| Type       | Tools                   | Extensions   | Model        | Thinking |
| ---------- | ----------------------- | ------------ | ------------ | -------- |
| `explore`  | read, ls, find, grep    | —            | gpt-5.4-mini | medium   |
| `review`   | read, ls, find, grep    | —            | gpt-5.4      | high     |
| `research` | read, ls, find, grep    | `web-access` | gpt-5.4      | high     |
| `code`     | read, bash, edit, write | `autoformat` | gpt-5.4      | medium   |

`explore`, `review`, and `research` are read-only. `research` adds web search and fetch via the `web-access` extension. `code` has full write access including shell.

**Returns** a single document with each agent's result under a `## <type> · <intent>` heading, separated by `---`. On failure, the agent's section contains a formatted error including exit code and stderr.

## UI behavior

While running, `spawn_agents` shows each agent as a section separated by blank lines, with recent tool events and a running status line:

```
 **Explore agent** Find auth flows
 - read: src/auth.ts
 Running: 4 tool uses (14s)

 **Code agent** Run tests
 Done: 5 tool uses · 20.3k tokens · 20s

 **Review agent** Check config
 - bash: npm test
 Running: 1 tool use (3s)
```

The tool-call line itself is intentionally suppressed — its content would just repeat the intents already shown in each agent's block. Each agent shows its type, intent, recent tool events, and a Running/Done status line. On failure, the agent's section displays an error line and a path to the persisted log file.

Activity widgets are removed when all subagents finish, error, or are aborted.

## System prompt injection

When loaded, the extension hooks `before_agent_start` to append delegation guidance to the system prompt — when to delegate, the shape of `spawn_agents` (single call covers both single-task and parallel-task cases), and the list of available agent types with their descriptions. This means the guidance only appears when the extension is actually active; it is not hardcoded in `AGENTS.md`.

## How it works

Each spawn:

1. Looks up the agent type config (tools, model, thinking level, system prompt)
2. Resolves extension short names (e.g. `web-access`) to concrete paths — searched in order: `.pi/extensions/`, `~/.pi/agent/extensions/`, and any roots listed in `settings.json`
3. Launches `pi --mode json -p --no-session` as a child process with the resolved tool allowlist and extension paths
4. Streams JSONL events from the child process to track phase, active tool, and current command
5. Returns the child's final assistant message, or a formatted failure message on non-zero exit

Recursion is blocked by default. Each spawn sets `PI_SUBAGENT_DEPTH` in the child environment (`currentDepth + 1`). The `spawn_agents` tool calls `spawnSubagent` without specifying `maxDepth`, which defaults to `1` — so a subagent (running at depth 1) cannot spawn another subagent. The `MAX_SUBAGENT_DEPTH = 5` constant in `types.ts` is an absolute ceiling, reachable only by direct callers of the programmatic `spawnSubagent` API that explicitly pass a higher `maxDepth`. Aborting the parent tool call sends SIGTERM to child processes with a 2-second grace period before SIGKILL.

## Notes

- `intent` is required for every agent and drives activity titles — keep it short and descriptive
- Each subagent starts with a fresh context; session inheritance is not supported
- `research` requires the `web-access` extension to be installed and discoverable by the name `web-access`
- `code` skills and prompt templates are enabled; all other agent types disable them
- All agents in a single `spawn_agents` call run concurrently; result order matches input order

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

- `index.ts` — tool registration and execution orchestration
- `render.ts` — TUI rendering and rendering-adjacent formatters
- `api.ts` — public surface re-exported for other extensions (see **Public API** above)
- `loader.ts` — agent discovery and frontmatter parsing
- `spawn.ts` — child process spawning, CLI argument construction, and result handling
- `activity.ts` — live activity tracking and UI widget updates
- `types.ts` — interfaces, schemas, and shared types
- `utils.ts` — extension path resolution
