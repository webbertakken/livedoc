// A turn's plain geometry (docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate): an angle's cosine and
// sine, exact at the quarter turns; a point turned about another; and the bounds a box shows once turned about its
// middle. Angles are degrees anticlockwise, as page space and a file's `Rotate` read them. mark.ts and mark-turn.ts
// both stand on it, so it imports neither.
import type { PagePoint } from './engine-contract';

/** `[left, bottom, right, top]` in page space; the same as mark.ts's `Box`, named here to keep this file below it. */
type Box = readonly [number, number, number, number];

/** An angle's cosine and sine; a quarter turn's are whole, so a stamp turned 90° keeps its exact box. */
export function cosSinOf(degrees: number): readonly [number, number] {
  const whole = ((degrees % 360) + 360) % 360;
  if (whole === 0) return [1, 0];
  if (whole === 90) return [0, 1];
  if (whole === 180) return [-1, 0];
  if (whole === 270) return [0, -1];
  const angle = (whole * Math.PI) / 180;
  return [Math.cos(angle), Math.sin(angle)];
}

/** `point` turned `degrees` anticlockwise about `about`. */
export function turnedPoint(point: PagePoint, about: PagePoint, degrees: number): PagePoint {
  const [cos, sin] = cosSinOf(degrees);
  const dx = point.x - about.x;
  const dy = point.y - about.y;
  return { x: about.x + cos * dx - sin * dy, y: about.y + sin * dx + cos * dy };
}

/** A box's middle. */
export const middleOf = ([left, bottom, right, top]: Box): PagePoint => ({
  x: (left + right) / 2,
  y: (bottom + top) / 2,
});

/** The bounds of `rect` turned `turn` about its middle: the box it shows; `rect` itself upright. */
export function turnedBounds(rect: Box, turn: number | undefined): Box {
  if (!turn) return rect;
  const [cos, sin] = cosSinOf(turn).map(Math.abs) as [number, number];
  const { x, y } = middleOf(rect);
  const wide = rect[2] - rect[0];
  const high = rect[3] - rect[1];
  const halfWide = (cos * wide + sin * high) / 2;
  const halfHigh = (sin * wide + cos * high) / 2;
  return [x - halfWide, y - halfHigh, x + halfWide, y + halfHigh];
}
