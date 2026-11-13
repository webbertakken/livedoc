// A candidate context's outline (docs/specs/021-event-storming/candidate-contexts.md "Its outline, exactly"): a loose,
// seemingly hand-drawn dashed line round its notes, worked out from where they stand and never stored. The convex hull
// of the notes, grown by the padding all round (so its corners come out round), walked at a fixed step and pushed in
// and out by a smooth wander seeded by the context's id: the same context always wobbles the same way, on every
// screen and in every export. Pure and DOM-free; read by the canvas, the SVG export and the drop rule alike.
import type { Rect } from './geometry-primitives';
import { seededRandom } from './seeded-random';
import { sketchPoint, type Pt } from './sketch';
import { fnv1aString } from './string-hash';

/** How far the outline stands off its notes, canvas px (safe range: 12 to 40; under the lane gap's half). */
export const CONTEXT_PADDING_PX = 24;
/** The most the line wanders in or out of the padded hull, canvas px (safe range: 0 to 6: past it reads as a cloud). */
export const CONTEXT_WOBBLE_PX = 4;
/** How far apart the line is sampled, canvas px (safe range: 16 to 48). */
export const CONTEXT_WOBBLE_STEP_PX = 24;
/** The wander is set every this many samples and eased between, so it rolls rather than jitters. */
const CONTEXT_WOBBLE_KNOT_EVERY = 3;
/** A dash and its gap, canvas px. */
export const CONTEXT_DASH_PX = 10;
/** The line's width, canvas px. */
export const CONTEXT_STROKE_PX = 2;
/** How far in from where the top edge starts the name sits, canvas px. */
export const CONTEXT_LABEL_INSET_PX = 24;
/** Points per padded corner: 16 keeps the round within half a pixel at the padding. */
const CORNER_SAMPLES = 16;

export type ContextOutline = {
  /** The wobbly closed line, as SVG path data in canvas px. */
  path: string;
  /** The padded hull without the wobble, counter-clockwise on screen: what "inside" means. */
  polygon: Pt[];
  /** Where the name's plate starts: on the top edge, in from its start. */
  label: Pt;
  /** The padded hull's box. */
  bounds: Rect;
};

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const tenth = (v: number) => Math.round(v * 10) / 10;

/** The convex hull (Andrew's monotone chain), counter-clockwise on screen (y down), without collinear points. */
export function convexHull(points: readonly Pt[]): Pt[] {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0)
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/** A polygon's area, unsigned. */
export function polygonArea(polygon: readonly Pt[]): number {
  let twice = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Whether a point lies inside a polygon (even-odd). */
export function pointInPolygon(p: Pt, polygon: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

const segmentDistance = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** The gap between a box and a convex polygon: 0 when they touch or overlap. */
export function distanceToPolygon(box: Rect, polygon: readonly Pt[]): number {
  const corners: Pt[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
  if (corners.some((c) => pointInPolygon(c, polygon))) return 0;
  if (
    polygon.some(
      (v) => v.x >= box.x && v.x <= box.x + box.width && v.y >= box.y && v.y <= box.y + box.height,
    )
  )
    return 0;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    for (const c of corners) best = Math.min(best, segmentDistance(c, a, b));
    for (let k = 0; k < 4; k++) {
      const e0 = corners[k]!;
      const e1 = corners[(k + 1) % 4]!;
      best = Math.min(best, segmentDistance(a, e0, e1));
    }
  }
  return best;
}

// The padded hull: the hull of the notes' corners, each hull corner swept round by the padding.
function paddedHull(rects: readonly Rect[]): Pt[] {
  const corners = rects.flatMap((r) => [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ]);
  const swept: Pt[] = [];
  for (const c of convexHull(corners))
    for (let k = 0; k < CORNER_SAMPLES; k++) {
      const a = (2 * Math.PI * k) / CORNER_SAMPLES;
      swept.push({
        x: tenth(c.x + CONTEXT_PADDING_PX * Math.cos(a)),
        y: tenth(c.y + CONTEXT_PADDING_PX * Math.sin(a)),
      });
    }
  return convexHull(swept);
}

// The polygon walked at an even step, each sample with its outward normal (the hull is counter-clockwise on screen).
function walk(polygon: readonly Pt[]): { p: Pt; n: Pt }[] {
  const edges = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { a, b, len };
  });
  const perimeter = edges.reduce((s, e) => s + e.len, 0);
  const count = Math.max(8, Math.round(perimeter / CONTEXT_WOBBLE_STEP_PX));
  const step = perimeter / count;
  const out: { p: Pt; n: Pt }[] = [];
  let edge = 0;
  let into = 0;
  for (let i = 0; i < count; i++) {
    let at = i * step - into;
    while (edge < edges.length - 1 && at > edges[edge]!.len) {
      at -= edges[edge]!.len;
      into += edges[edge]!.len;
      edge += 1;
    }
    const { a, b, len } = edges[edge]!;
    const t = Math.min(1, at / len);
    // Outward of a counter-clockwise (on screen) edge: its direction turned a quarter towards -y.
    const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    out.push({ p: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, n });
  }
  return out;
}

// A closed Catmull-Rom spline through the points, as cubic Béziers.
function smoothClosedPath(points: readonly Pt[]): string {
  const at = (i: number) => points[(i + points.length) % points.length]!;
  const parts = [`M${sketchPoint(points[0]!)}`];
  for (let i = 0; i < points.length; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    parts.push(`C${sketchPoint(c1)} ${sketchPoint(c2)} ${sketchPoint(p2)}`);
  }
  return `${parts.join('')}Z`;
}

// The highest point of the polygon's boundary straight above or below x.
function topAt(polygon: readonly Pt[], x: number): number {
  let top = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) continue;
    const y = a.x === b.x ? Math.min(a.y, b.y) : a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x);
    top = Math.min(top, y);
  }
  return top;
}

/** The outline of a context whose notes stand at `rects`; null when it has none to draw round. */
export function contextOutline(seed: string, rects: readonly Rect[]): ContextOutline | null {
  if (rects.length === 0) return null;
  const polygon = paddedHull(rects);
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const bounds = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: tenth(Math.max(...xs) - Math.min(...xs)),
    height: tenth(Math.max(...ys) - Math.min(...ys)),
  };

  const samples = walk(polygon);
  const random = seededRandom(fnv1aString(seed));
  const knots = Math.ceil(samples.length / CONTEXT_WOBBLE_KNOT_EVERY);
  const offsets = Array.from({ length: knots }, () => (random() * 2 - 1) * CONTEXT_WOBBLE_PX);
  const wobbled = samples.map(({ p, n }, i) => {
    const k = Math.floor(i / CONTEXT_WOBBLE_KNOT_EVERY);
    const t = (i % CONTEXT_WOBBLE_KNOT_EVERY) / CONTEXT_WOBBLE_KNOT_EVERY;
    const eased = (1 - Math.cos(Math.PI * t)) / 2;
    const d = offsets[k]! * (1 - eased) + offsets[(k + 1) % knots]! * eased;
    return { x: p.x + n.x * d, y: p.y + n.y * d };
  });

  const leftmost = Math.min(...rects.map((r) => r.x));
  const labelX = leftmost + CONTEXT_LABEL_INSET_PX;
  return {
    path: smoothClosedPath(wobbled),
    polygon,
    label: { x: labelX, y: tenth(topAt(polygon, labelX)) },
    bounds,
  };
}
