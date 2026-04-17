/**
 * Archived — no longer loaded in the main agent.
 *
 * Why disabled: the main agent already has bash, which can do everything
 * ls/find/grep do. Adding redundant tools degrades agent performance
 * (more tools = worse tool selection), so we removed this extension
 * from the main agent's load path.
 *
 * Subagents that lack bash (e.g. review, research, explore) still list
 * ls/find/grep in their frontmatter and receive them via the --tools
 * CLI flag when spawned — they don't need this extension.
 *
 * Kept here for reference in case it's useful again.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const OPTIONAL_TOOLS = ["ls", "find", "grep"];

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    const active = pi.getActiveTools();
    const missing = OPTIONAL_TOOLS.filter((t) => !active.includes(t));
    if (missing.length > 0) {
      pi.setActiveTools([...active, ...missing]);
    }
  });
}
