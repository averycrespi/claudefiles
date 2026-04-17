/**
 * Compact tools extension for Pi.
 *
 * Overrides built-in tool renderers so the TUI shows compact labels and
 * summaries instead of full tool output. Tool execution behavior is
 * unchanged — only rendering is compacted.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerBash from "./bash.ts";
import registerFind from "./find.ts";
import registerGrep from "./grep.ts";
import registerLs from "./ls.ts";
import registerRead from "./read.ts";

export default function (pi: ExtensionAPI) {
  registerRead(pi);
  registerBash(pi);
  registerLs(pi);
  registerFind(pi);
  registerGrep(pi);
}
