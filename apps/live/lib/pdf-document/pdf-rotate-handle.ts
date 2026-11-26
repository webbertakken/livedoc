// The rotate handle (docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate, The handle): where it shows, a
// gap above the top of the selected mark's box as it shows, joined to that top's middle by a line; and the turn a drag
// of it asks for, the pointer's angle about the mark's middle snapped to PDF_ROTATE_SNAP_DEGREES, as the mark would
// then stand. View space is the overlay's: page points as the page shows, y down.
import {
  Mark,
  MarkTurn,
  PageView,
  type Box,
  type MarkTurned,
  type PageMatrix,
  type PagePoint,
} from '@livedoc/pdf-documents';

/** Where the handle shows: its foot on the top of the box and the handle itself, in view space. */
export type RotateHandlePlace = { readonly foot: PagePoint; readonly at: PagePoint };

/** A rotate drag as it stands: the angle asked (whole degrees; a mark that turns its points, by how far) and the mark
 *  as it would stand, its angle explicit so an upright draft takes a turned mark's away. */
export type RotateDraft = { readonly to: number; readonly place: MarkTurned };

/** The middle a mark turns about, in page space: a boxed mark's box's, else its bounds'. */
export function turnMiddleOf(mark: Mark): PagePoint {
  const [left, bottom, right, top] = Mark.turnsByBox(mark) ? mark.rect : Mark.bounds(mark);
  return { x: (left + right) / 2, y: (bottom + top) / 2 };
}

/**
 * Where a mark's rotate handle shows, `gap` view units above the top of its box as it shows: a boxed mark's own top,
 * turned with it; a mark that turns its points, the top of its bounds on the page as it shows.
 */
export function rotateHandlePlace(
  mark: Mark,
  matrix: PageMatrix,
  gap: number,
): RotateHandlePlace | null {
  if (!Mark.turns(mark)) return null;
  const middle = PageView.toView(matrix, turnMiddleOf(mark));
  const foot = Mark.turnsByBox(mark)
    ? PageView.toView(
        matrix,
        MarkTurn.fromFrame({ x: turnMiddleOf(mark).x, y: mark.rect[3] }, mark),
      )
    : topOfShown(matrix, Mark.bounds(mark));
  const dx = foot.x - middle.x;
  const dy = foot.y - middle.y;
  const length = Math.hypot(dx, dy);
  // A box of no height has no top to stand out from: the handle stands straight up from its middle.
  const [ux, uy] = length === 0 ? [0, -1] : [dx / length, dy / length];
  return { foot, at: { x: foot.x + ux * gap, y: foot.y + uy * gap } };
}

/** The middle of the top of a box of page space as it shows. */
function topOfShown(matrix: PageMatrix, [left, bottom, right, top]: Box): PagePoint {
  const corners = [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: left, y: top },
    { x: right, y: top },
  ].map((corner) => PageView.toView(matrix, corner));
  const xs = corners.map((corner) => corner.x);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...corners.map((c) => c.y)) };
}

const degreesOf = (from: PagePoint, to: PagePoint): number =>
  (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

/**
 * The turn a drag of the handle from `rest` to `pointer` (both page space) asks for on `page`: how far the pointer has
 * swung about the mark's middle from where the handle stood, added to the angle the mark stands at, snapped; null for
 * a mark that does not turn.
 */
export function rotateDraft(
  mark: Mark,
  rest: PagePoint,
  pointer: PagePoint,
  page: Box,
): RotateDraft | null {
  if (!Mark.turns(mark)) return null;
  const middle = turnMiddleOf(mark);
  const swung = degreesOf(middle, pointer) - degreesOf(middle, rest);
  const to = MarkTurn.snap(MarkTurn.angleOf(mark) + swung) ?? 0;
  const turned = MarkTurn.turned(mark, to, page);
  if (!turned) return null;
  return {
    to,
    place: Mark.turnsByBox(mark) ? { ...turned, turn: turned.turn } : turned,
  };
}

/** A turned mark's own box as it shows: upright about its middle, in view space, and the angle it is turned on screen. */
export type TurnedViewBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Clockwise on screen, as CSS turns. */
  readonly degrees: number;
};

/** A boxed mark's box turned with it, as it shows; null for a mark upright or with no box to turn. */
export function turnedViewBox(mark: Mark, matrix: PageMatrix): TurnedViewBox | null {
  if (!Mark.turnsByBox(mark) || !MarkTurn.angleOf(mark)) return null;
  const middle = turnMiddleOf(mark);
  const [, , right, top] = mark.rect;
  const centre = PageView.toView(matrix, middle);
  const along = (x: number, y: number) => {
    const at = PageView.toView(matrix, MarkTurn.fromFrame({ x, y }, mark));
    return { x: at.x - centre.x, y: at.y - centre.y };
  };
  const across = along(right, middle.y);
  const up = along(middle.x, top);
  const halfWide = Math.hypot(across.x, across.y);
  const halfHigh = Math.hypot(up.x, up.y);
  return {
    x: centre.x - halfWide,
    y: centre.y - halfHigh,
    width: 2 * halfWide,
    height: 2 * halfHigh,
    degrees: (Math.atan2(across.y, across.x) * 180) / Math.PI,
  };
}
