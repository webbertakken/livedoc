// Candlestick and OHLC charts in the headless render (docs/specs/009-elements/pie-chart.md "Candlestick and OHLC",
// D322): a line chart's axes, each category's wick and body (or line and ticks) in the first series' colour, a falling
// body filled and a rising one hollow, Show Values' closes, from the marks the canvas draws too (chart-stock.ts).
import { chartFrame } from './chart-frame';
import { chartTextInk } from './chart-ink';
import { stockBody, stockMarks, stockPath, stockValueLabels } from './chart-stock';
import { chartTypeOf } from './chart-types';
import { chartValueFontPx } from './chart-values';
import { LINE_DEFAULT_CATEGORIES, LINE_DEFAULT_SERIES } from './data-shapes';
import { r2, xmlEscape } from './svg-render-primitives';
import { svgChartTitles, svgPlotAxes, svgValueLabels, type Chart } from './svg-render-charts';

export function svgStockChart(
  el: Chart,
  labelColor: string,
  palette?: readonly string[],
  fontFamily?: string,
  ground?: readonly string[],
): string {
  const textColor = chartTextInk(labelColor, ground);
  // The series are one price: no legend keys them, so none takes room (D322).
  const { colorAt, area, titles } = chartFrame({ ...el, chartLegend: false }, palette, ground);
  const categories =
    el.lineCategories && el.lineCategories.length > 0 ? el.lineCategories : LINE_DEFAULT_CATEGORIES;
  const series = el.lineSeries && el.lineSeries.length > 0 ? el.lineSeries : LINE_DEFAULT_SERIES;
  const m = stockMarks(area, categories, series, el.x, el.y, el.chartAxis === true);
  const candle = chartTypeOf(el) === 'candlestick';
  const { axes, labels } = svgPlotAxes(m, textColor, textColor, fontFamily);
  const color = xmlEscape(colorAt(0, series[0]!));
  const marks = m.marks
    .map((mark) => {
      if (!mark) return '';
      const lines = `<path d="${stockPath(mark, candle)}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
      const body = candle ? stockBody(mark) : null;
      return (
        lines +
        (body
          ? `<rect x="${r2(body.x)}" y="${r2(body.y)}" width="${r2(body.w)}" height="${r2(body.h)}" fill="${mark.rising ? 'none' : color}" stroke="${color}" stroke-width="1.5"/>`
          : '')
      );
    })
    .join('');
  const values = el.chartValues
    ? svgValueLabels(
        stockValueLabels(m, series),
        textColor,
        null,
        chartValueFontPx(el.textSize),
        fontFamily,
      )
    : '';
  return axes + marks + values + labels + svgChartTitles(el, titles, textColor, fontFamily);
}
