// Table charts in the headless render (docs/specs/009-elements/pie-chart.md "Table", D374): the bands, the header in
// bold over its line, and each cell, from the marks the canvas draws too (chart-table.ts).
import { chartFrame } from './chart-frame';
import { chartTextInk } from './chart-ink';
import { tableMarks, TABLE_BAND, type TableCell } from './chart-table';
import { chartValueFontPx } from './chart-values';
import { EXPORT_DEFAULT_FONT } from './svg-render-labels';
import { r2, xmlEscape } from './svg-render-primitives';
import { svgChartTitles, type Chart } from './svg-render-charts';

export function svgTableChart(
  el: Chart,
  labelColor: string,
  fontFamily?: string,
  ground?: readonly string[],
): string {
  const ink = xmlEscape(chartTextInk(labelColor, ground));
  // The table names its own columns: no legend takes room.
  // The horizontal axis title heads the first column, so the frame keeps no band for it.
  const { area, titles } = chartFrame(
    { ...el, chartLegend: false, chartAxisTitles: undefined },
    undefined,
    ground,
  );
  const px = chartValueFontPx(el.textSize);
  const m = tableMarks(
    area,
    el.lineCategories ?? [],
    el.lineSeries ?? [],
    el.chartAxisTitles?.x ?? '',
    el.x,
    el.y,
    px,
  );
  const font = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}"`;
  const text = (c: TableCell, bold = '') =>
    `<text x="${r2(c.x)}" y="${r2(c.y)}" text-anchor="${c.anchor}"${font} font-size="${px}"${bold} fill="${ink}">${xmlEscape(c.text)}</text>`;
  return (
    m.bands
      .map(
        (b) =>
          `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="${TABLE_BAND}"/>`,
      )
      .join('') +
    `<line x1="${r2(m.rule.x1)}" y1="${r2(m.rule.y)}" x2="${r2(m.rule.x2)}" y2="${r2(m.rule.y)}" stroke="#cbd5e1" stroke-width="1"/>` +
    m.header.map((c) => text(c, ' font-weight="600"')).join('') +
    m.rows.flatMap((r) => r.map((c) => text(c))).join('') +
    svgChartTitles(el, titles, chartTextInk(labelColor, ground), fontFamily)
  );
}
