/**
 * MCP Broker extension for Pi.
 *
 * Bundles the broker-cli skill and the broker guard that steers the agent
 * toward Broker CLI for authenticated remote operations.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import initGuard from "./guard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function (pi: ExtensionAPI) {
  pi.on("resources_discover", async () => {
    return { skillPaths: [join(__dirname, "skills")] };
  });

  initGuard(pi);
}
