export type SafetyFinding = {
  path: string;
  reason: string;
};

const SECRET_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  {
    reason: "private key",
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/i,
  },
  {
    reason: "credential URL",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i,
  },
  {
    reason: "token assignment",
    pattern:
      /\b(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|secret|password|passwd|pwd)\b\s*[:=]\s*['"]?[A-Za-z0-9_./+=~$-]{12,}/i,
  },
  {
    reason: ".env credential",
    pattern:
      /(?:^|\n)\s*(?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD)[A-Z0-9_]*)\s*=\s*\S{8,}/,
  },
  {
    reason: "bearer token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  },
];

const HIGH_ENTROPY = /\b[A-Za-z0-9_+/=-]{48,}\b/;

export function findUnsafeRetainText(
  fields: Array<{ path: string; value: string | undefined }>,
): SafetyFinding[] {
  const findings: SafetyFinding[] = [];
  for (const field of fields) {
    if (!field.value) continue;
    for (const { reason, pattern } of SECRET_PATTERNS) {
      if (pattern.test(field.value))
        findings.push({ path: field.path, reason });
    }
    if (HIGH_ENTROPY.test(field.value)) {
      findings.push({
        path: field.path,
        reason: "high-entropy secret-like value",
      });
    }
  }
  return dedupeFindings(findings);
}

function dedupeFindings(findings: SafetyFinding[]): SafetyFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.path}:${finding.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
