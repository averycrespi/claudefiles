import { extname } from "node:path";
import { DEFAULT_SERVERS } from "./servers.js";

/**
 * Built once at module load by walking DEFAULT_SERVERS. Maps lowercase
 * extension (with leading dot) to language ID.
 *
 * Last-write-wins for duplicate extensions, but in v1 no two servers claim
 * the same extension — this only matters when DEFAULT_SERVERS grows.
 */
const EXTENSION_TO_LANGUAGE: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [languageId, config] of Object.entries(DEFAULT_SERVERS)) {
    for (const ext of config.extensions) {
      map.set(ext.toLowerCase(), languageId);
    }
  }
  return map;
})();

/**
 * Returns the language ID for a file path, or `null` if no configured
 * server handles its extension.
 */
export function getLanguageIdForFile(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE.get(ext) ?? null;
}

/**
 * LSP `languageId` strings used in `textDocument/didOpen`. Maps internal
 * registry IDs to the canonical LSP language IDs. For TypeScript we have
 * to be more granular than the registry ID — gopls is happy with "go" for
 * any `.go` file, but tsserver wants "typescriptreact" for `.tsx`.
 */
export function getLspLanguageId(filePath: string, registryId: string): string {
  if (registryId === "typescript") {
    const ext = extname(filePath).toLowerCase();
    if (ext === ".tsx") return "typescriptreact";
    if (ext === ".jsx") return "javascriptreact";
    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "javascript";
    return "typescript";
  }
  return registryId;
}
