// Treemap charts in the headless render (docs/specs/009-elements/pie-chart.md "Treemap", D328): each slice a tile in its
// colour, its name (and with Show Values its value) inside when it fits, the pie's key, from the tiles the canvas draws
// too (chart-treemap.ts).
import { chartFrame } from './chart-frame';
import { chartTextInk } from './chart-ink';
import { treemapLabels, treemapTiles } from './chart-treemap';
import { chartValueFontPx } from './chart-values';
import { r2, xmlEscape } from './svg-render-primitives';
import { svgChartLegend, svgChartTitles, svgValueLabels, type Chart } from './svg-render-charts';

export function svgTreemapChart(
  el: Chart,
  labelColor: string,
  palette?: readonly string[],
  fontFamily?: string,
  ground?: readonly string[],
): string {
  const textColor = chartTextInk(labelColor, ground);
  const { data, colorAt, area, legend, titles } = chartFrame(el, palette, ground);
  const tiles = treemapTiles(area, data, el.x, el.y);
  const rects = tiles
    .map((t, i) =>
      t
        ? `<rect x="${r2(t.x)}" y="${r2(t.y)}" width="${r2(t.w)}" height="${r2(t.h)}" fill="${xmlEscape(colorAt(i, data[i]!))}"/>`
        : '',
    )
    .join('');
  const px = chartValueFontPx(el.textSize);
  const labels = svgValueLabels(
    treemapLabels(tiles, data, px, el.chartValues === true),
    textColor,
    (i) => colorAt(i, data[i]!),
    px,
    fontFamily,
  );
  return (
    rects +
    labels +
    svgChartLegend(el, data, colorAt, legend, textColor, fontFamily) +
    svgChartTitles(el, titles, textColor, fontFamily)
  );
}
