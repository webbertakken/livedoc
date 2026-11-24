// Which mark a press lands on (docs/specs/035-pdf-documents/marks.md "Changing a mark": what a press reaches): a text
// mark by the glyphs it covers; a Drawing, a Line, an Arrow, a Rectangle and an Ellipse by their line, within a
// reach and half the line's width, so a box drawn round a paragraph leaves its text to select; a Text, a Callout and
// a stamp anywhere in their box, and a Callout's line as a line. Where marks overlap, the one drawn last. Pure
// geometry in page space, read from the same drawing the page shows.
import type { PagePoint } from './engine-contract';
import { Mark, type Box, type Quad } from './mark';
import { MarkDrawing, type MarkStroke } from './mark-drawing';

/** How far a point lies from the segment from `a` to `b`. */
function distanceToSegment(p: PagePoint, a: PagePoint, b: PagePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether a point lies within `reach` of a stroke, its width's half added; a dot is a stroke of one point twice. */
function nearStroke(p: PagePoint, stroke: MarkStroke, reach: number): boolean {
  const { points } = stroke;
  const ends = stroke.closed ? [...points, points[0]!] : points;
  const near = reach + stroke.width / 2;
  return ends.slice(1).some((end, at) => distanceToSegment(p, ends[at]!, end) <= near);
}

/** Whether a point lies within a quad, its corners around its edge (upper left, upper right, lower right, lower left). */
function inQuad(p: PagePoint, quad: Quad): boolean {
  const corners = [0, 2, 6, 4].map((at) => ({ x: quad[at]!, y: quad[at + 1]! }));
  const sides = corners.map((a, at) => {
    const b = corners[(at + 1) % corners.length]!;
    return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  });
  return !(sides.includes(1) && sides.includes(-1));
}

const inBox = (p: PagePoint, [left, bottom, right, top]: Box): boolean =>
  p.x >= left && p.x <= right && p.y >= bottom && p.y <= top;

/** Whether a press at `p` reaches the mark. */
function reaches(mark: Mark, p: PagePoint, reach: number): boolean {
  if (Mark.isText(mark)) return mark.quads.some((quad) => inQuad(p, quad));
  if ((Mark.isTyped(mark) || mark.kind === 'stamp') && inBox(p, mark.rect)) return true;
  if (mark.kind === 'text' || mark.kind === 'stamp') return false;
  return MarkDrawing.of(mark).strokes.some((stroke) => nearStroke(p, stroke, reach));
}

export const MarkHit = {
  /** The mark a press at `at` reaches, `reach` points from a line; the one drawn last of those, or null. */
  at: (marks: readonly Mark[], at: PagePoint, reach: number): Mark | null =>
    marks.findLast((mark) => reaches(mark, at, reach)) ?? null,
} as const;
