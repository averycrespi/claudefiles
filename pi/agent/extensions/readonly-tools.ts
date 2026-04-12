/**
 * Enables optional built-in tools (ls, find, grep) so they're available
 * to the agent without needing bash. This is a standalone extension so
 * subagents can load it independently of compact-tools.
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
