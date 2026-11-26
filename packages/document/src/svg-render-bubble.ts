// A Bubble chart in the headless render (docs/specs/009-elements/pie-chart.md "Bubble", D297): a scatter's axes, each
// bubble filled at 60% with an edge of its colour, largest first, the names that fit inside, Show Values over them,
// from the marks the canvas draws too (chart-bubble.ts).
import {
  BUBBLE_FILL_OPACITY,
  BUBBLE_NAME_FONT_PX,
  bubbleMarks,
  bubbleNames,
  bubbleValueLabels,
} from './chart-bubble';
import { chartFrame } from './chart-frame';
import { chartTextInk } from './chart-ink';
import { lineKeyItems } from './chart-marks';
import { chartValueFontPx } from './chart-values';
import { LINE_DEFAULT_CATEGORIES, LINE_DEFAULT_SERIES } from './data-shapes';
import { labelOn } from './readable-colour';
import { EXPORT_DEFAULT_FONT } from './svg-render-labels';
import { r2, xmlEscape } from './svg-render-primitives';
import {
  svgChartLegend,
  svgChartTitles,
  svgPlotAxes,
  svgValueLabels,
  type Chart,
} from './svg-render-charts';

export function svgBubbleChart(
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
  const m = bubbleMarks(area, categories, series, el.x, el.y, el.chartAxis === true);
  const { axes, labels } = svgPlotAxes(m, textColor, textColor, fontFamily);
  const font = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}"`;
  const bubbles = m.bubbles
    .map((b) => {
      const color = xmlEscape(colorAt(b.s, m.drawn[b.s]!));
      return `<circle cx="${r2(b.x)}" cy="${r2(b.y)}" r="${r2(b.r)}" fill="${color}" fill-opacity="${BUBBLE_FILL_OPACITY}" stroke="${color}" stroke-width="1"/>`;
    })
    .join('');
  const names = bubbleNames(m, el.linePointNames)
    .map(
      (n) =>
        `<text x="${r2(n.x)}" y="${r2(n.y)}" text-anchor="middle"${font} font-size="${BUBBLE_NAME_FONT_PX}" fill="${xmlEscape(labelOn(colorAt(n.s, m.drawn[n.s]!)))}">${xmlEscape(n.text)}</text>`,
    )
    .join('');
  const values = el.chartValues
    ? svgValueLabels(
        bubbleValueLabels(m),
        textColor,
        null,
        chartValueFontPx(el.textSize),
        fontFamily,
      )
    : '';
  return (
    axes +
    bubbles +
    names +
    values +
    labels +
    svgChartLegend(el, lineKeyItems(m.drawn, 'line'), colorAt, legend, textColor, fontFamily) +
    svgChartTitles(el, titles, textColor, fontFamily)
  );
}
