/**
 * Pure validation helpers for the ask_user tool.
 *
 * TypeBox enforces shape (minLength, minItems, maxItems) at the parameter
 * boundary. These checks cover the cross-field rules TypeBox can't express:
 * label normalization, reserved-label collisions with the auto-added "Other"
 * row, case-insensitive uniqueness, and the `recommended` index range.
 */

export const OTHER_LABEL = "Type something.";

const RESERVED_LABELS = new Set(["other", OTHER_LABEL.toLowerCase()]);

export interface AskOptionLike {
  label: string;
  description?: string;
}

export interface AskParamsLike {
  options: AskOptionLike[];
  recommended?: number;
}

export function validateAskParams(params: AskParamsLike): string | null {
  const labels = new Set<string>();
  for (const option of params.options) {
    const label = option.label.trim();
    if (!label) return "Option labels must be non-empty.";
    const normalized = label.toLowerCase();
    if (RESERVED_LABELS.has(normalized)) {
      return "Options must not include an 'Other' label; it is added automatically.";
    }
    if (labels.has(normalized)) {
      return "Option labels must be unique.";
    }
    labels.add(normalized);
  }
  if (
    params.recommended != null &&
    params.recommended >= params.options.length
  ) {
    return "recommended must point to a valid option index.";
  }
  return null;
}
