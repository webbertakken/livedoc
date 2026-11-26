// Chart elements in the headless render (docs/specs/009-elements/pie-chart.md): every chart type, plus the key
// they share. The marks come from `chart-marks`, which the canvas views draw from too.
//
// These drew NOTHING before this: the exporter had no branch for them, so a
// chart fell through to the generic box and came out of an export as an empty
// rectangle with its kind name in it. For an element whose entire content is
// its data, that is not a degraded render, it is a blank.
//
// The layout comes from the same `chartFrame` the canvas lays out with, so the
// plot and the legend land in the same rects; only the drawing primitives
// differ. Hover, readouts and the looping animations are the canvas's alone
// and have no meaning in a still image.

import { AXIS_TICK_FONT_PX, AXIS_TICK_GAP } from './chart-axis';
import { chartFrame, type ChartLegendRect } from './chart-frame';
import type { ChartTitleText } from './chart-titles';
import { chartTextInk } from './chart-ink';
import {
  AREA_FILL_OPACITY,
  barMarks,
  lineKeyItems,
  lineMarks,
  pieMarks,
  type BarMarks,
  type LineMarks,
  type BarRect,
} from './chart-marks';
import {
  BAR_GROUP_NAME_FONT_PX,
  barGroupMarks,
  barGroupValueLabels,
  isBarGroupChart,
} from './chart-bar-groups';
import {
  barValueLabels,
  chartValueFontPx,
  lineValueLabels,
  pieValueLabels,
  type ChartValueLabel,
} from './chart-values';
import { labelOn } from './readable-colour';
import { pointsMarked } from './chart-stepped';
import { chartTypeOf, lineVariantOf } from './chart-types';
import { chartStackOf } from './chart-stack';
import { comboKeyItems, comboMarks, comboValueLabels, isComboChart } from './chart-combo';
import { LINE_DEFAULT_CATEGORIES, LINE_DEFAULT_SERIES, type ChartKeyItem } from './data-shapes';
import type { BoxedElement } from './index';
import { legendFontPx } from './label-font';
import { textAdvanceEm } from './text-advance';
import { EXPORT_DEFAULT_FONT } from './svg-render-labels';
import { r2, xmlEscape } from './svg-render-primitives';

export type Chart = BoxedElement & { type: 'shape' };

const AXIS = '#cbd5e1';
export const AXIS_FAINT = '#e2e8f0';

// A key row's swatch at (x, y-centre): a square, or (a scatter series drawn as a line) a line through a dot.
function svgSwatch(
  x: number,
  y: number,
  size: number,
  color: string,
  line: boolean | undefined,
): string {
  const fill = xmlEscape(color);
  return line
    ? `<line x1="${r2(x)}" y1="${r2(y)}" x2="${r2(x + size)}" y2="${r2(y)}" stroke="${fill}" stroke-width="2"/>` +
        `<circle cx="${r2(x + size / 2)}" cy="${r2(y)}" r="${r2(size / 4)}" fill="${fill}"/>`
    : `<rect x="${r2(x)}" y="${r2(y - size / 2)}" width="${size}" height="${size}" rx="2" fill="${fill}"/>`;
}

// The key: a swatch and a name per series, laid out in the strip chartFrame
// left for it. Mirrors ChartLegend's own gates, so a legend too small to read
// is omitted here exactly as it is on the canvas.
// The chart's title and axis titles (chart-titles.ts), where chartFrame laid them out.
export function svgChartTitles(
  el: Chart,
  titles: readonly ChartTitleText[],
  textColor: string,
  fontFamily?: string,
): string {
  const font = xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT);
  return titles
    .map((t) => {
      const x = r2(el.x + t.x);
      const y = r2(el.y + t.y);
      const turn = t.turned ? ` transform="rotate(-90 ${x} ${y})"` : '';
      return `<text x="${x}" y="${y}"${turn} text-anchor="middle" dominant-baseline="central" font-family="${font}" font-size="${t.px}" font-weight="${t.bold ? 600 : 400}" fill="${xmlEscape(textColor)}">${xmlEscape(t.text)}</text>`;
    })
    .join('');
}

export function svgChartLegend(
  el: Chart,
  items: readonly ChartKeyItem[],
  colorAt: (i: number, d: { color?: string }) => string,
  legend: ChartLegendRect,
  textColor: string,
  fontFamily?: string,
): string {
  const vertical = legend.pos === 'left' || legend.pos === 'right';
  if (!legend.show || (vertical ? legend.w < 48 : legend.h < 18)) return '';
  const font = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}"`;
  // Text Size (docs/specs/009-elements/pie-chart.md), on the canvas's scale; the swatch and row pitch keep
  // their proportion to it, as ChartLegend's do.
  const fontPx = legendFontPx(el.textSize);
  const swatch = Math.round(fontPx * 0.8);
  const rowH = Math.round(fontPx * 1.3);
  const parts: string[] = [];
  if (vertical) {
    // A column, centred in the strip.
    const top = el.y + legend.y + legend.h / 2 - (items.length * rowH) / 2;
    items.forEach((item, i) => {
      const y = top + i * rowH + rowH / 2;
      const x = el.x + legend.x + 6;
      parts.push(
        svgSwatch(x, y, swatch, colorAt(i, item), item.line),
        `<text x="${r2(x + swatch + 4)}" y="${r2(y)}"${font} font-size="${fontPx}" fill="${xmlEscape(textColor)}" dominant-baseline="central">${xmlEscape(item.label || '—')}</text>`,
      );
    });
    return parts.join('');
  }
  // A row, wrapped and centred: each name's width estimated per character (text-advance.ts), since there is no DOM
  // to ask; a flat average ran short on wide letters and drew one name into the next swatch.
  const itemW = (item: ChartKeyItem) =>
    swatch + 4 + Math.max(8, textAdvanceEm(item.label || '—') * fontPx) + 10;
  const rows: ChartKeyItem[][] = [[]];
  let used = 0;
  for (const item of items) {
    const width = itemW(item);
    if (used + width > legend.w - 4 && rows[rows.length - 1]!.length > 0) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1]!.push(item);
    used += width;
  }
  const top = el.y + legend.y + legend.h / 2 - (rows.length * rowH) / 2;
  let index = 0;
  rows.forEach((row, ri) => {
    const rowW = row.reduce((sum, item) => sum + itemW(item), 0);
    let x = el.x + legend.x + legend.w / 2 - rowW / 2;
    const y = top + ri * rowH + rowH / 2;
    for (const item of row) {
      parts.push(
        svgSwatch(x, y, swatch, colorAt(index, item), item.line),
        `<text x="${r2(x + swatch + 4)}" y="${r2(y)}"${font} font-size="${fontPx}" fill="${xmlEscape(textColor)}" dominant-baseline="central">${xmlEscape(item.label || '—')}</text>`,
      );
      x += itemW(item);
      index += 1;
    }
  });
  return parts.join('');
}

// Show Values (docs/specs/009-elements/pie-chart.md): each number as text, a wedge's in the ink that reads on it.
export function svgValueLabels(
  labels: readonly ChartValueLabel[],
  textColor: string,
  // The colour of the mark a label sits on; only a label on a mark (`onMark`) asks.
  fillOf: ((i: number) => string) | null,
  fontPx: number,
  fontFamily?: string,
): string {
  const font = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}"`;
  return labels
    .map((l) => {
      const ink = l.onMark !== undefined && fillOf ? labelOn(fillOf(l.onMark)) : textColor;
      const weight = l.category ? '' : ' font-weight="600"';
      return `<text x="${r2(l.x)}" y="${r2(l.y)}" text-anchor="${l.anchor}"${font} font-size="${fontPx}"${weight} fill="${xmlEscape(ink)}">${xmlEscape(l.text)}</text>`;
    })
    .join('');
}

/** A pie chart (or doughnut): wedges clockwise from twelve o'clock, plus the key. */
export function svgPieChart(
  el: Chart,
  labelColor: string,
  palette?: readonly string[],
  fontFamily?: string,
  // What the chart sits on (chartPageGrounds): its series and text drawn adapted to it.
  ground?: readonly string[],
): string {
  const textColor = chartTextInk(labelColor, ground);
  const { data, colorAt, area, legend, titles } = chartFrame(el, palette, ground);
  const doughnut = chartTypeOf(el) === 'doughnut';
  const pie = pieMarks(area, data, doughnut, el.x, el.y);
  const { cx, cy, rad, wedges } = pie;
  const marks = wedges
    .map((wedge, i) => {
      const fill = xmlEscape(colorAt(i, data[i]!));
      if (wedge.full && !doughnut)
        return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(rad)}" fill="${fill}"/>`;
      if (!wedge.d) return '';
      return `<path d="${wedge.d}"${doughnut ? ' fill-rule="evenodd"' : ''} fill="${fill}"/>`;
    })
    .join('');
  const px = chartValueFontPx(el.textSize);
  const values = el.chartValues
    ? svgValueLabels(
        pieValueLabels(pie, data, px),
        textColor,
        (i) => colorAt(i, data[i]!),
        px,
        fontFamily,
      )
    : '';
  return (
    marks +
    values +
    svgChartLegend(el, data, colorAt, legend, textColor, fontFamily) +
    svgChartTitles(el, titles, textColor, fontFamily)
  );
}

/** A column chart (or, horizontal, a bar chart): a baseline and one bar per value, plus the key. */
export function svgBarChart(
  el: Chart,
  labelColor: string,
  palette?: readonly string[],
  fontFamily?: string,
  // What the chart sits on (chartPageGrounds): its series and text drawn adapted to it.
  ground?: readonly string[],
): string {
  const textColor = chartTextInk(labelColor, ground);
  const { data, colorAt, area, legend, titles } = chartFrame(el, palette, ground);
  const horizontal = chartTypeOf(el) === 'bar';
  const groups = isBarGroupChart(el)
    ? barGroupMarks(
        area,
        el.lineCategories ?? [],
        el.lineSeries!,
        horizontal,
        el.x,
        el.y,
        el.chartAxis === true,
        chartStackOf(el),
      )
    : null;
  const barM = groups ?? barMarks(area, data, horizontal, el.x, el.y, el.chartAxis === true);
  const { baseline: b } = barM;
  const font = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}"`;
  // Show Axis: a faint gridline at each tick and its label, under a column chart's left side or a bar chart's bottom.
  const [s0, s1] = barM.axis.span;
  const axis = barM.axis.ticks
    .map((t) =>
      horizontal
        ? `<path d="M ${r2(t.at)} ${r2(s0)} L ${r2(t.at)} ${r2(s1)}" stroke="${AXIS_FAINT}" stroke-width="1"/>` +
          `<text x="${r2(t.at)}" y="${r2(s1 + AXIS_TICK_GAP + AXIS_TICK_FONT_PX)}" text-anchor="middle"${font} font-size="${AXIS_TICK_FONT_PX}" fill="${xmlEscape(textColor)}">${xmlEscape(t.text)}</text>`
        : `<path d="M ${r2(s0)} ${r2(t.at)} L ${r2(s1)} ${r2(t.at)}" stroke="${AXIS_FAINT}" stroke-width="1"/>` +
          `<text x="${r2(s0 - AXIS_TICK_GAP)}" y="${r2(t.at + AXIS_TICK_FONT_PX / 3)}" text-anchor="end"${font} font-size="${AXIS_TICK_FONT_PX}" fill="${xmlEscape(textColor)}">${xmlEscape(t.text)}</text>`,
    )
    .join('');
  const baseline = `<path d="M ${r2(b.x1)} ${r2(b.y1)} L ${r2(b.x2)} ${r2(b.y2)}" stroke="${AXIS}" stroke-width="1"/>`;
  // No value draws no bar (pie-chart.md "No value is a gap"); several series take their series' colours (D281).
  const rect = (bar: BarRect | null, fill: string) =>
    bar
      ? `<rect x="${r2(bar.x)}" y="${r2(bar.y)}" width="${r2(bar.w)}" height="${r2(bar.h)}" rx="${r2(bar.rx)}" fill="${xmlEscape(fill)}"/>`
      : '';
  const series = el.lineSeries ?? [];
  const rects = groups
    ? groups.bars
        .map((bars, j) => bars.map((bar) => rect(bar, colorAt(j, series[j]!))).join(''))
        .join('')
    : (barM as BarMarks).bars.map((bar, i) => rect(bar, colorAt(i, data[i]!))).join('');
  const px = chartValueFontPx(el.textSize);
  const values = !el.chartValues
    ? ''
    : groups
      ? svgValueLabels(
          barGroupValueLabels(groups, series, horizontal, px),
          textColor,
          // A stacked segment's number sits on it, in the ink that reads on its series' colour.
          (j) => colorAt(j, series[j]!),
          px,
          fontFamily,
        )
      : svgValueLabels(
          barValueLabels(barM as BarMarks, data, horizontal, px),
          textColor,
          null,
          px,
          fontFamily,
        );
  const names = groups
    ? svgValueLabels(groups.names, textColor, null, BAR_GROUP_NAME_FONT_PX, fontFamily)
    : '';
  const keys: readonly ChartKeyItem[] = groups
    ? series.map((s) => ({ label: s.name, ...(s.color ? { color: s.color } : {}) }))
    : data;
  return (
    axis +
    baseline +
    rects +
    values +
    names +
    svgChartLegend(el, keys, colorAt, legend, textColor, fontFamily) +
    svgChartTitles(el, titles, textColor, fontFamily)
  );
}

/** A line, area, scatter or combo chart: axes, its marks per series, the x labels, the key. */
// A plotted chart's axes (pie-chart.md "Show Axis"): a faint gridline and a label at each left tick, the right axis's
// labels and its edge in its first series' colour, the plot's two edges; and the x labels under it, drawn last.
export function svgPlotAxes(
  m: Pick<LineMarks, 'plot' | 'axis' | 'labels'>,
  textColor: string,
  rightColor: string,
  fontFamily?: string,
): { axes: string; labels: string } {
  const { x, y, w, h } = m.plot;
  const tickFont = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}" font-size="${AXIS_TICK_FONT_PX}"`;
  const rightInk = xmlEscape(rightColor);
  const ticks =
    m.axis.left
      .map(
        (t) =>
          `<path d="M ${r2(x)} ${r2(t.y)} L ${r2(x + w)} ${r2(t.y)}" stroke="${AXIS_FAINT}" stroke-width="1"/>` +
          `<text x="${r2(x - AXIS_TICK_GAP)}" y="${r2(t.y + AXIS_TICK_FONT_PX / 3)}" text-anchor="end"${tickFont} fill="${xmlEscape(textColor)}">${xmlEscape(t.text)}</text>`,
      )
      .join('') +
    m.axis.right
      .map(
        (t) =>
          `<text x="${r2(x + w + AXIS_TICK_GAP)}" y="${r2(t.y + AXIS_TICK_FONT_PX / 3)}" text-anchor="start"${tickFont} fill="${xmlEscape(textColor)}">${xmlEscape(t.text)}</text>`,
      )
      .join('') +
    (m.axis.right.length
      ? `<path d="M ${r2(x + w)} ${r2(y)} L ${r2(x + w)} ${r2(y + h)}" stroke="${rightInk}" stroke-width="2"/>`
      : '');
  const axes =
    ticks +
    `<path d="M ${r2(x)} ${r2(y)} L ${r2(x)} ${r2(y + h)}" stroke="${AXIS_FAINT}" stroke-width="1"/>` +
    `<path d="M ${r2(x)} ${r2(y + h)} L ${r2(x + w)} ${r2(y + h)}" stroke="${AXIS}" stroke-width="1"/>`;
  const font = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}"`;
  const labels = m.labels
    .map(
      (l) =>
        `<text x="${r2(l.x)}" y="${r2(y + h + 13)}" text-anchor="middle"${font} font-size="9" fill="${xmlEscape(textColor)}">${xmlEscape(l.text)}</text>`,
    )
    .join('');
  return { axes, labels };
}

export function svgLineChart(
  el: Chart,
  labelColor: string,
  palette?: readonly string[],
  fontFamily?: string,
  // What the chart sits on (chartPageGrounds): its series and text drawn adapted to it.
  ground?: readonly string[],
): string {
  const textColor = chartTextInk(labelColor, ground);
  const { colorAt, area, legend, titles } = chartFrame(el, palette, ground);
  const categories =
    el.lineCategories && el.lineCategories.length > 0 ? el.lineCategories : LINE_DEFAULT_CATEGORIES;
  const series = el.lineSeries && el.lineSeries.length > 0 ? el.lineSeries : LINE_DEFAULT_SERIES;
  // A Combo chart's series each drawn as its own type, on the line chart's axes (pie-chart.md "Combo").
  const combo = isComboChart(el)
    ? comboMarks(
        area,
        categories,
        series,
        el.x,
        el.y,
        el.chartAxis === true,
        el.chartSmooth === true,
      )
    : null;
  const m =
    combo ??
    lineMarks(
      area,
      categories,
      series,
      lineVariantOf(el),
      el.x,
      el.y,
      el.chartAxis === true,
      chartStackOf({ ...el, lineSeries: series }),
      el.chartSmooth === true,
    );
  // The right axis's edge in its first series' colour.
  const rightInk = colorAt(
    Math.max(
      0,
      series.findIndex((s) => s.axis === 'right'),
    ),
    series.find((s) => s.axis === 'right') ?? {},
  );
  const { axes, labels } = svgPlotAxes(m, textColor, rightInk, fontFamily);
  const fills = series.map((s, si) =>
    m.areas[si]
      ? `<path d="${m.areas[si]}" fill="${xmlEscape(colorAt(si, s))}" fill-opacity="${AREA_FILL_OPACITY}"/>`
      : '',
  );
  const strokes = series.map((s, si) => {
    const color = xmlEscape(colorAt(si, s));
    const line = m.lines[si]
      ? `<path d="${m.lines[si]}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      : '';
    // No value draws no point (pie-chart.md "No value is a gap"); a step draws none (D289).
    const dots = pointsMarked(m, si)
      ? m.points[si]!.map((p) =>
          p ? `<circle cx="${r2(p.x)}" cy="${r2(p.y)}" r="${m.dot}" fill="${color}"/>` : '',
        ).join('')
      : '';
    return line + dots;
  });
  // A Combo chart paints its areas, then its columns, then its lines over them; another, series by series.
  const columns = combo
    ? combo.bars
        .map((bars, si) =>
          bars
            .map((b) =>
              b
                ? `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" rx="${r2(b.rx)}" fill="${xmlEscape(colorAt(si, series[si]!))}"/>`
                : '',
            )
            .join(''),
        )
        .join('')
    : '';
  const marks = combo
    ? fills.join('') + columns + strokes.join('')
    : series.map((_, si) => fills[si]! + strokes[si]!).join('');
  const legendItems = combo ? comboKeyItems(series) : lineKeyItems(series, lineVariantOf(el));
  const px = chartValueFontPx(el.textSize);
  const values = el.chartValues
    ? svgValueLabels(
        combo ? comboValueLabels(combo, series, px) : lineValueLabels(m, series),
        textColor,
        null,
        px,
        fontFamily,
      )
    : '';
  return (
    axes +
    marks +
    values +
    labels +
    svgChartLegend(el, legendItems, colorAt, legend, textColor, fontFamily) +
    svgChartTitles(el, titles, textColor, fontFamily)
  );
}
