---
name: broker-cli
description: Use when local tools are insufficient and a task needs broker-backed or authenticated external access through broker-cli. Discover namespaces and tools at runtime, then invoke them safely from bash.
---

# Broker CLI

## Use when

- The task needs broker-backed or authenticated access to an external system.
- The task requires a broker tool that is not exposed as a first-class agent tool.
- You need to inspect the broker catalog at runtime before choosing a command.

## Do not use when

- Local files, local git, or local shell commands are sufficient.
- The task does not need authenticated or broker-backed access.
- You can complete the work with existing built-in tools.

## Inputs / assumptions

- `broker-cli` is available through `bash`.
- The broker catalog is dynamic. Do not assume a namespace, tool, or flag exists until discovery confirms it.
- Pass absolute paths when a broker tool expects a filesystem path.

## Workflow

1. Discover available namespaces.

```bash
broker-cli --help
```

2. Discover tools within the chosen namespace.

```bash
broker-cli <namespace> --help
```

3. Inspect the selected tool's flags before invoking it.

```bash
broker-cli <namespace> <tool> --help
```

4. Invoke the tool from `bash`.

- Use normal flags for simple scalar inputs.
- Use `--raw-input` for a full JSON object when many fields are structured.
- Use `--raw-field 'key=value'` when only a few fields need raw JSON.
- Prefer single-quoted JSON in shell commands.

5. Parse the result instead of relying only on the exit code.

- Successful calls write an MCP-style content payload to stdout.
- The useful result is usually inside a returned `text` field.
- That `text` may itself be JSON, markdown, or plain text.
- CLI validation failures are reported on stderr with a non-zero exit code.
- A broker tool may still return an error as normal text content, so inspect the payload before reporting success.

6. Report the result clearly.

- Name the exact command run.
- Summarize the extracted payload, not the transport wrapper, unless the wrapper matters.
- If discovery with `--help` informed the invocation, say so.
- Distinguish stderr failures from tool-level errors returned as normal text.

## Verification

- Confirm the selected namespace and tool exist via `--help` before invoking them.
- Inspect stdout and stderr before declaring success.
- If the response includes structured data inside `text`, parse that content before summarizing it.

## Output

- The exact broker command run.
- A concise summary of the extracted result.
- Any relevant discovery steps or failure mode details.

## Ask user when

- Discovery shows multiple plausible namespaces or tools with materially different effects.
- The broker result is ambiguous and cannot be safely interpreted.
- The action would be externally visible or otherwise requires confirmation under repo policy.

## Troubleshooting

- If discovery output looks stale, retry with `--no-cache`.
- If stderr reports validation or configuration errors, surface that error directly instead of adding a separate preflight check.
- Do not invent simplified tool names; exported names may be things like `git-list-remotes` rather than `list-remotes`.
- If the user only needs local work, stop using the broker and switch back to local tools.

## Default example

```bash
broker-cli --help
broker-cli git --help
broker-cli git git-list-remotes --help
broker-cli git git-list-remotes --repo-path '/absolute/path/to/repo'
```
