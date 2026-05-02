/**
 * Compact tools extension for Pi.
 *
 * Overrides built-in tool renderers so the TUI shows compact labels and
 * summaries instead of full tool output. Tool execution behavior is
 * unchanged — only rendering is compacted.
 *
 * Registration is deferred to `session_start` instead of factory time.
 * On initial boot pi calls `_refreshToolRegistry` with
 * `includeAllExtensionTools: true`, which pushes every extension-registered
 * tool into the active set regardless of the user's configuration. After
 * bind, `registerTool` triggers a refresh without that flag, so same-name
 * overrides can exist for tools that may be activated later without
 * force-enabling them at startup.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerBash from "./bash.ts";
import registerFind from "./find.ts";
import registerGrep from "./grep.ts";
import registerLs from "./ls.ts";
import registerRead from "./read.ts";

const overrides: Record<string, (pi: ExtensionAPI) => void> = {
  read: registerRead,
  bash: registerBash,
  ls: registerLs,
  find: registerFind,
  grep: registerGrep,
};

export default function (pi: ExtensionAPI) {
  let registered = false;
  pi.on("session_start", () => {
    if (registered) return;
    registered = true;
    for (const register of Object.values(overrides)) {
      register(pi);
    }
  });
}
