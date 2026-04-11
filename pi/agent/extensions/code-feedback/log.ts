/**
 * Shared logging helper for the code-feedback extension.
 *
 * Why this exists: when Pi is running in interactive TUI mode, writes to
 * stdout/stderr by any extension bleed into the terminal display and
 * corrupt the footer/status line. The LSP layer generates a lot of
 * diagnostic noise (stderr from language servers, connection lifecycle
 * events, crash reports) that's valuable for debugging but ruinous for
 * the TUI.
 *
 * In TUI mode, messages are appended to `~/.pi/logs/code-feedback.log`
 * instead of the console. In non-TUI mode (json, rpc, -p), they fall
 * through to `console.error` unchanged so existing log-capture tooling
 * keeps working. Set once from `session_start` via `configureLogging`.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

let logFilePath: string | null = null;
let tuiActive = false;

export function configureLogging(hasUI: boolean): void {
  tuiActive = hasUI;
  if (!hasUI) {
    logFilePath = null;
    return;
  }
  const path = join(homedir(), ".pi", "logs", "code-feedback.log");
  try {
    mkdirSync(dirname(path), { recursive: true });
    logFilePath = path;
  } catch {
    // Best-effort. If we can't create the log directory, fall back to
    // dropping messages on the floor rather than corrupting the TUI.
    logFilePath = null;
  }
}

/**
 * Log a diagnostic message. In TUI mode the message is appended to the
 * log file (with ISO timestamp); otherwise it goes to `console.error`.
 * Never throws — logging failures are swallowed so they can't crash the
 * host.
 */
export function logError(...args: unknown[]): void {
  if (!tuiActive) {
    console.error(...args);
    return;
  }
  if (!logFilePath) return;
  try {
    const line = args
      .map((arg) => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === "string") return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(" ");
    appendFileSync(logFilePath, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Swallow — can't log the log failure either.
  }
}
