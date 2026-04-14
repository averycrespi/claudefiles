# Moving Permissions Out of the Harness

## The problem

Most coding agents (Claude Code, Cursor, Cline) gate dangerous actions with an in-harness permission system: an allowlist of bash commands, an auto-accept mode, a plan-only mode. You maintain the list; the agent asks when it wants to do something not on it; you say yes or no.

This doesn't work, and I don't think it can be made to work.

## Why allowlists are the wrong abstraction

**You can't decide whether a command is safe by looking at it.** `find` has `-exec`. `grep` can be coerced into writing files. `git` has hooks and `core.sshCommand`. `npm install` runs arbitrary code. You cannot resolve safety from the command string alone — the property is contextual and, in the general case, undecidable (this is basically Rice's theorem applied to agent actions).

**Prompt injection collapses the trust model.** Simon Willison's ["lethal trifecta"](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/): private data + untrusted content + external communication = exploitable. An allowlist treats the agent as trusted to select safe commands. The agent isn't trusted, because its context isn't trusted.

**Edge cases compound into permission fatigue.** Every near-miss (`git log --all` vs `git log`, `rm foo.tmp` vs `rm -rf`) produces a prompt. You either tighten the list and get blocked constantly, or loosen it and stop reading the prompts. Both failure modes end in rubber-stamping.

**Claude Code's new [auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode) is an implicit concession.** It replaces `--dangerously-skip-permissions` with OS-level sandboxing precisely because the old allowlist approach wasn't load-bearing. The fix isn't a better list; it's a different architecture.

## The thesis

**Put permissions outside the agent's reachable environment.** The agent runs in a sandbox that cannot do damage on its own. Any action with real-world consequences — network egress, credentialed API calls, writes outside the sandbox — goes through a broker that lives on the host, holds the actual credentials, and gates on a human-approval rule set the agent cannot see or modify.

The agent's own honesty stops being part of the security model. It's incapable of taking the dangerous action directly; all it can do is request one. This is capability confinement in the classical sense — permissions as unforgeable tokens held by the environment, not strings the agent can name.

Matt Kotsenas puts it well in ["Sandboxing the Eager Deputy"](https://matt.kotsenas.com/posts/sandboxing-the-eager-deputy/): _"If the asset exists inside the agent's execution boundary, it can be exfiltrated."_ The only coherent fix is to put the asset outside the boundary.

## Caveats

- The sandbox needs to be genuinely destructible. `rm -rf` inside it should be a non-event — if losing the sandbox state costs you real work, the boundary is in the wrong place.
- The broker is itself a trusted component. Credentials still live somewhere, and if that somewhere is compromised the scheme falls. Defense in depth, not defense in one place.
- Approval prompts still fatigue if the rules are too loose. Reserving approval for business-consequence actions (push, publish, rotate) is a tuning problem, not a design one.

My own implementation of this lives in [`mcp-broker`](https://github.com/averycrespi/agent-tools) — a local MCP reverse proxy in front of a Lima-VM'd agent. Out of scope for this note; linked for reference.

## References

- [Anthropic — Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [Simon Willison — The lethal trifecta for AI agents](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
- [Matt Kotsenas — Sandboxing the Eager Deputy](https://matt.kotsenas.com/posts/sandboxing-the-eager-deputy/)
- [Norm Hardy — The Confused Deputy (1988)](https://cap-lore.com/CapTheory/ConfusedDeputy.html) — capability-security origin
- [`mcp-broker`](https://github.com/averycrespi/agent-tools) — my implementation
