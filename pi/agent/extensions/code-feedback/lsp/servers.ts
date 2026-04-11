/**
 * Hardcoded LSP server registry. v1 ships with Go and TypeScript/JavaScript.
 * Adding a language is a code change here — there is no config file by
 * design (see `.designs/2026-04-10-lsp-extension.md`).
 */

export interface ServerConfig {
  /** Executable name. Looked up on PATH at spawn time. */
  command: string;
  /** Arguments passed to the executable. */
  args: string[];
  /** File extensions handled by this server. Lowercase, includes leading dot. */
  extensions: string[];
  /**
   * Filenames walked-up-from-the-file-directory to determine the workspace
   * root. The first marker found wins. For monorepos with multiple `go.mod`s
   * this means each module gets its own server instance.
   */
  rootMarkers: string[];
  /**
   * Human-readable installation hint, shown to the user via `ctx.ui.notify`
   * on the first ENOENT and via the explicit tool response when the model
   * tries to use a missing server.
   */
  installHint: string;
  /**
   * Opt-in marker for per-project local binary resolution. When set, the
   * manager walks up from the workspace root looking for a matching
   * binary under a language-specific local bin directory and prefers that
   * over `$PATH`:
   *
   * - `"node"` — `<root>/node_modules/.bin/<command>`
   *
   * Unset (default) means the server is spawned by bare name and resolved
   * against `$PATH` only. Use this for servers installed into user/system
   * locations (`gopls`, `rust-analyzer`, etc.).
   */
  localBin?: "node";
}

export const DEFAULT_SERVERS: Record<string, ServerConfig> = {
  go: {
    command: "gopls",
    args: ["serve"],
    extensions: [".go"],
    rootMarkers: ["go.mod", "go.work"],
    installHint: "Install: go install golang.org/x/tools/gopls@latest",
  },
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    // Same server handles JavaScript too.
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
    rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
    installHint:
      "Install globally: npm install -g typescript-language-server typescript. " +
      "Or as a dev dependency in your project: " +
      "npm install --save-dev typescript-language-server typescript.",
    localBin: "node",
  },
};
