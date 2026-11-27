// Scorecard charts (docs/specs/009-elements/pie-chart.md "Scorecard", D345): a line chart's first series summed as
// its key value, written large in the middle of the plot with the series' name under it; a second series summed as
// the baseline, the key value's change from it written under the name, green over, red under. Laid out once for both
// renderers. Pure.
import type { ChartRect } from './chart-frame';
import { chartTypeOf } from './chart-types';
import { chartValueFontPx } from './chart-values';
import { chartValue, LINE_DEFAULT_SERIES, type LineSeries } from './data-shapes';

/** Whether a chart draws as a Scorecard. */
export const isScorecardChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'scorecard';

/** A rise's and a fall's ink: Google's green and red, each 4.5:1 or over on white. */
export const SCORECARD_RISE = '#188038';
export const SCORECARD_FALL = '#d93025';
/** The key value's size bounds, in px, and the share of the plot's height it may take. */
export const SCORECARD_KEY_PX_MIN = 12;
export const SCORECARD_KEY_PX_MAX = 64;
export const SCORECARD_KEY_HEIGHT_SHARE = 0.4;
/** A digit's width as a share of its font size, for fitting the key value to the plot's width. */
export const SCORECARD_GLYPH_SHARE = 0.6;
// The share of the plot's width the key value may span, and the air between the lines, in px.
const WIDTH_SHARE = 0.9;
const KEY_AIR = 6;
const LINE_AIR = 4;

/** The sum of a series' values (Google's Sum aggregation), gaps not counted; null when it has no value at all. */
export function scorecardSum(values: readonly (number | null)[]): number | null {
  const known = values.map(chartValue).filter((v) => v !== null);
  if (known.length === 0) return null;
  // Twelve significant digits, so 0.1 + 0.2 reads 0.3.
  return Number(known.reduce((a, v) => a + v, 0).toPrecision(12));
}

/** A number as a scorecard writes it: in full, thousands separated, up to two decimals. */
export const scorecardNumber = (v: number) =>
  v.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: true });

type Line = { x: number; y: number; text: string; px: number };

export type ScorecardMarks = {
  // The key value, null when its series has no value.
  key: Line | null;
  // The key series' name.
  name: Line;
  // The change from the baseline, null with no baseline or no value either side.
  change: (Line & { tone: 'rise' | 'fall' | 'level' }) | null;
};

/** The key value, its name and its change, centred in `area` (offset by `ox`, `oy`); `px` is the chart's value size. */
export function scorecardMarks(
  area: ChartRect,
  series: readonly LineSeries[],
  ox = 0,
  oy = 0,
  px = chartValueFontPx(undefined),
): ScorecardMarks {
  const read = series.length > 0 ? series : LINE_DEFAULT_SERIES;
  const key = scorecardSum(read[0]!.values);
  const baseline = read[1] ? scorecardSum(read[1].values) : null;
  const keyText = key === null ? null : scorecardNumber(key);
  const keyPx =
    keyText === null
      ? 0
      : Math.round(
          Math.min(
            SCORECARD_KEY_PX_MAX,
            Math.max(
              SCORECARD_KEY_PX_MIN,
              Math.min(
                area.h * SCORECARD_KEY_HEIGHT_SHARE,
                (area.w * WIDTH_SHARE) / (keyText.length * SCORECARD_GLYPH_SHARE),
              ),
            ),
          ),
        );
  const diff = key === null || baseline === null ? null : scorecardSum([key, -baseline])!;
  const changePx = px + 1;
  const height =
    (keyText === null ? 0 : keyPx + KEY_AIR) + px + (diff === null ? 0 : LINE_AIR + changePx);
  const x = ox + area.x + area.w / 2;
  const top = oy + area.y + (area.h - height) / 2;
  const keyLine = keyText === null ? null : { x, y: top + keyPx, text: keyText, px: keyPx };
  const name = {
    x,
    y: (keyLine ? keyLine.y + KEY_AIR : top) + px,
    text: read[0]!.name,
    px,
  };
  const change =
    diff === null
      ? null
      : {
          x,
          y: name.y + LINE_AIR + changePx,
          px: changePx,
          text: diff === 0 ? '0' : `${diff > 0 ? '▲' : '▼'} ${scorecardNumber(Math.abs(diff))}`,
          tone: diff > 0 ? ('rise' as const) : diff < 0 ? ('fall' as const) : ('level' as const),
        };
  return { key: keyLine, name, change };
}
