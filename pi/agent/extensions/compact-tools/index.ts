/**
 * Compact tools extension for Pi.
 *
 * Overrides built-in tool renderers so the TUI shows compact labels and
 * summaries instead of full tool output. Tool execution behavior is
 * unchanged — only rendering is compacted.
 *
 * Note: the optional ls/find/grep tools must be enabled separately via
 * the `readonly-tools` extension. This extension only provides compact
 * rendering for them.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerBash from "./bash.js";
import registerFind from "./find.js";
import registerGrep from "./grep.js";
import registerLs from "./ls.js";
import registerRead from "./read.js";

export default function (pi: ExtensionAPI) {
  registerRead(pi);
  registerBash(pi);
  registerLs(pi);
  registerFind(pi);
  registerGrep(pi);
}
