// Gauge charts in the headless render (docs/specs/009-elements/pie-chart.md "Gauge", D330): each slice a dial, its track
// faint, its value's stretch in the slice's colour, a needle, the value in the dial, the scale's ends and its label,
// from the marks the canvas draws too (chart-gauge.ts).
import { AXIS_TICK_FONT_PX } from './chart-axis';
import { chartFrame } from './chart-frame';
import { chartTextInk } from './chart-ink';
import { gaugeArcWidth, gaugeMarks, GAUGE_NEEDLE, GAUGE_TRACK } from './chart-gauge';
import { chartValueFontPx } from './chart-values';
import { EXPORT_DEFAULT_FONT } from './svg-render-labels';
import { r2, xmlEscape } from './svg-render-primitives';
import { svgChartTitles, type Chart } from './svg-render-charts';

export function svgGaugeChart(
  el: Chart,
  labelColor: string,
  palette?: readonly string[],
  fontFamily?: string,
  ground?: readonly string[],
): string {
  const ink = chartTextInk(labelColor, ground);
  const textColor = xmlEscape(ink);
  // Each dial names itself: no legend takes room.
  const { data, colorAt, area, titles } = chartFrame(
    { ...el, chartLegend: false },
    palette,
    ground,
  );
  const m = gaugeMarks(area, data, el.x, el.y);
  const font = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}"`;
  const px = chartValueFontPx(el.textSize);
  const dials = m.dials
    .map((d, i) => {
      const width = r2(gaugeArcWidth(d));
      const color = xmlEscape(colorAt(i, data[i]!));
      return (
        `<path d="${d.track}" fill="none" stroke="${GAUGE_TRACK}" stroke-width="${width}"/>` +
        (d.fill
          ? `<path d="${d.fill}" fill="none" stroke="${color}" stroke-width="${width}"/>`
          : '') +
        (d.needle
          ? `<path d="M ${r2(d.cx)} ${r2(d.cy)} L ${r2(d.needle.x)} ${r2(d.needle.y)}" stroke="${GAUGE_NEEDLE}" stroke-width="2" stroke-linecap="round"/>` +
            `<circle cx="${r2(d.cx)}" cy="${r2(d.cy)}" r="3" fill="${GAUGE_NEEDLE}"/>`
          : '') +
        (d.value
          ? `<text x="${r2(d.cx)}" y="${r2(d.cy + d.r * 0.42)}" text-anchor="middle"${font} font-size="${px + 2}" font-weight="600" fill="${textColor}">${xmlEscape(d.value)}</text>`
          : '') +
        `<text x="${r2(d.label.x)}" y="${r2(d.label.y)}" text-anchor="middle"${font} font-size="${px}" fill="${textColor}">${xmlEscape(d.label.text)}</text>`
      );
    })
    .join('');
  const ends = m.ends
    .map(
      (e) =>
        `<text x="${r2(e.x)}" y="${r2(e.y)}" text-anchor="${e.anchor}"${font} font-size="${AXIS_TICK_FONT_PX}" fill="${textColor}">${xmlEscape(e.text)}</text>`,
    )
    .join('');
  return dials + ends + svgChartTitles(el, titles, ink, fontFamily);
}
