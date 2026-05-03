# Credential Brokers vs Capability Brokers

## The thesis

Agents should not have direct access to reusable credentials. That part is no longer subtle. A coding agent with an API key in its environment, shell history, logs, memory, or prompt context is one prompt injection away from turning that key into someone else's key.

The unsettled part is what replaces it. Two patterns are emerging: **credential brokers**, which keep secrets outside the agent and inject or mint them at the edge, and **capability brokers**, which hide the underlying credentials entirely and expose narrower actions the agent can request. Neither wins outright. Credential brokers are easier to adopt and work with existing tools. Capability brokers constrain authority more deeply, but require more design.

The convention that seems durable is not a product category. It is a boundary: credentials live outside the agent's reachable environment, and privileged actions cross a broker that can enforce policy, audit usage, and ask a human when intent is ambiguous.

## Why direct credentials fail

Traditional software got away with ambient credentials because the program was supposed to be deterministic. Put `STRIPE_KEY` in the environment, write code carefully, rotate the key occasionally, and hope no bug prints it. This was never ideal, but the trust model was at least understandable: the program was written by humans and did what the code said.

Agents break that model. They ingest untrusted text, follow natural-language instructions, call tools, write files, and make network requests. Simon Willison's [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) is the core failure mode: private data, untrusted content, and external communication. Add a credential and the agent can be tricked into using legitimate authority for an attacker. Norm Hardy called the older version the [confused deputy problem](https://cap-lore.com/CapTheory/ConfusedDeputy.html). The deputy is now enthusiastic, non-deterministic, and very good at APIs.

The first rule is therefore simple: if the asset exists inside the agent boundary, it can be exfiltrated. Matt Kotsenas says this directly in [Sandboxing the Eager Deputy](https://matt.kotsenas.com/posts/sandboxing-the-eager-deputy/). Telling the agent not to leak secrets is not a security boundary. Removing the secrets from the agent's world is.

## Credential brokers

A credential broker stores, mints, or injects credentials without handing the raw secret to the agent. The agent still performs the underlying operation — usually an HTTP request or CLI invocation — but the secret appears only at the broker boundary.

The simplest version is an HTTP proxy that injects headers. [exe.dev's post](https://blog.exe.dev/http-proxy-secrets) lays out the pattern cleanly: instead of giving the agent a Stripe key, route `https://stripe.int.example.com` through a proxy that adds the real Stripe auth header. [Infisical Agent Vault](https://github.com/Infisical/agent-vault) and [OneCLI](https://www.onecli.sh/blog/credential-vault-ai-agent-security) generalize the same idea: run the agent with `HTTPS_PROXY`, match outbound requests by host/path, inject credentials, log usage, and keep the key out of model-visible state.

This is immediately useful. It works with existing agents, existing SDKs, existing REST APIs, and existing CLI tools that speak HTTP. The agent can still `curl`, run a test suite, use a vendor SDK, or call a service normally. For local coding agents, that compatibility matters. For enterprise systems, the same pattern connects naturally to Vault, OAuth token exchange, short-lived credentials, and user attribution.

But the risk profile is sharper than the marketing sometimes implies. Credential brokers prevent credential theft; they do not automatically prevent credential misuse. If the agent has authenticated HTTP access to Stripe, it may not be able to leak the Stripe key, but it can still make a bad Stripe request. Host/path rules help. OpenAPI-aware routing helps more. Rate limits help. But the basic shape is still network-shaped authority: the agent can ask the broker to authenticate requests inside an allowed envelope.

## Capability brokers

A capability broker exposes actions rather than credentials. The agent does not make arbitrary authenticated GitHub requests. It calls `list_prs`, `comment_pr`, `create_ticket`, `fetch_run_logs`, or `send_email`, each with a schema, policy, audit trail, and sometimes an approval gate. The broker holds the credentials and decides whether a requested action is allowed.

This is the pattern in [`mcp-broker`](https://github.com/averycrespi/agent-tools). The agent can search for available brokered tools, inspect schemas, and call the selected capability. It never receives the GitHub token or Jira token. More importantly, it does not receive general-purpose API authority when a narrower verb would do.

Enterprise MCP gateways are converging on the same shape at organizational scale. [TrueFoundry MCP Gateway](https://www.truefoundry.com/docs/ai-gateway/mcp/mcp-overview) centralizes MCP servers, OAuth, token storage, RBAC, guardrails, approval workflows, and audit. [agentgateway](https://agentgateway.dev/docs/standalone/main/about/introduction/) frames itself as a gateway for MCP, A2A, LLM, HTTP, and gRPC traffic with auth, policy, observability, and tool federation. [Ping Agent Gateway](https://www.pingidentity.com/en/product/agent-gateway.html) emphasizes runtime access control for each MCP action, backed by OAuth tokens and delegated least privilege.

The advantage is semantic control. A broker can distinguish read from write, repo A from repo B, issue comments from branch deletion, and dry-run from publish. It can render a human-readable approval prompt for dangerous actions. It can redact or summarize tool results before returning them to the model. It can refuse an action because the argument is wrong, not merely because the destination host is wrong.

The cost is that someone has to design the capabilities. A raw HTTP proxy inherits the vendor API surface for free. A capability broker needs schemas, descriptions, policy mapping, output shaping, and maintenance as upstream APIs change. Bad capability design can be worse than a proxy: too many tools overload the model; too-broad tools recreate ambient authority under a nicer name; too-narrow tools make the agent useless.

## Human approval is part of the boundary

Some actions are not intrinsically safe or dangerous. `gh pr comment` might be harmless on a draft PR and damaging on a public incident thread. Sending an email, creating a Jira ticket, rotating a key, publishing a package, deleting a cloud resource — the safety depends on context, target, content, timing, and user intent.

That is where brokers need human approval. Not as a permission prompt for every command, and not as a rubber-stamp loop inside the harness. Approval belongs at the broker boundary, where the system can show the user the actual action, the target resource, the credential or capability being exercised, and the consequence. The agent should be able to request the action. The broker should decide whether policy allows it automatically, denies it automatically, or pauses for a human.

The hard part is presentation. A good approval prompt is not `Allow tool call?`. It is: "Comment on PR #123 in `example/repo` as you, visible to the public, with this exact body." For HTTP credential brokers, this is harder because the broker sees requests, not always intent. For capability brokers, it is easier because the action is already semantic.

## Local and enterprise versions

The local version optimizes for compatibility and speed. A developer runs Claude Code, Codex, OpenCode, or Pi inside a sandbox, routes traffic through Agent Vault or OneCLI, and uses a broker for higher-level actions like GitHub or Jira. The key question is: what can the agent reach from this machine, and what secrets can it ever observe?

The enterprise version optimizes for consistency and governance. Agents connect to one MCP gateway or agent gateway. The gateway authenticates the user or workload, maps policy, stores or exchanges tokens, filters tool discovery, logs requests, and applies guardrails. The key question is: can the organization prove which agent, acting for which user, invoked which capability on which resource, under which policy?

These are the same architecture at different scales. Local tools make the boundary ergonomic for one developer. Enterprise gateways make it legible to security teams.

## Code mode and sandboxed capabilities

Code-mode MCP complicates the taxonomy. Anthropic's [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) and Cloudflare's [Code Mode](https://blog.cloudflare.com/code-mode-mcp/) move capabilities out of individual tool calls and into sandboxed libraries or bindings the agent writes code against. Instead of choosing from hundreds of tools, the agent writes a small script that imports a typed API wrapper, loops, filters, and returns a distilled result.

This can be a better capability surface for large APIs. The broker still holds the credentials, but the agent gets a programmable binding rather than a menu of JSON tools. That reduces context overhead and makes multi-step composition cheaper.

The security requirement gets stricter, not weaker. Generated code must run in a sandbox with bounded network, filesystem, time, memory, and credential access. Otherwise code mode is just a more expressive way to misuse authority. The same question applies: does the agent receive a reusable secret, or only a bounded capability enforced outside its control?

## The tradeoff

Credential brokers are the pragmatic layer. They are easy to adopt, transparent to existing software, and immediately eliminate the dumbest failure mode: secrets sitting in the agent's environment. If you are currently pasting API keys into coding agents, a proxy vault is an obvious improvement.

Capability brokers are the stronger security model. They reduce not only secret exposure but ambient authority. They make approval, auditing, output minimization, and resource-scoped policy more natural. They are also more expensive to build and easier to get wrong.

The emerging stack probably uses both. Credential brokers handle broad compatibility and legacy APIs. Capability brokers handle consequential workflows where semantics matter. Sandboxes enforce that traffic actually goes through the broker. Human approvals handle the cases policy cannot classify safely.

## Caveats

Brokers are not magic. They move the trust boundary; they do not remove it. A compromised broker is now a high-value target. A misconfigured proxy can become an authenticated exfiltration channel. A semantic tool with broad arguments can smuggle the same authority it was supposed to remove.

Identity is necessary but insufficient. Knowing the user, agent, session, or workload does not answer whether this particular action should happen. Authorization has to bind identity to action, resource, time, and intent.

Audit logs are not prevention. They help after something goes wrong, and they make governance possible, but they do not save you from a bad write that already happened. For high-consequence actions, the broker needs pre-execution policy and approval, not just observability.

The patterns are still young. MCP's own security guidance calls out confused deputy risks, token passthrough, SSRF, consent handling, and authorization gotchas. The ecosystem is converging on brokers and gateways because the old `.env` model is indefensible for agents, not because the new model is finished.

## References

- [exe.dev — HTTP proxy secrets](https://blog.exe.dev/http-proxy-secrets) — clear articulation of header-injecting HTTP proxies for agent secrets
- [Infisical Agent Vault](https://github.com/Infisical/agent-vault) — open-source HTTP credential proxy and vault for AI agents
- [OneCLI — What a Credential Vault Can and Can't Do for AI Agent Security](https://www.onecli.sh/blog/credential-vault-ai-agent-security) — honest breakdown of credential proxy protections and limitations
- [TrueFoundry MCP Gateway](https://www.truefoundry.com/docs/ai-gateway/mcp/mcp-overview) — enterprise MCP gateway with registry, OAuth, RBAC, guardrails, approval, and audit
- [agentgateway](https://agentgateway.dev/docs/standalone/main/about/introduction/) — open-source gateway for MCP, A2A, LLM, HTTP, and gRPC traffic
- [Ping Identity — Agent Gateway](https://www.pingidentity.com/en/product/agent-gateway.html) — runtime access enforcement for MCP actions
- [Auth0 — Handling Third-Party Access Tokens Securely in AI Agents](https://auth0.com/blog/third-party-access-tokens-secure-ai-agents/) — user-bound token vault framing and confused-deputy risks
- [HashiCorp — Secure AI agent authentication using Vault dynamic secrets](https://developer.hashicorp.com/validated-patterns/vault/ai-agent-identity-with-hashicorp-vault) — dynamic secrets, OAuth token exchange, and user attribution pattern
- [MCP — Security Best Practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices) — confused deputy, token passthrough, SSRF, and MCP authorization concerns
- [Simon Willison — The lethal trifecta for AI agents](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) — private data + untrusted content + external communication
- [Matt Kotsenas — Sandboxing the Eager Deputy](https://matt.kotsenas.com/posts/sandboxing-the-eager-deputy/) — sandbox boundary and secret-injection argument
- [Norm Hardy — The Confused Deputy](https://cap-lore.com/CapTheory/ConfusedDeputy.html) — original capability-security framing
- [Anthropic — Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) — code-mode capabilities through sandboxed MCP libraries
- [Cloudflare — Code Mode MCP](https://blog.cloudflare.com/code-mode-mcp/) — large API surfaces exposed through sandboxed code bindings
- [`moving-permissions-out-of-the-harness.md`](./moving-permissions-out-of-the-harness.md) — related argument for moving authority outside the agent harness
