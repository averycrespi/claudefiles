export interface BreadcrumbTheme {
  bold(s: string): string;
  fg(kind: string, s: string): string;
}

export interface BreadcrumbOpts {
  stages: ReadonlyArray<string>;
  active: string | null;
  theme?: BreadcrumbTheme;
}

export function renderStageBreadcrumb(opts: BreadcrumbOpts): string {
  const sep = " › ";
  const styled = opts.stages.map((s) => {
    if (!opts.theme) return s;
    if (s === opts.active) return opts.theme.bold(opts.theme.fg("accent", s));
    return opts.theme.fg("muted", s);
  });
  return styled.join(sep);
}
