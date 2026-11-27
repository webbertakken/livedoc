// Waterfall charts in the headless render (docs/specs/009-elements/pie-chart.md "Waterfall", D326): the column chart's
// axis and baseline, each change a floating column (rises in the series' colour, falls red), the
// Subtotal column grey, connectors between them, the names under them, Show Values, the three keys, from the marks the
// canvas draws too (chart-waterfall.ts).
import { barGroupValueLabels, BAR_GROUP_NAME_FONT_PX } from './chart-bar-groups';
import { chartFrame } from './chart-frame';
import { chartTextInk } from './chart-ink';
import { chartValueFontPx } from './chart-values';
import { waterfallKeys, waterfallMarks } from './chart-waterfall';
import { LINE_DEFAULT_CATEGORIES, LINE_DEFAULT_SERIES } from './data-shapes';
import { r2, xmlEscape } from './svg-render-primitives';
import {
  svgBarAxis,
  svgChartLegend,
  svgChartTitles,
  svgValueLabels,
  type Chart,
} from './svg-render-charts';

/** A connector's ink: the axis's faint grey. */
export const WATERFALL_CONNECTOR = '#94a3b8';

export function svgWaterfallChart(
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
  const m = waterfallMarks(area, categories, series, el.x, el.y, el.chartAxis === true);
  const keys = waterfallKeys(series);
  const { axis, baseline } = svgBarAxis(m, false, textColor, fontFamily);
  const connectors = m.connectors
    .map(
      (c) =>
        `<path d="M ${r2(c.x1)} ${r2(c.y)} L ${r2(c.x2)} ${r2(c.y)}" stroke="${WATERFALL_CONNECTOR}" stroke-width="1"/>`,
    )
    .join('');
  const rects = m.bars
    .map((row, k) =>
      row
        .map((bar) =>
          bar
            ? `<rect x="${r2(bar.x)}" y="${r2(bar.y)}" width="${r2(bar.w)}" height="${r2(Math.max(1, bar.h))}" fill="${xmlEscape(colorAt(k, keys[k]!))}"/>`
            : '',
        )
        .join(''),
    )
    .join('');
  const px = chartValueFontPx(el.textSize);
  const values = el.chartValues
    ? svgValueLabels(
        barGroupValueLabels({ ...m, stack: null }, m.rows, false, px),
        textColor,
        null,
        px,
        fontFamily,
      )
    : '';
  return (
    axis +
    baseline +
    connectors +
    rects +
    values +
    svgValueLabels(m.names, textColor, null, BAR_GROUP_NAME_FONT_PX, fontFamily) +
    svgChartLegend(el, keys, colorAt, legend, textColor, fontFamily) +
    svgChartTitles(el, titles, textColor, fontFamily)
  );
}
