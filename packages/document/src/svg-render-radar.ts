// A Radar chart in the headless render (docs/specs/009-elements/pie-chart.md "Radar", D291): the web, each series'
// closed line and markers, the spokes' names, Show Axis's tick values and Show Values, from the marks the canvas
// draws too (chart-radar.ts).
import { AXIS_TICK_FONT_PX, AXIS_TICK_GAP } from './chart-axis';
import { chartFrame } from './chart-frame';
import { chartTextInk } from './chart-ink';
import { lineKeyItems } from './chart-marks';
import { radarMarks } from './chart-radar';
import { chartValueFontPx, lineValueLabels } from './chart-values';
import { LINE_DEFAULT_CATEGORIES, LINE_DEFAULT_SERIES } from './data-shapes';
import { EXPORT_DEFAULT_FONT } from './svg-render-labels';
import { r2, xmlEscape } from './svg-render-primitives';
import {
  AXIS_FAINT,
  svgChartLegend,
  svgChartTitles,
  svgValueLabels,
  type Chart,
} from './svg-render-charts';

export function svgRadarChart(
  el: Chart,
  labelColor: string,
  palette?: readonly string[],
  fontFamily?: string,
  ground?: readonly string[],
): string {
  const textColor = chartTextInk(labelColor, ground);
  const { colorAt, area, legend, titles } = chartFrame(el, palette, ground);
  const categories =
    el.lineCategories && el.lineCategories.length > 0 ? el.lineCategories : LINE_DEFAULT_CATEGORIES;
  const series = el.lineSeries && el.lineSeries.length > 0 ? el.lineSeries : LINE_DEFAULT_SERIES;
  const m = radarMarks(area, categories, series, el.x, el.y, el.chartAxis === true);
  const font = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}"`;
  const ink = xmlEscape(textColor);
  const web =
    m.rings
      .map((d) => `<path d="${d}" fill="none" stroke="${AXIS_FAINT}" stroke-width="1"/>`)
      .join('') +
    m.spokes
      .map(
        (p) =>
          `<path d="M ${r2(m.centre.x)} ${r2(m.centre.y)} L ${r2(p.x)} ${r2(p.y)}" stroke="${AXIS_FAINT}" stroke-width="1"/>`,
      )
      .join('');
  const ticks = m.axis.left
    .map(
      (t) =>
        `<text x="${r2(m.centre.x - AXIS_TICK_GAP)}" y="${r2(t.y + AXIS_TICK_FONT_PX / 3)}" text-anchor="end"${font} font-size="${AXIS_TICK_FONT_PX}" fill="${ink}">${xmlEscape(t.text)}</text>`,
    )
    .join('');
  const names = m.names
    .map(
      (n) =>
        `<text x="${r2(n.x)}" y="${r2(n.y)}" text-anchor="${n.anchor}"${font} font-size="9" fill="${ink}">${xmlEscape(n.text)}</text>`,
    )
    .join('');
  const marks = series
    .map((s, si) => {
      const color = xmlEscape(colorAt(si, s));
      const line = m.lines[si]
        ? `<path d="${m.lines[si]}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`
        : '';
      // No value draws no point (pie-chart.md "No value is a gap").
      const dots = m.points[si]!.map((p) =>
        p ? `<circle cx="${r2(p.x)}" cy="${r2(p.y)}" r="${m.dot}" fill="${color}"/>` : '',
      ).join('');
      return line + dots;
    })
    .join('');
  const values = el.chartValues
    ? svgValueLabels(
        lineValueLabels(m, series),
        textColor,
        null,
        chartValueFontPx(el.textSize),
        fontFamily,
      )
    : '';
  return (
    web +
    ticks +
    marks +
    values +
    names +
    svgChartLegend(el, lineKeyItems(series, 'line'), colorAt, legend, textColor, fontFamily) +
    svgChartTitles(el, titles, textColor, fontFamily)
  );
}
