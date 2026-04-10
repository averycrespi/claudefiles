/**
 * Compact tools extension for Pi.
 *
 * Overrides the built-in `read` and `bash` tool renderers so the TUI shows
 * compact labels and summaries instead of full tool output. Tool execution
 * behavior is unchanged — only rendering is compacted.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerBash from "./bash.js";
import registerRead from "./read.js";

export default function (pi: ExtensionAPI) {
  registerRead(pi);
  registerBash(pi);
}
