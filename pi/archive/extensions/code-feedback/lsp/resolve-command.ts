/**
 * Resolves an LSP server command against per-project local bin directories
 * before falling back to `$PATH`.
 *
 * Rationale: tools like `typescript-language-server` are commonly installed
 * as a dev dependency alongside a specific `typescript` version. A global
 * install can disagree with the repo's pinned compiler, producing
 * diagnostics that don't match what `tsc` in the repo would say. Preferring
 * `node_modules/.bin/typescript-language-server` — and, transitively, the
 * matching `typescript` package — keeps LSP feedback consistent with the
 * project's own toolchain.
 *
 * Only runs for servers that opt in via `ServerConfig.localBin`. Servers
 * without that marker (e.g. `gopls`, which is installed into `$GOPATH/bin`
 * and not into any node_modules tree) are returned unchanged and spawn
 * resolution falls through to `$PATH`.
 */

import { access, constants as fsConstants } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { ServerConfig } from "./servers.js";

/**
 * Returns an absolute path to a workspace-local copy of `config.command`
 * if one exists, or `null` if the caller should fall through to `$PATH`.
 *
 * `rootDir` is the workspace root computed by `LspManager.resolveRoot`.
 * We walk upward from there so monorepos with hoisted dependencies
 * (`node_modules/` at the monorepo top-level while packages live in
 * `packages/foo`) still find their local bins. The walk stops at the
 * filesystem root.
 */
export async function resolveLocalBin(
  config: ServerConfig,
  rootDir: string,
): Promise<string | null> {
  if (!config.localBin) return null;
  if (config.localBin === "node") {
    return findNodeModulesBin(config.command, rootDir);
  }
  return null;
}

async function findNodeModulesBin(
  command: string,
  fromDir: string,
): Promise<string | null> {
  let dir = resolve(fromDir);
  const fsRoot = resolve("/");
  while (true) {
    const candidate = join(dir, "node_modules", ".bin", command);
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // not here, keep walking up
    }
    if (dir === fsRoot) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
