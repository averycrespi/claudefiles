/**
 * Broker guard for Pi.
 *
 * Nudges the agent toward MCP broker meta-tools for authenticated remote
 * operations by:
 * - appending a short broker guidance reminder to the system prompt each turn
 * - blocking agent bash calls that use `gh` directly
 * - blocking agent bash calls that run remote-oriented git commands such as
 *   `git push`, `git pull`, `git fetch`, `git ls-remote`, and `git remote`
 * - injecting one steering message per turn that tells the agent to retry via
 *   `mcp_call` with the appropriate broker tool
 *
 * Local-only git commands are still allowed.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export type BlockedCommandKind = "github-cli" | "git-remote";

export type BlockedCommandMatch = {
  kind: BlockedCommandKind;
  segment: string;
};

const ASSIGNMENT_PREFIX = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*`;
const COMMAND_PREFIX = String.raw`^\s*${ASSIGNMENT_PREFIX}(?:command\s+|builtin\s+)?(?:env\s+${ASSIGNMENT_PREFIX})?(?:\S+/)?`;
const COMMAND_SPLIT_RE = /&&|\|\||;|\n/g;
const GH_RE = new RegExp(`${COMMAND_PREFIX}gh\\b`);
const GIT_REMOTE_RE = new RegExp(
  `${COMMAND_PREFIX}git\\s+(push|pull|fetch|ls-remote|remote)\\b`,
);

const BROKER_PROMPT_APPEND = [
  "Broker guidance:",
  "- Use local git commands for local-only repository work.",
  "- Use mcp_call with the broker's git tools for remote git operations (push/pull/fetch/ls-remote/remote) instead of running them through bash.",
  "- Use mcp_call with the broker's github tools instead of the GitHub CLI (gh).",
  "- Discover available broker tools with mcp_search; inspect a tool's schema with mcp_describe before calling it.",
].join("\n");

export function splitCommand(command: string) {
  return command
    .split(COMMAND_SPLIT_RE)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function findBlockedCommand(
  command: string,
): BlockedCommandMatch | undefined {
  for (const segment of splitCommand(command)) {
    if (GH_RE.test(segment)) return { kind: "github-cli", segment };
    if (GIT_REMOTE_RE.test(segment)) return { kind: "git-remote", segment };
  }
  return undefined;
}

export function getBlockReason(kind: BlockedCommandKind) {
  if (kind === "github-cli") {
    return "Blocked GitHub CLI command. Use mcp_call with broker github tools instead.";
  }
  return "Blocked remote git command. Use mcp_call with broker git tools instead.";
}

export function getSteerMessage(match: BlockedCommandMatch, _cwd: string) {
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

export default function (pi: ExtensionAPI) {
  let queuedSteerForTurn = false;

  pi.on("turn_start", async () => {
    queuedSteerForTurn = false;
  });

  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n${BROKER_PROMPT_APPEND}`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const command = event.input.command as string | undefined;
    if (!command) return undefined;

    const blockedCommand = findBlockedCommand(command);
    if (!blockedCommand) return undefined;

    if (!queuedSteerForTurn) {
      pi.sendMessage(
        {
          customType: "broker-guard",
          content: getSteerMessage(blockedCommand, ctx.cwd),
          display: false,
          details: {
            kind: blockedCommand.kind,
            command: blockedCommand.segment,
          },
        },
        { deliverAs: "steer" },
      );
      queuedSteerForTurn = true;
    }

    if (ctx.hasUI) {
      ctx.ui.notify(getBlockReason(blockedCommand.kind), "warning");
    }

    return {
      block: true,
      reason: getBlockReason(blockedCommand.kind),
    };
  });
}
