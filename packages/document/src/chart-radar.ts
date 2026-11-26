// A Radar chart (docs/specs/009-elements/pie-chart.md "Chart types", "Radar", D291): a line chart's data around a
// centre, a spoke per category clockwise from twelve o'clock, each series a closed line through its points. Laid out
// once for both renderers as LineMarks (points, lines; no areas, no bottom labels) with the web and the spokes' names
// beside them, so readouts and Show Values work as a line chart's. Pure; `ox` / `oy` shift every point.
import { axisScale } from './chart-axis';
import type { ChartRect } from './chart-frame';
import type { AxisTick, ChartPoint, LineMarks } from './chart-marks';
import { chartTypeOf } from './chart-types';
import { chartValue, type LineSeries } from './data-shapes';
import { r2 as q } from './svg-render-primitives';

/** Whether a chart draws as a Radar chart. */
export const isRadarChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'radar';

export type RadarSpokeLabel = {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
};

export type RadarMarks = LineMarks & {
  centre: ChartPoint;
  radius: number;
  // Each spoke's end, by category.
  spokes: ChartPoint[];
  // The web's rings as path data: the outer one always, one per tick with Show Axis.
  rings: string[];
  // Each category's name past its spoke's end.
  names: RadarSpokeLabel[];
};

// Room around the web for the categories' names.
const NAME_ROOM = 22;
// How far past a spoke's end its name sits.
const NAME_GAP = 8;
// A name's characters shown, at most.
const NAME_CHARS = 14;

const cut = (text: string) =>
  text.length > NAME_CHARS ? `${text.slice(0, NAME_CHARS - 1)}…` : text;

/** A run's line as path data, closed when it goes all the way round. */
const runPath = (run: readonly ChartPoint[], closed: boolean) =>
  run.map((p, k) => `${k === 0 ? 'M' : 'L'} ${q(p.x)} ${q(p.y)}`).join(' ') + (closed ? ' Z' : '');

/**
 * A series' points around the spokes, broken at each gap: the stretches of neighbouring points, the last joined to the
 * first round the circle; a point with no neighbour draws no line (its marker alone).
 */
function radarLine(points: readonly (ChartPoint | null)[]): string {
  const n = points.length;
  if (points.every((p) => p !== null)) return n > 1 ? runPath(points, true) : '';
  // Start just after a gap, so a stretch across the twelve o'clock spoke stays one; the walk ends on that gap, which
  // closes the last stretch.
  const start = points.findIndex((p, i) => p === null && points[(i + 1) % n] !== null);
  const runs: ChartPoint[][] = [];
  let run: ChartPoint[] = [];
  for (let k = 1; k <= n; k++) {
    const p = points[(start + k) % n];
    if (p) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  return runs
    .filter((r) => r.length > 1)
    .map((r) => runPath(r, false))
    .join(' ');
}

export function radarMarks(
  area: ChartRect,
  categories: readonly string[],
  series: readonly LineSeries[],
  ox = 0,
  oy = 0,
  showAxis = false,
): RadarMarks {
  const n = categories.length;
  let lo = 0;
  let hi = 0;
  for (const s of series)
    for (const raw of s.values) {
      const v = chartValue(raw);
      if (v === null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  const scale = showAxis ? axisScale(lo, hi) : null;
  const min = scale?.min ?? lo;
  const max = scale?.max ?? (hi === lo ? lo + 1 : hi);
  const centre = { x: ox + area.x + area.w / 2, y: oy + area.y + area.h / 2 };
  const radius = Math.max(1, Math.min(area.w, area.h) / 2 - NAME_ROOM);
  // Spoke i's direction, clockwise from twelve o'clock.
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  const at = (i: number, d: number): ChartPoint => ({
    x: centre.x + Math.cos(angle(i)) * d,
    y: centre.y + Math.sin(angle(i)) * d,
  });
  const distance = (v: number) => ((v - min) / (max - min)) * radius;
  const spokes = categories.map((_c, i) => at(i, radius));
  const ring = (d: number) =>
    n > 0
      ? runPath(
          categories.map((_c, i) => at(i, d)),
          true,
        )
      : '';
  const ticks = scale?.ticks.filter((t) => t.value > min) ?? [];
  const rings = [...ticks.map((t) => ring(distance(t.value))).slice(0, -1), ring(radius)];
  const points = series.map((s) =>
    categories.map((_c, i): ChartPoint | null => {
      const v = chartValue(s.values[i]);
      return v === null ? null : at(i, distance(v));
    }),
  );
  const names = categories.map((c, i): RadarSpokeLabel => {
    const p = at(i, radius + NAME_GAP);
    const dx = Math.cos(angle(i));
    return {
      x: p.x,
      // Text sits on its baseline: a name above the centre rises from its point, one below hangs from it.
      y: p.y + (Math.sin(angle(i)) > 0.2 ? 8 : Math.sin(angle(i)) < -0.2 ? 0 : 3),
      text: cut(c),
      anchor: dx > 0.2 ? 'start' : dx < -0.2 ? 'end' : 'middle',
    };
  });
  // Show Axis: each tick's value up the twelve o'clock spoke.
  const left: AxisTick[] = ticks.map((t) => ({ y: centre.y - distance(t.value), text: t.text }));
  return {
    plot: { x: centre.x - radius, y: centre.y - radius, w: radius * 2, h: radius * 2 },
    points,
    lines: points.map(radarLine),
    areas: [],
    labels: [],
    dot: 3,
    axis: { left, right: [] },
    centre,
    radius,
    spokes,
    rings,
    names,
  };
}
