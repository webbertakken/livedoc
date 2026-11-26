// Making a Polygon, a Cloud or Connected lines (docs/specs/035-pdf-documents/marks.md "Making a mark"): a corner a
// press on one page. A press on its first corner closes a Polygon or a Cloud; a press within PDF_SHAPE_MIN_PT of the
// last corner adds none; the corner that reaches PDF_POLYGON_MAX_CORNERS ends it; a press on another page lets it go and begins
// afresh there. What it ends as is a mark's geometry in page space, or nothing for too few corners. Pure.
import {
  PDF_POLYGON_MAX_CORNERS,
  PDF_SHAPE_MIN_PT,
  type PagePoint,
  type PolyMarkKind,
  type PolyShape,
} from '@livedoc/pdf-documents';
import type { ToolLine } from './pdf-tool-look';

/** A Polygon, a Cloud or Connected lines being made: its kind, its page and its corners so far, in page space. */
export type PolyDraft = {
  readonly kind: PolyMarkKind;
  readonly page: number;
  readonly corners: readonly PagePoint[];
};

/** What a press does: the shape so far, and, where the press ends it, what it ended as. */
export type PolyPressed = { readonly draft: PolyDraft | null; readonly ended: PolyDraft | null };

/** One press of a corner: on page `index` at `at`; `reach` the page-space distance a press still lands on a corner. */
export type CornerPress = {
  readonly index: number;
  readonly at: PagePoint;
  readonly reach: number;
};

const apart = (a: PagePoint, b: PagePoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The fewest corners a kind's mark has: 2 for Connected lines, 3 for a Polygon or a Cloud. */
export const leastCorners = (kind: PolyMarkKind): number => (kind === 'polyline' ? 2 : 3);

/** A press with a corner tool in hand, given the shape so far. */
export function pressCorner(
  kind: PolyMarkKind,
  draft: PolyDraft | null,
  { index, at, reach }: CornerPress,
): PolyPressed {
  if (!draft || draft.kind !== kind || draft.page !== index)
    return { draft: { kind, page: index, corners: [at] }, ended: null };
  const { corners } = draft;
  const closes =
    kind !== 'polyline' && corners.length >= leastCorners(kind) && apart(at, corners[0]!) <= reach;
  if (closes) return { draft: null, ended: draft };
  if (apart(at, corners.at(-1)!) < PDF_SHAPE_MIN_PT) return { draft, ended: null };
  const next = { ...draft, corners: [...corners, at] };
  return next.corners.length >= PDF_POLYGON_MAX_CORNERS
    ? { draft: null, ended: next }
    : { draft: next, ended: null };
}

/** Backspace: the last corner taken back; nothing left once the first goes. */
export const takeBackCorner = (draft: PolyDraft): PolyDraft | null =>
  draft.corners.length > 1 ? { ...draft, corners: draft.corners.slice(0, -1) } : null;

const flat = (corners: readonly PagePoint[]): number[] => corners.flatMap(({ x, y }) => [x, y]);

/** What a shape ends as in a tool's line: its geometry, or null for fewer corners than its kind's least. */
export function polyShapeOf(
  draft: PolyDraft,
  line: ToolLine & { width: number },
): PolyShape | null {
  if (draft.corners.length < leastCorners(draft.kind)) return null;
  return {
    kind: draft.kind,
    corners: flat(draft.corners),
    width: line.width,
    ...(line.lineStyle ? { lineStyle: line.lineStyle } : {}),
    ...(line.fill && draft.kind !== 'polyline' ? { fill: line.fill } : {}),
  };
}

/**
 * The shape so far as a page shows it, on to the pointer where there is one: its kind's own once it has corners
 * enough, open Connected lines before; null for a lone corner.
 */
export function polyDraftShape(
  draft: PolyDraft,
  pointer: PagePoint | null,
  line: ToolLine & { width: number },
): PolyShape | null {
  const last = draft.corners.at(-1)!;
  const corners =
    pointer && apart(pointer, last) >= PDF_SHAPE_MIN_PT
      ? [...draft.corners, pointer]
      : draft.corners;
  if (corners.length < 2) return null;
  const closed = draft.kind !== 'polyline' && corners.length >= leastCorners(draft.kind);
  return polyShapeOf(
    { ...draft, kind: closed ? draft.kind : 'polyline', corners },
    closed ? line : { width: line.width, ...(line.lineStyle ? { lineStyle: line.lineStyle } : {}) },
  );
}
