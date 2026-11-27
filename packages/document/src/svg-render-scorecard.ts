// Scorecard charts in the headless render (docs/specs/009-elements/pie-chart.md "Scorecard", D370): the key value large
// and bold, its name under it, the change from the baseline under that in green or red, from the marks the canvas
// draws too (chart-scorecard.ts).
import { chartFrame } from './chart-frame';
import { chartTextInk } from './chart-ink';
import {
  scorecardMarks,
  SCORECARD_FALL,
  SCORECARD_RISE,
  type ScorecardMarks,
} from './chart-scorecard';
import { chartValueFontPx } from './chart-values';
import { EXPORT_DEFAULT_FONT } from './svg-render-labels';
import { r2, xmlEscape } from './svg-render-primitives';
import { svgChartTitles, type Chart } from './svg-render-charts';

/** A change's ink on `ground`: green over, red under, the text colour when level; held to 4.5:1. */
export function scorecardChangeInk(
  tone: NonNullable<ScorecardMarks['change']>['tone'],
  textColor: string,
  ground?: readonly string[],
): string {
  return tone === 'level'
    ? textColor
    : chartTextInk(tone === 'rise' ? SCORECARD_RISE : SCORECARD_FALL, ground);
}

export function svgScorecardChart(
  el: Chart,
  labelColor: string,
  fontFamily?: string,
  ground?: readonly string[],
): string {
  const ink = chartTextInk(labelColor, ground);
  // The chart writes its numbers: no legend takes room.
  const { area, titles } = chartFrame({ ...el, chartLegend: false }, undefined, ground);
  const m = scorecardMarks(area, el.lineSeries ?? [], el.x, el.y, chartValueFontPx(el.textSize));
  const font = ` font-family="${xmlEscape(fontFamily ?? EXPORT_DEFAULT_FONT)}"`;
  const text = (l: { x: number; y: number; text: string; px: number }, fill: string, bold = '') =>
    `<text x="${r2(l.x)}" y="${r2(l.y)}" text-anchor="middle"${font} font-size="${l.px}"${bold} fill="${xmlEscape(fill)}">${xmlEscape(l.text)}</text>`;
  return (
    (m.key ? text(m.key, ink, ' font-weight="700"') : '') +
    text(m.name, ink) +
    (m.change ? text(m.change, scorecardChangeInk(m.change.tone, ink, ground)) : '') +
    svgChartTitles(el, titles, ink, fontFamily)
  );
}
