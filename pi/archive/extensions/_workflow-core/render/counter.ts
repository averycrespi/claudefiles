export interface CounterTheme {
  fg(kind: string, s: string): string;
}

export interface CounterOpts {
  label: string;
  current: number;
  total?: number;
  theme?: CounterTheme;
}

export function renderCounter(opts: CounterOpts): string {
  const value =
    opts.total !== undefined
      ? `${opts.current}/${opts.total}`
      : `${opts.current}`;
  return `${opts.label} ${value}`;
}
