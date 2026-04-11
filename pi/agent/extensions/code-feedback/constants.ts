import { DiagnosticSeverity } from "vscode-languageserver-protocol";

/**
 * Maximum number of error diagnostics to inline in a write/edit tool_result.
 *
 * Beyond this we show "... and N more error(s)". Increase if the model
 * frequently needs more context at once; decrease if context bloat becomes
 * a problem.
 */
export const MAX_INLINE_ERRORS_PER_FILE = 10;

/**
 * Maximum number of `relatedInformation` entries rendered per diagnostic.
 *
 * Related info is the set of secondary locations a language server attaches
 * to a diagnostic — e.g. TypeScript's "the expected type comes from
 * property X declared here" pointing at the type declaration. These are
 * genuinely useful for the model to jump straight to the fix, but a small
 * number of diagnostics (notably failed overload resolutions) carry a
 * dozen entries that drown the primary message in noise.
 *
 * Capping at 3 keeps the common case informative (most useful TS errors
 * have 1-2 related entries) while trimming the long tail. Beyond the cap
 * we append a "... and N more related" line.
 */
export const MAX_RELATED_PER_DIAG = 3;

/**
 * Maximum documents tracked in the per-language LRU. When exceeded, the
 * oldest tracked document is evicted with a `didClose` notification to the
 * relevant LSP server. Prevents memory leaks in long sessions on big repos.
 */
export const MAX_TRACKED_DOCUMENTS = 100;

/**
 * Maximum number of restart attempts per language server per session before
 * we give up and mark the server as `crashed-too-often`. Prevents infinite
 * crash loops on a fundamentally broken server (e.g. one that panics on a
 * specific malformed file the model keeps editing).
 */
export const MAX_RESTARTS_PER_SESSION = 3;

/**
 * Skip LSP entirely for files larger than this many bytes. Format still
 * runs (it's a separate code path); LSP just doesn't bother. Avoids
 * sending huge generated files through tsserver/gopls.
 */
export const LSP_MAX_FILE_BYTES = 1_000_000;

/**
 * Maximum bytes of server stderr buffered during the startup/init phase.
 * When a language server fails to initialize (e.g. gopls's asdf shim
 * printing "No version is set for command gopls" before exiting), we
 * include the tail of its stderr in the init-failure error so the model
 * gets an actionable reason instead of a generic "connection disposed"
 * message. Buffering stops after init completes to avoid unbounded
 * growth in long sessions. Size is tuned for one or two useful error
 * lines without bloating every error message.
 */
export const STARTUP_STDERR_CAP_BYTES = 4096;

/**
 * Severities we surface in the auto-inject path on tool_result.
 *
 * We deliberately surface ONLY errors here, not warnings/info/hints.
 *
 * Reasoning: the auto-inject runs after every write and edit, so anything
 * included here costs context tokens on every tool result. Warnings are
 * usually lint/style noise the model doesn't need to act on immediately,
 * and including them tends to make the model "fix" things that aren't
 * actually broken — wasted turns and worse signal-to-noise.
 *
 * The explicit `lsp_diagnostics` tool returns ALL severities, so if the
 * model wants the full picture it can ask. Auto-inject stays focused on
 * "you broke the build."
 *
 * To include warnings here, add DiagnosticSeverity.Warning to this set.
 */
export const AUTO_INJECT_SEVERITIES: ReadonlySet<DiagnosticSeverity> = new Set([
  DiagnosticSeverity.Error,
]);
