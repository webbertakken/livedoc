// A Combo chart's series types (docs/specs/009-elements/pie-chart.md "Combo", D286): the names and the default, apart
// from the marks so what only reads or tidies a series (normalising, a sheet's read) never loads the drawing code.

/** A Combo chart's series types, as Google Sheets offers them. */
export const COMBO_SERIES_TYPES = ['column', 'line', 'area', 'stepped-area'] as const;
export type ComboSeriesType = (typeof COMBO_SERIES_TYPES)[number];

export const COMBO_SERIES_TYPE_LABELS: Record<ComboSeriesType, string> = {
  column: 'Column',
  line: 'Line',
  area: 'Area',
  'stepped-area': 'Stepped Area',
};

export function isComboSeriesType(v: unknown): v is ComboSeriesType {
  return (COMBO_SERIES_TYPES as readonly unknown[]).includes(v);
}

/**
 * Each series' type as a Combo chart draws it: its own, else the default (D286), the first half of the series,
 * rounded up, columns and the rest lines.
 */
export function comboSeriesTypes(series: readonly { type?: unknown }[]): ComboSeriesType[] {
  const columns = Math.ceil(series.length / 2);
  return series.map((s, i) =>
    isComboSeriesType(s.type) ? s.type : i < columns ? 'column' : 'line',
  );
}
