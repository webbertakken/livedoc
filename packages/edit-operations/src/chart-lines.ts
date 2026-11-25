// The `lines` alias (docs/specs/009-elements/pie-chart.md "Lines set by an agent"): a line chart's series to draw as
// lines on a scatter chart, by name in any case. Marks those, unmarks the rest and changes nothing else of a series,
// so a chart from a Sheet keeps reading its cells. Pure.
import { LINE_DEFAULT_SERIES, type Element, type LineSeries } from '@livedoc/document';
import type { FieldValue } from './types';

// The chart's series with the named ones marked as lines, or the rule a refusal states when a name is no series. A
// chart on its sample data names the sample's series.
export function seriesWithLines(
  el: Element,
  value: FieldValue,
): { series: LineSeries[] } | { rule: string } {
  const current = el.type === 'shape' ? el.lineSeries : undefined;
  const series: readonly LineSeries[] = current?.length ? current : LINE_DEFAULT_SERIES;
  const rule = `series names of this chart: ${series.map((s) => s.name).join(', ')}`;
  const names =
    value === null ? [] : typeof value === 'string' ? [value] : Array.isArray(value) ? value : null;
  if (!names || !names.every((n): n is string => typeof n === 'string')) return { rule };
  const wanted = new Set(names.map((n) => n.trim().toLowerCase()));
  const known = new Set(series.map((s) => s.name.trim().toLowerCase()));
  if ([...wanted].some((n) => !known.has(n))) return { rule };
  return {
    series: series.map(({ line: _line, ...s }) =>
      wanted.has(s.name.trim().toLowerCase()) ? { ...s, line: true as const } : s,
    ),
  };
}
