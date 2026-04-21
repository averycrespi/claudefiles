export const DEFAULT_MAX_ITERATIONS = 50;
export const DEFAULT_REFLECT_EVERY = 5;
export const DEFAULT_TIMEOUT_MINS = 15;

export interface ParsedArgs {
  designPath: string;
  reflectEvery: number;
  maxIterations: number;
  timeoutMins: number;
}

export function parseArgs(input: string): ParsedArgs | { error: string } {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { error: "missing design file path" };
  const out: ParsedArgs = {
    designPath: "",
    reflectEvery: DEFAULT_REFLECT_EVERY,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    timeoutMins: DEFAULT_TIMEOUT_MINS,
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--reflect-every") {
      const v = parseInt(tokens[++i] ?? "", 10);
      if (!Number.isFinite(v) || v < 0)
        return { error: "--reflect-every requires a non-negative integer" };
      out.reflectEvery = v;
    } else if (t === "--max-iterations") {
      const v = parseInt(tokens[++i] ?? "", 10);
      if (!Number.isFinite(v) || v < 1)
        return { error: "--max-iterations requires a positive integer" };
      out.maxIterations = v;
    } else if (t === "--iteration-timeout-mins") {
      const v = parseInt(tokens[++i] ?? "", 10);
      if (!Number.isFinite(v) || v < 1)
        return {
          error: "--iteration-timeout-mins requires a positive integer",
        };
      out.timeoutMins = v;
    } else if (t.startsWith("--")) {
      return { error: `unknown flag: ${t}` };
    } else if (!out.designPath) {
      out.designPath = t;
    } else {
      return { error: `unexpected positional argument: ${t}` };
    }
  }
  if (!out.designPath) return { error: "missing design file path" };
  if (/[\x00-\x1f]/.test(out.designPath))
    return { error: "design file path must not contain control characters" };
  return out;
}
