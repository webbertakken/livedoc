// Erase (docs/specs/035-pdf-documents/marks.md "Changing a mark"): the strokes of a Drawing a drag passes over, whole
// strokes at a time, within a reach of a stroke's line, half its width added; and the Drawing without them, or
// nothing where none is left. Pure geometry in page space.
import type { PagePoint } from './engine-contract';
import type { DrawingMark, Stroke } from './mark';

const pointsOf = (stroke: Stroke): PagePoint[] =>
  Array.from({ length: stroke.length / 2 }, (_, at) => ({
    x: stroke[at * 2]!,
    y: stroke[at * 2 + 1]!,
  }));

/** How far a point lies from the segment from `a` to `b`. */
function toSegment(p: PagePoint, a: PagePoint, b: PagePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const turn = (a: PagePoint, b: PagePoint, c: PagePoint): number =>
  Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));

/** Whether two segments cross, each one's ends on either side of the other. */
const cross = (a: PagePoint, b: PagePoint, c: PagePoint, d: PagePoint): boolean =>
  turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;

/** How far apart two segments lie: none where they cross, else the least of each end to the other. */
function apart(a: PagePoint, b: PagePoint, c: PagePoint, d: PagePoint): number {
  if (cross(a, b, c, d)) return 0;
  return Math.min(toSegment(a, c, d), toSegment(b, c, d), toSegment(c, a, b), toSegment(d, a, b));
}

/** A run of points as segments; one point is a segment from it to itself. */
const segmentsOf = (points: readonly PagePoint[]): [PagePoint, PagePoint][] =>
  points.length === 1
    ? [[points[0]!, points[0]!]]
    : points.slice(1).map((end, at) => [points[at]!, end]);

export const MarkErase = {
  /** The strokes of a Drawing, by place, that a drag through `path` comes within `reach` points of. */
  passed: (mark: DrawingMark, path: readonly PagePoint[], reach: number): readonly number[] => {
    if (path.length === 0) return [];
    const drag = segmentsOf(path);
    const near = reach + mark.width / 2;
    return mark.strokes.flatMap((stroke, at) => {
      const lines = segmentsOf(pointsOf(stroke));
      const hit = lines.some(([a, b]) => drag.some(([c, d]) => apart(a, b, c, d) <= near));
      return hit ? [at] : [];
    });
  },

  /** A Drawing's strokes without those named, by place; null where none is left, the Drawing to be deleted. */
  without: (mark: DrawingMark, gone: readonly number[]): { readonly strokes: Stroke[] } | null => {
    const strokes = mark.strokes.filter((_, at) => !gone.includes(at));
    return strokes.length > 0 ? { strokes } : null;
  },
} as const;
