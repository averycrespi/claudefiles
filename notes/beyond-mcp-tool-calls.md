# Beyond MCP Tool Calls

## The tool-count cliff

MCP solved a real problem: a standard protocol for servers to expose capabilities to LLM agents. The naive default — "list every server's tools in the system prompt, let the agent pick" — does not survive contact with production. Adding tools makes models worse.

The numbers are on the record. Writer's [RAG-MCP benchmark](https://writer.com/engineering/rag-mcp/) shows tool-selection accuracy dropping from 43% to under 14% as the menu grows. Speakeasy's Pet Store experiment, [written up by PromptForward](https://promptforward.dev/blog/mcp-overload), runs the knob cleanly: 10 tools is perfect, 107 tools fails entirely. GitHub Copilot cut 40 tools to 13 for a 2–5pp accuracy gain and a 400ms latency win. Anthropic's own [Tool Search](https://www.anthropic.com/engineering/advanced-tool-use) measurement is the strongest primary source: Opus 4 went from 49% to 74%, Opus 4.5 from 79.5% to 88.1%, when descriptions were deferred instead of loaded upfront. This isn't a nitpick — it's a capability cliff.

## Deferred loading is a partial fix

The first-order response is to stop loading every tool's schema upfront: load names only, fetch descriptions on demand via a tool-search tool. Anthropic's Tool Search, Smithery's Toolbox, voicetreelab/lazy-mcp — same pattern. I ship this myself. [`mcp-broker`](https://github.com/averycrespi/agent-tools) is a policy-and-credential-holding proxy — the [permissions argument](./moving-permissions-out-of-the-harness.md) is its primary purpose — that also participates in tool search.
It helps. It doesn't close the case. Three residual problems stay visible once you use it on real workflows:

1. **Responses are still verbose.** Deferred schemas don't save you from a 50KB JSON blob coming back from `list_issues`. Context inflates on _use_, not just on advertisement.
2. **Nothing composes.** `list_issues → filter → get_comments → extract assignee → summarize` is five tool calls, and every intermediate result flows through the model's context before the next call starts.
3. **Wrong-tool overhead.** Tool search returns fuzzy-matched candidates. Miss once and you pay an extra round-trip to discover it.

Armin Ronacher has [the clearest writeup](https://lucumr.pocoo.org/2025/12/13/skills-vs-mcp/) on why deferred loading isn't enough: each call still round-trips, and multi-step workflows compose badly. My own takeaway after building the broker was that the next step isn't a better tool-search index — it's a different shape entirely.

## The shift: MCP as a library, not a menu

The direction the industry is converging on — in published writeups and in shipping products — is to expose MCP capabilities _as code_ the agent writes against, not _as tools_ the agent picks from.

- **Anthropic, [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)**: MCP servers become filesystem-discoverable TypeScript modules. The agent writes a script that imports the wrappers it needs, runs in a sandbox, and returns distilled results. A reported **98.7% token reduction** (150K → 2K) on a worked example.
- **Cloudflare, [Code Mode](https://blog.cloudflare.com/code-mode-mcp/)**: the entire 2,500-endpoint Cloudflare API exposed through two tools (`search()` + `execute()`), ~1,000 tokens total. A **99.9% reduction** vs. naive MCP (1.17M tokens). Code runs in V8 isolates with capability-style bindings for outbound access.
- **Claude Code v2.1.108**: Anthropic quietly shipped a REPL tool into Claude Code itself. It was revealed via [Piebald's extraction of the compiled system prompts](https://github.com/Piebald-AI/claude-code-system-prompts/releases/tag/v2.1.108), not an announcement. The prompt instructs the model: _"REPL is your only way to investigate — shell, file reads, and code search all happen here."_ And: _"Aim for 1-3 REPL calls per turn — over-fetch and batch."_ "Over-fetch and batch" is the code-mode thesis in five words.

The mechanical difference is the whole argument. Tool-call MCP is: model → pick tool → JSON → round-trip per step. Code-mode MCP is: model → write script → sandbox runs loops, filters, and composition → small distilled result. The first is a menu. The second is a library.

## The steelman

Code mode isn't free:

- **Sandboxing is load-bearing.** Anthropic [names this explicitly](https://www.anthropic.com/engineering/code-execution-with-mcp): running agent-generated code requires _"a secure execution environment with appropriate sandboxing, resource limits, and monitoring."_ Cloudflare's V8 isolates are why their numbers look easy; outside that infra you're shipping container isolation. Tool-call MCP needs none of it.
- **New error surfaces.** Tool calls fail one way; generated code fails many (syntax, imports, exceptions, silent wrong-data transforms). Every failure category is model tokens spent recovering.
- **Simple cases don't benefit.** A single-shot Slack message is worse in code mode, not better. The token-reduction numbers come from wide APIs and multi-step workflows; narrow agents with a dozen tools should keep doing what they're doing.
- **Model-capability floor rises.** Classification (pick from list) is something weaker models handle. Generating correct TypeScript against a typed SDK is not. Code mode raises the minimum viable model.

The honest framing: code mode isn't replacing tool-call MCP across the board. It's replacing it for the shape of problem tool-call MCP was never good at — many tools, large responses, multi-step composition. For that shape, the gap is large enough that the paradigm has already shifted, even if most shipping harnesses haven't caught up.

## References

- [Anthropic — Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) — the canonical "code mode" manifesto from the MCP vendor
- [Cloudflare — Code Mode: give agents an entire API in 1,000 tokens](https://blog.cloudflare.com/code-mode-mcp/) — the sharpest numbers, the server-side pattern
- [Piebald-AI/claude-code-system-prompts v2.1.108](https://github.com/Piebald-AI/claude-code-system-prompts/releases/tag/v2.1.108) — Claude Code's REPL tool surfaced via prompt extraction
- [Armin Ronacher — Skills vs Dynamic MCP Loadouts](https://lucumr.pocoo.org/2025/12/13/skills-vs-mcp/) — why deferred tool loading isn't enough
- [Anthropic — Advanced tool use / Tool Search](https://www.anthropic.com/engineering/advanced-tool-use) — Anthropic's own measurement of tool-count cost
- [Writer — When too many tools become too much context (RAG-MCP)](https://writer.com/engineering/rag-mcp/) — 43% → <14% selection accuracy
- [PromptForward — The MCP Overload Problem](https://promptforward.dev/blog/mcp-overload) — controlled Pet Store benchmark
- [`moving-permissions-out-of-the-harness.md`](./moving-permissions-out-of-the-harness.md) — the other half of what mcp-broker does
