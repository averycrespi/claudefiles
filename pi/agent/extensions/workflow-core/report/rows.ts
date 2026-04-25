export interface FormatLabelValueRowOpts {
  labelWidth?: number;
}

export function formatLabelValueRow(
  label: string,
  value: string,
  opts: FormatLabelValueRowOpts = {},
): string {
  const labelWidth = opts.labelWidth ?? 9;
  const labelPart = `${label}:`;
  const padding =
    labelPart.length >= labelWidth
      ? " "
      : " ".repeat(labelWidth - labelPart.length + 1);
  return `${labelPart}${padding}${value}`;
}
