/**
 * PDF text extraction via unpdf.
 */

import { extractText, getMeta } from "unpdf";

export interface PdfResponse {
  text: string;
  pageCount: number;
  title?: string;
}

/**
 * Extract text from a PDF buffer. Returns plain text with page count metadata.
 */
export async function extractPdf(
  buffer: ArrayBuffer,
  maxChars: number,
): Promise<PdfResponse> {
  const { text, totalPages } = await extractText(buffer);

  const meta = await getMeta(buffer);
  const title = (meta.info as Record<string, unknown> | undefined)?.Title as
    | string
    | undefined;

  let content = (Array.isArray(text) ? text.join("\n") : text).trim();
  if (content.length > maxChars) {
    content =
      content.slice(0, maxChars) +
      `\n\n[Content truncated — ${content.length.toLocaleString()} total characters. Use max_chars to read more.]`;
  }

  return {
    text: content,
    pageCount: totalPages,
    title: title || undefined,
  };
}
