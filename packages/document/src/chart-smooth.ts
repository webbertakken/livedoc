// Smooth Line (docs/specs/009-elements/pie-chart.md "Chart types", "Smooth Line", D284): a curve through a stretch of
// a line chart's points, a monotone cubic (Fritsch-Carlson), so between two neighbours it keeps within their values
// and never invents a peak or a dip. Pure; path text at two decimals, as every chart coordinate.
import type { ChartPoint } from './chart-marks';
import { r2 as q } from './svg-render-primitives';

/** The path through `run`, in order of x: two points a straight stretch, three or more a cubic between each pair. */
export function smoothPath(run: readonly ChartPoint[]): string {
  const n = run.length;
  if (n < 2) return '';
  const at = (p: ChartPoint) => `${q(p.x)} ${q(p.y)}`;
  if (n === 2) return `M ${at(run[0]!)} L ${at(run[1]!)}`;
  const dx = run.slice(1).map((p, k) => p.x - run[k]!.x);
  // Each stretch's slope; points sharing an x are a flat stretch.
  const slope = dx.map((w, k) => (w === 0 ? 0 : (run[k + 1]!.y - run[k]!.y) / w));
  // Each point's tangent: the mean of its stretches' slopes, flat where the line turns.
  const m = run.map((_, k) => {
    if (k === 0) return slope[0]!;
    if (k === n - 1) return slope[n - 2]!;
    const [a, b] = [slope[k - 1]!, slope[k]!];
    return a * b <= 0 ? 0 : (a + b) / 2;
  });
  // Fritsch-Carlson: tangents scaled so no stretch overshoots its ends.
  for (let k = 0; k < n - 1; k++) {
    const d = slope[k]!;
    if (d === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k]! / d;
    const b = m[k + 1]! / d;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[k] = t * a * d;
      m[k + 1] = t * b * d;
    }
  }
  const segments = dx.map((w, k) => {
    const [p0, p1] = [run[k]!, run[k + 1]!];
    const c1 = { x: p0.x + w / 3, y: p0.y + (m[k]! * w) / 3 };
    const c2 = { x: p1.x - w / 3, y: p1.y - (m[k + 1]! * w) / 3 };
    return `C ${at(c1)} ${at(c2)} ${at(p1)}`;
  });
  return `M ${at(run[0]!)} ${segments.join(' ')}`;
}
