// Stepped Area (docs/specs/009-elements/pie-chart.md "Chart types", "Stepped Area", D289): each value a flat step
// across its category's whole slot, neighbouring steps meeting in an upright riser on their shared edge, the area
// under them filled to zero. The path data both renderers draw, for a Stepped Area chart and a Combo chart's stepped
// area series alike. Pure.
import type { ChartPoint } from './chart-marks';
import { r2 as q } from './svg-render-primitives';

/** A Combo chart's series type, or a Stepped Area chart's variant, that draws as steps. */
export const STEPPED_AREA = 'stepped-area';

// A run's staircase after its start: across the first slot, then a riser and across each next one. A run's points
// are neighbouring categories, so each step's right edge is the next one's left.
const treads = (run: readonly ChartPoint[], half: number) =>
  run.map((p, k) => `${k === 0 ? '' : `V ${q(p.y)} `}H ${q(p.x + half)}`).join(' ');

/** A run of points as steps, each `half` a slot either side of its point; a point alone is a step alone. */
export function stepPath(run: readonly ChartPoint[], half: number): string {
  const first = run[0];
  return first ? `M ${q(first.x - half)} ${q(first.y)} ${treads(run, half)}` : '';
}

/** A run's steps closed down to `zeroY`: the filled area of a stretch of a stepped area series. */
export function stepAreaPath(run: readonly ChartPoint[], half: number, zeroY: number): string {
  const first = run[0];
  if (!first) return '';
  const z = q(zeroY);
  return `M ${q(first.x - half)} ${z} V ${q(first.y)} ${treads(run, half)} V ${z} Z`;
}

/**
 * A stacked series' band, flat across each slot: along its tops (`top`, by category) left to right, back along the
 * running total under it (`bottom`) right to left. `xs` are the slots' middles.
 */
export function stepBandPath(
  xs: readonly number[],
  top: readonly number[],
  bottom: readonly number[],
  half: number,
): string {
  if (!xs.length) return '';
  const edge = (i: number, y: number, from: number, to: number) =>
    `${q(xs[i]! + from)} ${q(y)} L ${q(xs[i]! + to)} ${q(y)}`;
  const along = xs.map((_x, i) => edge(i, top[i]!, -half, half));
  const back = xs.map((_x, i) => edge(i, bottom[i]!, half, -half)).reverse();
  return `M ${[...along, ...back].join(' L ')} Z`;
}

/** Whether a series' points carry markers: a step carries none (D289). */
export const pointsMarked = (
  marks: { dot: number; types?: readonly string[] },
  series: number,
): boolean => marks.dot > 0 && marks.types?.[series] !== STEPPED_AREA;
