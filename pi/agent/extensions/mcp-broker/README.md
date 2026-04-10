# mcp-broker

Pi extension that bundles the broker-cli skill and a guard that steers the agent toward Broker CLI for authenticated remote operations.

## What it does

- **Skill registration** — dynamically adds the `broker-cli` skill via the `resources_discover` event, so enabling this extension is all that's needed.
- **Guard** — blocks direct `gh` and remote git commands (`push`, `pull`, `fetch`, `ls-remote`, `remote`) in bash, steering the agent to use `broker-cli` equivalents instead. Local git commands are unaffected.

## Guard behavior

When a blocked command is detected:

1. The bash call is blocked with a short reason.
2. A steering message tells the agent which `broker-cli` subcommand to use instead.
3. A UI notification is shown (one per turn to avoid spam).

The guard also appends a Broker CLI reminder to the system prompt on each turn.

## File layout

- `index.ts` — entry point, skill path registration, and guard init
- `guard.ts` — command detection, blocking, and steering logic
- `skills/broker-cli/SKILL.md` — the broker-cli skill definition
