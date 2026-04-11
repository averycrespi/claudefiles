/**
 * All timeouts (in milliseconds) used by the LSP layer. Centralized so
 * future tuning happens in one place. See `.designs/2026-04-10-lsp-extension.md`
 * for the reasoning behind each value.
 */

/**
 * Pull-mode (`textDocument/diagnostic`) hard timeout. The server holds the
 * response until its analysis completes, so we don't normally need a
 * deadline — this is a safety net for hung servers.
 */
export const PULL_MODE_HARD_TIMEOUT_MS = 5000;

/**
 * Push-mode: how long to wait for the FIRST `publishDiagnostics`
 * notification after a `didChange`. If the server doesn't bother sending
 * empty diagnostics for a clean file, this is how long we wait before
 * giving up and returning the empty cache.
 */
export const PUSH_FIRST_NOTIFICATION_TIMEOUT_MS = 1500;

/**
 * Push-mode: after the first notification arrives, debounce by this much
 * to catch the follow-up semantic pass. Most LSP servers send syntax
 * diagnostics within ~50ms then semantic diagnostics ~150-500ms later.
 */
export const PUSH_DEBOUNCE_MS = 150;

/**
 * Push-mode: absolute hard cap. We never wait longer than this for
 * push-mode diagnostics, even if notifications keep arriving.
 */
export const PUSH_HARD_TIMEOUT_MS = 2000;

/**
 * When the explicit `lsp_diagnostics` tool is called and the relevant
 * server is in `starting` state, block this long for it to become
 * `running`. After this we return "still starting, try again".
 */
export const EXPLICIT_TOOL_BLOCK_TIMEOUT_MS = 10000;

/**
 * After a `broken` transition (server crashed or init failed for a
 * non-ENOENT reason), wait this long before allowing a restart attempt.
 * `missing-binary` (ENOENT) state is permanent and ignores this — there's
 * no point retrying when the binary literally doesn't exist on disk.
 */
export const BROKEN_COOLDOWN_MS = 15000;
