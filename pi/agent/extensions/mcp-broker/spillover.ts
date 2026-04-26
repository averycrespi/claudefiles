/**
 * Spillover module for mcp_call large-output handling.
 *
 * When joined text content exceeds THRESHOLD_CHARS, the text is written to a
 * temp file and the returned content is replaced with a short envelope referencing
 * the file. Image blocks are preserved inline. On write failure, falls back to
 * returning content unchanged.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const THRESHOLD_CHARS = 25_000;
export const PREVIEW_BYTES = 2_000;
export const SPILL_DIR = join(tmpdir(), "pi-mcp-broker");

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; [k: string]: unknown }
  | { type: string; [k: string]: unknown };

/** Aggregate all text blocks joined with "\n". Non-text blocks are ignored. */
export function joinText(content: ContentBlock[]): string {
  const parts = content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text);
  return parts.join("\n");
}

export interface EnvelopeParams {
  filePath: string;
  originalSize: number;
  joinedText: string;
}

/** Build the persisted-output envelope string. */
export function buildEnvelope({
  filePath,
  originalSize,
  joinedText,
}: EnvelopeParams): string {
  const kb = (originalSize / 1024).toFixed(1);
  const head = joinedText.slice(0, PREVIEW_BYTES);
  const truncatedBytes =
    Buffer.byteLength(joinedText, "utf8") - Buffer.byteLength(head, "utf8");

  return [
    "<persisted-output>",
    `Output too large (${kb} KB / ${originalSize} chars). Full output saved to: \`${filePath}\``,
    "",
    "Preview (first 2 KB):",
    head,
    "",
    `…${truncatedBytes} bytes truncated…`,
    "",
    "Use the read tool on the path above to fetch the full content.",
    "</persisted-output>",
  ].join("\n");
}

export interface SpillResult {
  spilled: false;
  content: ContentBlock[];
}

export interface SpilledResult {
  spilled: true;
  content: ContentBlock[];
  filePath: string;
  originalSize: number;
}

export type SpillIfNeededResult = SpillResult | SpilledResult;

/**
 * Public entry point. Returns content unchanged if below threshold or if text
 * is empty. On spill, writes to dir (default: SPILL_DIR) and returns envelope.
 *
 * @param dir - Override the spill directory (test-only).
 */
export async function spillIfNeeded(
  content: ContentBlock[],
  toolCallId: string,
  dir: string = SPILL_DIR,
): Promise<SpillIfNeededResult> {
  const joinedText = joinText(content);

  if (joinedText.length === 0 || joinedText.length <= THRESHOLD_CHARS) {
    return { spilled: false, content };
  }

  const safeName = toolCallId.replace(/[^a-zA-Z0-9_:-]/g, "_");
  const filePath = join(dir, `${safeName}.txt`);

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, joinedText, { flag: "wx" });
  } catch (err) {
    console.warn("[mcp-broker] spillIfNeeded: failed to write spill file", err);
    return { spilled: false, content };
  }

  const originalSize = joinedText.length;
  const envelope = buildEnvelope({ filePath, originalSize, joinedText });

  // Replace all text blocks with a single envelope block at the position of
  // the first text block; image blocks pass through unchanged.
  const imageBlocks = content.filter((b) => b.type !== "text");
  const firstTextIdx = content.findIndex((b) => b.type === "text");
  const envelopeBlock: ContentBlock = { type: "text", text: envelope };

  let newContent: ContentBlock[];
  if (firstTextIdx === -1) {
    // No text blocks (shouldn't reach here given length check above, but be safe)
    newContent = [...imageBlocks, envelopeBlock];
  } else {
    // Reconstruct: blocks before first text + envelope + remaining non-text blocks
    const before = content
      .slice(0, firstTextIdx)
      .filter((b) => b.type !== "text");
    const after = content
      .slice(firstTextIdx + 1)
      .filter((b) => b.type !== "text");
    newContent = [...before, envelopeBlock, ...after];
  }

  return { spilled: true, content: newContent, filePath, originalSize };
}
