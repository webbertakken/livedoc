// Timeline charts (docs/specs/009-elements/pie-chart.md "Timeline", D347): a line chart whose categories are dates,
// each point placed along a time axis by its date. Laid out as a scatter of the dates' times (so the value range fits
// the values), each series' line redrawn in date order and broken at a gap, no markers, and the axis labelled at round
// dates. With no category a date it is spaced evenly as a Line chart. Laid out once for both renderers. Pure.
import type { ChartRect } from './chart-frame';
import { isoDateTime, utcTime } from './chart-dates';
import { lineMarks, runsOf, type LineMarks } from './chart-marks';
import { chartTypeOf } from './chart-types';
import type { LineSeries } from './data-shapes';

/** Whether a chart draws as a Timeline. */
export const isTimelineChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'timeline';

/** The least width, in px, each date label on the time axis takes. */
export const TIMELINE_LABEL_PX = 80;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 1970-01-05, the first Monday after the epoch, so weeks start on Mondays.
const MONDAY = 4 * DAY;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const q = (n: number) => Math.round(n * 100) / 100;

const dayText = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
const timeText = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
const midnight = (d: Date) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0;

/** A date as a point's readout writes it: `Feb 8, 2018`, with its time when it has one. */
export function timelineDateText(ms: number): string {
  const d = new Date(ms);
  return `${dayText(d)}, ${d.getUTCFullYear()}${midnight(d) ? '' : ` ${timeText(d)}`}`;
}

type Step =
  | { unit: 'ms'; size: number; offset: number; text: (d: Date) => string }
  | { unit: 'month' | 'year'; size: number };

// The steps a time axis takes, finest first; months and years by the calendar, the rest by fixed lengths.
const STEPS: readonly Step[] = [
  ...[1, 3, 6, 12].map((h): Step => ({
    unit: 'ms',
    size: h * HOUR,
    offset: 0,
    text: (d) => `${dayText(d)} ${timeText(d)}`,
  })),
  ...[1, 2].map((n): Step => ({ unit: 'ms', size: n * DAY, offset: 0, text: dayText })),
  { unit: 'ms', size: 7 * DAY, offset: MONDAY, text: dayText },
  ...[1, 3, 6].map((size): Step => ({ unit: 'month', size })),
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].map((size): Step => ({ unit: 'year', size })),
];

// A step's typical length, for counting how many labels it gives over a span.
const lengthOf = (s: Step) =>
  s.unit === 'ms' ? s.size : s.unit === 'month' ? s.size * 30.44 * DAY : s.size * 365.25 * DAY;

/** The time axis's labels from `lo` to `hi` (UTC ms) over `plotW` px: round dates, at most one per 80 px. */
export function timeTicks(lo: number, hi: number, plotW: number): { t: number; text: string }[] {
  if (hi <= lo) {
    const d = new Date(lo);
    return [{ t: lo, text: midnight(d) ? dayText(d) : `${dayText(d)} ${timeText(d)}` }];
  }
  const most = Math.max(2, Math.floor(plotW / TIMELINE_LABEL_PX));
  const step =
    STEPS.find((s) => Math.floor((hi - lo) / lengthOf(s)) + 1 <= most) ?? STEPS[STEPS.length - 1]!;
  const out: { t: number; text: string }[] = [];
  if (step.unit === 'ms') {
    const first = Math.ceil((lo - step.offset) / step.size) * step.size + step.offset;
    for (let t = first; t <= hi; t += step.size) out.push({ t, text: step.text(new Date(t)) });
    return out;
  }
  const d = new Date(lo);
  if (step.unit === 'month') {
    // Months counted from year zero, the first on a boundary of the step at or after `lo`.
    let k = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (utcTime(Math.floor(k / 12), k % 12) < lo) k += 1;
    k = Math.ceil(k / step.size) * step.size;
    for (let t = utcTime(Math.floor(k / 12), k % 12); t <= hi;) {
      out.push({ t, text: `${MONTHS[k % 12]} ${Math.floor(k / 12)}` });
      k += step.size;
      t = utcTime(Math.floor(k / 12), k % 12);
    }
    return out;
  }
  let y = d.getUTCFullYear();
  if (utcTime(y, 0) < lo) y += 1;
  y = Math.ceil(y / step.size) * step.size;
  for (; utcTime(y, 0) <= hi; y += step.size) out.push({ t: utcTime(y, 0), text: String(y) });
  return out;
}

/** A timeline's marks: points by date, lines in date order broken at gaps, no markers, round date labels. */
export function timelineMarks(
  area: ChartRect,
  categories: readonly string[],
  series: readonly LineSeries[],
  ox = 0,
  oy = 0,
  showAxis = false,
): LineMarks {
  const times = categories.map(isoDateTime);
  const known = times.filter((t) => t !== null);
  // No date at all: a Line chart's even spacing, its lines and labels, without markers.
  if (known.length === 0)
    return { ...lineMarks(area, categories, series, 'line', ox, oy, showAxis), dot: 0 };
  const m = lineMarks(
    area,
    times.map((t) => (t === null ? '' : String(t))),
    series,
    'scatter',
    ox,
    oy,
    showAxis,
  );
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const span = hi === lo ? 1 : hi - lo;
  const x = (t: number) => m.plot.x + ((t - lo) / span) * m.plot.w;
  // In date order, the sort stable so equal dates keep their rows' order; a value missing breaks the line.
  const order = times
    .map((t, i) => ({ t, i }))
    .filter((e): e is { t: number; i: number } => e.t !== null)
    .sort((a, b) => a.t - b.t);
  const lines = m.points.map((pts) =>
    runsOf(order.map((e) => pts[e.i] ?? null))
      .filter((run) => run.length > 1)
      .map((run) => run.map((p, k) => `${k === 0 ? 'M' : 'L'} ${q(p.x)} ${q(p.y)}`).join(' '))
      .join(' '),
  );
  const labels = timeTicks(lo, hi, m.plot.w).map((tick) => ({ x: x(tick.t), text: tick.text }));
  return { ...m, lines, labels, dot: 0 };
}
