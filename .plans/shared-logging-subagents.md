# Shared Logging Helpers for Subagents

## Goal

Refactor `pi/agent/extensions/_shared/logging.ts` from redaction-only helpers into a small shared logging abstraction that owns log-file creation, redacted writes, closing, and best-effort deletion. Then refactor `pi/agent/extensions/subagents/spawn.ts` to use it instead of maintaining its own temp log directory, file creation, stream writes, and cleanup code.

## Constraints

- Keep `_shared/` loader-inert: do not add `pi/agent/extensions/_shared/index.ts`.
- Keep the helper as a library surface only; do not add agent-visible tools or slash commands for this task.
- Preserve current subagent behavior: create an isolated per-run log, write child stdout/stderr to it, close/flush it before returning, delete it on success, and expose `outcome.logFile` on failures/aborts.
- Preserve public `subagents/api.ts` behavior and `SpawnOutcome.logFile` semantics.
- Do not edit symlinked files under `~/.pi`; edit repo source under `pi/agent/...` only.

## Acceptance Criteria

1. `_shared/logging.ts` exports a reusable managed logger abstraction that always creates logs under the fixed shared temp root `/tmp/pi-extension-logs` (technically `join(tmpdir(), "pi-extension-logs")`) using sanitized extension and run identifiers.
2. The logger is the only write path extensions need for managed logs, and its write helpers redact secrets before data reaches disk.
3. The logger supports close/dispose and best-effort deletion/cleanup of a created log file without throwing when the file is already gone or cannot be removed.
4. Tests cover filename sanitization, automatic directory creation, redacted writes, error-message writes, success cleanup, and best-effort cleanup failure behavior.
5. `subagents/spawn.ts` no longer defines its own `LOG_DIR`, `ensureLogDir`, `removeLogFile`, `createLogFile`, or direct `WriteStream` management; it delegates those responsibilities to `_shared/logging.ts`.
6. Existing subagent failure output still includes the persisted log path, successful subagent runs still remove the log file, and subagent logs no longer persist obvious secrets written through the logger.
7. `make typecheck` and `make test` pass.

## Chosen Approach

Add a minimal generic class-style library surface to `_shared/logging.ts`:

- Keep `redactSecrets()` and `safeErrorMessage()` available, but allow changing their implementation if needed to support the logger.
- Add a `ManagedLogger` / `LogFile` class (exact name can be chosen during implementation) with at least:
  - `path: string`
  - `write(text: string | Buffer): void` — redacts before writing to disk
  - `writeError(error: unknown, prefix?: string): void` — writes `safeErrorMessage(error)`
  - `close(): void` or `close(): Promise<void>`
  - `delete(): void` / `cleanup(): void` — best-effort removal of the file
- Add a factory such as `createManagedLogger(options)` with options similar to:
  - `extensionName: string` for the owning extension directory under the shared root
  - `id?: string` for the logical run/tool id; callers should pass the Pi session id or a tool/run id, and extension-level wrappers may default this from `ctx.sessionManager.getSessionFile()` when available
- Logs should be written under `join(tmpdir(), "pi-extension-logs", safeExtensionName, `${safeId}.log`)`.
- Do not let extensions choose arbitrary log directories. The shared helper owns the root directory policy.
- Internally sanitize both extension name and id with the current subagent-safe character policy (`/[^a-zA-Z0-9_:-]/g -> "_"`), create the extension-specific directory with `mkdirSync(..., { recursive: true })`, and open the file with exclusive-create semantics (`wx`) so one run cannot append to or overwrite another run's log.
- If the requested id already exists, the helper should add a short uniqueness suffix internally (for example timestamp/counter) while keeping the path under the same extension directory. This preserves per-run isolation even when a caller reuses an id.
- The class should hide `WriteStream` from callers so extensions cannot accidentally bypass redaction. If direct stream access becomes necessary later, expose it deliberately as a separate advanced API with clear warnings.
- Add a standalone best-effort deletion helper only if it remains useful outside the class, e.g. `deleteLogFile(path: string): void`.
- Do not add structured `event(...)` / JSONL logging in v1. Keep the first shared logger focused on safe raw transcript writes plus error-message writes.

Refactor `subagents/spawn.ts` to import `createManagedLogger` and replace:

- `createLogFile(logId)` with `createManagedLogger({ extensionName: "subagents", id: logId })`
- `log.stream.write(...)` with `log.write(...)`
- error logging with `log.writeError(...)` where applicable
- all completion paths first close/flush the logger
- successful cleanup with `log.delete()` / `log.cleanup()` after close
- failure/abort behavior with `outcome.logFile = log.path` after close, leaving the retained log readable

## Ordered Tasks

1. Read current `_shared/logging.ts`, `_shared/logging.test.ts`, `subagents/spawn.ts`, and `subagents/spawn.test.ts` before editing.
2. Add a managed logger class/factory to `_shared/logging.ts` while preserving existing redaction exports. Use injectable filesystem/time helpers or the repo's exported-wrapper pattern for Node built-ins that tests need to stub (e.g. unlink/create stream/tmpdir/time).
3. Extend `_shared/logging.test.ts` (or add a colocated logging file test if clearer) for creation, sanitization, unique path behavior when an id already exists, redacted raw writes, error writes, close, and cleanup behavior.
4. Refactor `subagents/spawn.ts` to use the shared logger and remove duplicated local logging code/imports/direct stream management.
5. Add or update `subagents/spawn.test.ts` assertions for success cleanup, failure log retention, and secret redaction in retained logs if current coverage does not already prove it.
6. Run `make typecheck`.
7. Run `make test`.

## Verification Checklist

- `make typecheck`
- `make test`
- Inspect `git diff -- pi/agent/extensions/_shared/logging.ts pi/agent/extensions/_shared/logging.test.ts pi/agent/extensions/subagents/spawn.ts pi/agent/extensions/subagents/spawn.test.ts`
- Confirm no public docs are added unless implementation changes require updating existing `subagents/API.md` wording.

## Assumptions / Open Questions

- The requested cleanup surface is library-only, not LLM-visible tools or slash commands.
- A class-style logger is preferable because it lets extensions share one safe API and makes redaction the default write path.
- The existing behavior of deleting logs only on successful subagent completion is desirable.
- A temp directory under `tmpdir()` remains acceptable, but the root must be fixed by the shared helper as `pi-extension-logs`, not extension-controlled. User-facing examples may look like `/tmp/pi-extension-logs/...`, but implementation/tests should assert `tmpdir()`-based paths rather than a literal `/tmp`.
- For subagents, the current tool call id remains the right run id because it identifies one child-process log. Other future extensions can default to a session-derived id when their logs are session-scoped.

## Known Issues / Follow-ups

- If users later want interactive log cleanup, add a separate extension/tool/command layer on top of the shared library instead of embedding Pi-specific registration in `_shared/logging.ts`.
- If multiple extensions start using managed logs, consider a shared retention cleanup helper by age/count over the fixed `/tmp/pi-extension-logs` tree, but do not add retention policy in this first pass unless a caller needs it.
- If future callers need machine-readable logs, add an explicit structured event/JSONL API in v2 rather than mixing it into the v1 raw transcript logger.
