// Where a mark lies on its page, and the mark moved (docs/specs/035-pdf-documents/marks.md "Changing a mark"): each
// kind's geometry as the live changes hold it, moved whole by an offset in page space, and that offset held so the
// marks moved stay on their page. A text mark is not moved: it is the glyphs it covers. Pure geometry.
import type { PagePoint } from './engine-contract';
import { Mark, type Box, type CalloutLine, type Segment, type Stroke } from './mark';

/** A mark's geometry, the properties that place it: what a move changes. */
export type MarkPlace =
  | { readonly strokes: readonly Stroke[] }
  | { readonly line: Segment }
  | { readonly corners: Stroke }
  | { readonly rect: Box }
  | { readonly rect: Box; readonly callout: CalloutLine };

/** Every x, y of a flat list moved by an offset. */
const shift = <List extends readonly number[]>(flat: List, by: PagePoint): List =>
  flat.map((n, at) => n + (at % 2 === 0 ? by.x : by.y)) as unknown as List;

const within = (n: number, low: number, high: number): number =>
  Math.min(Math.max(n, Math.min(low, 0)), Math.max(high, 0));

export const MarkPlace = {
  /** Whether a mark is moved by a drag or the arrow keys: every kind but those that mark text. */
  isMovable: (mark: Mark): boolean => !Mark.isText(mark),

  /** The mark's geometry moved by `by`, in page space; null for a text mark. */
  moved: (mark: Mark, by: PagePoint): MarkPlace | null => {
    if (Mark.isText(mark)) return null;
    if (mark.kind === 'drawing') return { strokes: mark.strokes.map((s) => shift(s, by)) };
    if ('line' in mark) return { line: shift(mark.line, by) };
    if ('corners' in mark) return { corners: shift(mark.corners, by) };
    if (mark.kind === 'callout')
      return { rect: shift(mark.rect, by), callout: shift(mark.callout, by) };
    return { rect: shift(mark.rect, by) };
  },

  /**
   * `by` cut so the movable marks, together, stay within `page` (`[left, bottom, right, top]`); marks already past an
   * edge may come back towards it, never go further.
   */
  held: (marks: readonly Mark[], by: PagePoint, page: Box): PagePoint => {
    const movable = marks.filter(MarkPlace.isMovable);
    if (movable.length === 0) return by;
    const bounds = movable.map(Mark.bounds);
    const left = Math.min(...bounds.map((b) => b[0]));
    const bottom = Math.min(...bounds.map((b) => b[1]));
    const right = Math.max(...bounds.map((b) => b[2]));
    const top = Math.max(...bounds.map((b) => b[3]));
    return {
      x: within(by.x, page[0] - left, page[2] - right) + 0,
      y: within(by.y, page[1] - bottom, page[3] - top) + 0,
    };
  },
} as const;
