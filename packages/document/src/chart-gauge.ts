// Gauge charts (docs/specs/009-elements/pie-chart.md "Gauge", D330): a pie chart's slices drawn as dials, one per
// slice in a grid, each an arc from the scale's least to its greatest with the value's stretch filled in the slice's
// colour, a needle at the value, the value in the dial and its label under it. Every dial shares one scale, from zero
// (or the least value below it) to a round value at or over the greatest. Laid out once for both renderers. Pure.
import { axisScale } from './chart-axis';
import type { ChartRect } from './chart-frame';
import { chartTypeOf } from './chart-types';
import { shortNumber } from './chart-values';
import { chartValue, type PieSlice } from './data-shapes';
import { r2 } from './svg-render-primitives';

/** Whether a chart draws as a Gauge. */
export const isGaugeChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'gauge';

/** The dial's sweep, centred on twelve o'clock, in degrees, and its arc's thickness as a share of its radius. */
export const GAUGE_SWEEP = 240;
export const GAUGE_ARC_SHARE = 0.18;
/** A dial's track and needle ink: a faint grey and a slate (the needle 7:1 on white). */
export const GAUGE_TRACK = '#e2e8f0';
export const GAUGE_NEEDLE = '#475569';
// The room a dial keeps under it for the scale's ends and, below them, its label, in px.
const LABEL_ROOM = 28;
const PAD = 6;

export type GaugeDial = {
  cx: number;
  cy: number;
  r: number;
  // The track's arc, the value's arc (none with no value) and the needle's tip (none with no value).
  track: string;
  fill: string | null;
  needle: { x: number; y: number } | null;
  value: string | null;
  label: { x: number; y: number; text: string };
};

export type GaugeMarks = {
  dials: GaugeDial[];
  min: number;
  max: number;
  // The scale's two ends, written at the arc's ends of each dial.
  ends: { x: number; y: number; text: string; anchor: 'start' | 'end' }[];
};

// The point at `deg` degrees clockwise from twelve o'clock, `r` from the centre.
const at = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
};

// An arc along radius `r` from `from` to `to` degrees, as path data.
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const a = at(cx, cy, r, from);
  const b = at(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${r2(a.x)} ${r2(a.y)} A ${r2(r)} ${r2(r)} 0 ${large} 1 ${r2(b.x)} ${r2(b.y)}`;
}

/** The grid that holds `n` dials of near-square cells in a `w` by `h` area: its columns and rows. */
export function gaugeGrid(n: number, w: number, h: number): { cols: number; rows: number } {
  const count = Math.max(1, n);
  let best = { cols: 1, rows: count, size: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const size = Math.min(w / cols, h / rows - LABEL_ROOM);
    if (size > best.size) best = { cols, rows, size };
  }
  return { cols: best.cols, rows: best.rows };
}

export function gaugeMarks(area: ChartRect, data: readonly PieSlice[], ox = 0, oy = 0): GaugeMarks {
  const values = data.map((d) => chartValue(d.value));
  const known = values.filter((v) => v !== null);
  const scale = axisScale(Math.min(0, ...known), Math.max(0, ...known));
  const { min, max } = scale;
  const n = Math.max(1, data.length);
  const { cols, rows } = gaugeGrid(n, area.w, area.h);
  const cellW = area.w / cols;
  const cellH = area.h / rows;
  const r = Math.max(4, Math.min(cellW / 2, (cellH - LABEL_ROOM) / 2) - PAD);
  const half = GAUGE_SWEEP / 2;
  const thick = r * GAUGE_ARC_SHARE;
  const mid = r - thick / 2;
  const dials = data.map((d, i): GaugeDial => {
    const cx = ox + area.x + cellW * ((i % cols) + 0.5);
    const cy = oy + area.y + cellH * Math.floor(i / cols) + PAD + r;
    const v = values[i] ?? null;
    const share = v === null ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
    const deg = -half + share * GAUGE_SWEEP;
    return {
      cx,
      cy,
      r,
      track: arc(cx, cy, mid, -half, half),
      fill: v === null || share === 0 ? null : arc(cx, cy, mid, -half, deg),
      needle: v === null ? null : at(cx, cy, r - thick - 2, deg),
      value: v === null ? null : shortNumber(v),
      label: { x: cx, y: cy + r * 0.5 + LABEL_ROOM - 4, text: d.label },
    };
  });
  const ends = dials.flatMap((dl) => {
    const lo = at(dl.cx, dl.cy, dl.r, -half);
    const hi = at(dl.cx, dl.cy, dl.r, half);
    return [
      { x: lo.x + 2, y: lo.y + 10, text: shortNumber(min), anchor: 'start' as const },
      { x: hi.x - 2, y: hi.y + 10, text: shortNumber(max), anchor: 'end' as const },
    ];
  });
  return { dials, min, max, ends };
}

/** A dial's arc thickness, for both renderers' strokes. */
export const gaugeArcWidth = (dial: GaugeDial) => dial.r * GAUGE_ARC_SHARE;
