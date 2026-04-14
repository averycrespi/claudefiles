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
