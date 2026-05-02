import {
  createWriteStream,
  mkdirSync,
  openSync,
  unlinkSync,
  type WriteStream,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SECRET_ASSIGNMENT =
  /\b(api[_-]?key|token|password|secret)\b(\s*[:=]\s*)(["']?)([^"'\s]+)(\3)/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s"']+/gi;
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const COMMON_TOKEN = /\b(ghp|gho|ghu|ghs|github_pat|sk)-[A-Za-z0-9_\-]{16,}\b/g;

export const _loggingFs = {
  createWriteStream,
  mkdirSync,
  openSync,
  tmpdir,
  unlinkSync,
  now: Date.now,
};

export function redactSecrets(text: string): string {
  return text
    .replace(PRIVATE_KEY_BLOCK, "[REDACTED PRIVATE KEY]")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(COMMON_TOKEN, "[REDACTED]")
    .replace(SECRET_ASSIGNMENT, (_match, key, separator, quote) => {
      return `${key}${separator}${quote}[REDACTED]${quote}`;
    });
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message);
}

export interface ManagedLoggerOptions {
  extensionName: string;
  id?: string;
}

const LOG_ROOT = "pi-extension-logs";
const DEFAULT_ID = "session";

function sanitizeLogPart(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_:-]/g, "_");
  return sanitized || "log";
}

function createUniqueStream(
  dir: string,
  id: string,
): { path: string; stream: WriteStream } {
  const candidates = [
    `${id}.log`,
    `${id}-${_loggingFs.now()}.log`,
    `${id}-${_loggingFs.now()}-${process.pid}.log`,
  ];

  for (const name of candidates) {
    const path = join(dir, name);
    try {
      const fd = _loggingFs.openSync(path, "wx");
      return {
        path,
        stream: _loggingFs.createWriteStream(path, { fd }),
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "EEXIST") throw error;
    }
  }

  for (let i = 1; i <= 100; i += 1) {
    const path = join(dir, `${id}-${_loggingFs.now()}-${process.pid}-${i}.log`);
    try {
      const fd = _loggingFs.openSync(path, "wx");
      return {
        path,
        stream: _loggingFs.createWriteStream(path, { fd }),
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "EEXIST") throw error;
    }
  }

  throw new Error(`Could not create unique log file for ${id}`);
}

export class ManagedLogger {
  readonly path: string;
  private readonly stream: WriteStream;
  private closePromise: Promise<void> | undefined;

  constructor(path: string, stream: WriteStream) {
    this.path = path;
    this.stream = stream;
  }

  write(text: string | Buffer): void {
    this.stream.write(text);
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = new Promise((resolve) => {
      this.stream.end(resolve);
    });
    return this.closePromise;
  }

  delete(): void {
    try {
      _loggingFs.unlinkSync(this.path);
    } catch {
      // best-effort
    }
  }
}

export function createManagedLogger(
  options: ManagedLoggerOptions,
): ManagedLogger {
  const extensionName = sanitizeLogPart(options.extensionName);
  const id = sanitizeLogPart(options.id ?? DEFAULT_ID);
  const dir = join(_loggingFs.tmpdir(), LOG_ROOT, extensionName);
  _loggingFs.mkdirSync(dir, { recursive: true });
  const { path, stream } = createUniqueStream(dir, id);
  return new ManagedLogger(path, stream);
}
