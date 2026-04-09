/**
 * Broker guard for Pi.
 *
 * Nudges the agent toward Broker CLI for authenticated remote operations by:
 * - appending a short Broker CLI reminder to the system prompt each turn
 * - blocking agent bash calls that use `gh` directly
 * - blocking agent bash calls that run remote-oriented git commands such as
 *   `git push`, `git pull`, `git fetch`, `git ls-remote`, and `git remote`
 * - injecting one steering message per turn that tells the agent to retry via
 *   `broker-cli git ...` or `broker-cli github ...`
 *
 * Local-only git commands are still allowed.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type BlockedCommandKind = "github-cli" | "git-remote";

type BlockedCommandMatch = {
  kind: BlockedCommandKind;
  segment: string;
};

const ASSIGNMENT_PREFIX = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*`;
const COMMAND_PREFIX = String.raw`^\s*${ASSIGNMENT_PREFIX}(?:command\s+|builtin\s+)?(?:env\s+${ASSIGNMENT_PREFIX})?(?:\S+/)?`;
const COMMAND_SPLIT_RE = /&&|\|\||;|\n/g;
const BROKER_CLI_RE = new RegExp(`${COMMAND_PREFIX}broker-cli\\b`);
const GH_RE = new RegExp(`${COMMAND_PREFIX}gh\\b`);
const GIT_REMOTE_RE = new RegExp(
  `${COMMAND_PREFIX}git\\s+(push|pull|fetch|ls-remote|remote)\\b`,
);

const BROKER_PROMPT_APPEND = [
  "Broker CLI guidance:",
  "- Use local git commands for local-only repository work.",
  "- Use broker-cli git tools for remote git operations instead of running git push/pull/fetch/ls-remote/remote through bash.",
  "- Use broker-cli github tools instead of the GitHub CLI (gh).",
  "- Discover broker-backed commands with broker-cli --help, broker-cli git --help, and broker-cli github --help before choosing a tool.",
].join("\n");

function splitCommand(command: string) {
  return command
    .split(COMMAND_SPLIT_RE)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function findBlockedCommand(command: string): BlockedCommandMatch | undefined {
  for (const segment of splitCommand(command)) {
    if (BROKER_CLI_RE.test(segment)) continue;
    if (GH_RE.test(segment)) return { kind: "github-cli", segment };
    if (GIT_REMOTE_RE.test(segment)) return { kind: "git-remote", segment };
  }
  return undefined;
}

function getBlockReason(kind: BlockedCommandKind) {
  if (kind === "github-cli") {
    return "Blocked GitHub CLI command. Use broker-cli github tools instead.";
  }
  return "Blocked remote git command. Use broker-cli git tools instead.";
}

function getSteerMessage(match: BlockedCommandMatch, cwd: string) {
  if (match.kind === "github-cli") {
    return [
      "The previous bash command was blocked because GitHub access in this environment should go through Broker CLI, not gh.",
      `Blocked command segment: ${match.segment}`,
      "Inspect the available broker-backed GitHub commands with `broker-cli github --help`, then invoke the matching tool through Broker CLI.",
    ].join("\n\n");
  }

  return [
    "The previous bash command was blocked because remote git operations in this environment should go through Broker CLI, not direct git bash commands.",
    `Blocked command segment: ${match.segment}`,
    "Inspect the available broker-backed git commands with `broker-cli git --help`.",
    `When a git broker tool needs the repository path, use --repo-path '${cwd}'.`,
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
