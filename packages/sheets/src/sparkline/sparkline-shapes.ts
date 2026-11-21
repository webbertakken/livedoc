// A sparkline's drawing in a cell of w × h pixels (docs/specs/029-sheets/charts.md "Sparklines", D71): paths and
// rectangles, the same for the grid and every export. A paint is a checked CSS colour or a token the renderer
// resolves to its palette: `@accent` (the sheet's accent) or `@muted` (its quiet ink). Pure.
import type { Sparkline } from './sparkline-read';

export type SparkShape =
  | { readonly k: 'path'; readonly d: string; readonly paint: string; readonly width: number }
  | {
      readonly k: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly paint: string;
      readonly opacity?: number;
    };

export const SPARK_ACCENT = '@accent';
export const SPARK_MUTED = '@muted';

// Room kept clear around the chart, and the share of a column's slot left between columns.
const INSET_PX = 2;
const COLUMN_GAP = 0.2;
// color2's default: the accent, half as strong.
const SECOND_OPACITY = 0.5;

const round = (n: number): number => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// Maps a value between lo and hi to a y from the bottom of the room to its top.
function yScale(lo: number, hi: number, h: number): (v: number) => number {
  const span = hi - lo || 1;
  return (v) => round(h - INSET_PX - ((clamp(v, lo, hi) - lo) / span) * (h - 2 * INSET_PX));
}

function line(chart: Sparkline, w: number, h: number, ink: string | undefined): SparkShape[] {
  const ys = chart.values;
  const xs = chart.xs ?? ys.map((_, i) => i);
  const { ymin, ymax, xmin, xmax, rtl, color, linewidth } = chart.options;
  let lo = ymin ?? Math.min(...ys);
  let hi = ymax ?? Math.max(...ys);
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const xlo = xmin ?? Math.min(...xs);
  const xhi = xmax ?? Math.max(...xs);
  const y = yScale(lo, hi, h);
  const room = w - 2 * INSET_PX;
  const x = (v: number): number => {
    const at = xhi === xlo ? room / 2 : ((v - xlo) / (xhi - xlo)) * room;
    return round(rtl ? w - INSET_PX - at : INSET_PX + at);
  };
  const points = ys.map((v, i) => `${x(xs[i]!)} ${y(v)}`);
  // One point draws as a short tick, so it shows.
  const d = points.length === 1 ? `M${points[0]}h0.1` : `M${points.join('L')}`;
  return [{ k: 'path', d, paint: color ?? ink ?? SPARK_ACCENT, width: linewidth ?? 1 }];
}

// A column's paint: the later rule in the help's order wins (D71).
function columnPaint(chart: Sparkline, i: number, lowest: number, highest: number): string {
  const o = chart.options;
  const v = chart.values[i]!;
  let paint = o.color ?? SPARK_ACCENT;
  if (v < 0 && o.negcolor) paint = o.negcolor;
  if (v === lowest && o.lowcolor) paint = o.lowcolor;
  if (v === highest && o.highcolor) paint = o.highcolor;
  if (i === 0 && o.firstcolor) paint = o.firstcolor;
  if (i === chart.values.length - 1 && o.lastcolor) paint = o.lastcolor;
  return paint;
}

function columns(chart: Sparkline, w: number, h: number): SparkShape[] {
  const vs = chart.values;
  const win = chart.kind === 'winloss';
  const heights = win ? vs.map(Math.sign) : vs;
  const lo = win ? -1 : (chart.options.ymin ?? Math.min(0, ...vs));
  const hi = win ? 1 : (chart.options.ymax ?? Math.max(0, ...vs));
  const y = yScale(lo, hi, h);
  const base = y(clamp(0, lo, hi));
  const slot = (w - 2 * INSET_PX) / vs.length;
  const lowest = Math.min(...vs);
  const highest = Math.max(...vs);
  const out: SparkShape[] = [];
  heights.forEach((v, i) => {
    const top = y(v);
    if (top === base) return;
    const place = chart.options.rtl ? vs.length - 1 - i : i;
    out.push({
      k: 'rect',
      x: round(INSET_PX + place * slot + (slot * COLUMN_GAP) / 2),
      y: Math.min(top, base),
      w: round(slot * (1 - COLUMN_GAP)),
      h: round(Math.abs(top - base)),
      paint: columnPaint(chart, i, lowest, highest),
    });
  });
  if (chart.options.axis)
    out.push({
      k: 'path',
      d: `M${INSET_PX} ${base}H${w - INSET_PX}`,
      paint: chart.options.axiscolor ?? SPARK_MUTED,
      width: 1,
    });
  return out;
}

function bar(chart: Sparkline, w: number, h: number): SparkShape[] {
  const vs = chart.values.map((v) => Math.max(0, v));
  const total = chart.options.max ?? vs.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [];
  const room = w - 2 * INSET_PX;
  const out: SparkShape[] = [];
  let at = 0;
  vs.forEach((v, i) => {
    const width = Math.min(room - at, (v / total) * room);
    if (width <= 0) return;
    const first = i % 2 === 0;
    const paint = (first ? chart.options.color1 : chart.options.color2) ?? SPARK_ACCENT;
    out.push({
      k: 'rect',
      x: round(chart.options.rtl ? w - INSET_PX - at - width : INSET_PX + at),
      y: INSET_PX,
      w: round(width),
      h: round(h - 2 * INSET_PX),
      paint,
      ...(!first && !chart.options.color2 ? { opacity: SECOND_OPACITY } : {}),
    });
    at += width;
  });
  return out;
}

/** The shapes that draw `chart` in a cell `w` × `h`; `ink` is the cell's own text colour, a line's default. */
export function sparklineShapes(
  chart: Sparkline,
  w: number,
  h: number,
  ink?: string,
): SparkShape[] {
  if (chart.values.length === 0 || w <= 2 * INSET_PX || h <= 2 * INSET_PX) return [];
  if (chart.kind === 'line') return line(chart, w, h, ink);
  if (chart.kind === 'bar') return bar(chart, w, h);
  return columns(chart, w, h);
}
