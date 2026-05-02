const SECRET_ASSIGNMENT =
  /\b(api[_-]?key|token|password|secret)\b(\s*[:=]\s*)(["']?)([^"'\s]+)(\3)/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s"']+/gi;
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const COMMON_TOKEN = /\b(ghp|gho|ghu|ghs|github_pat|sk)-[A-Za-z0-9_\-]{16,}\b/g;

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
