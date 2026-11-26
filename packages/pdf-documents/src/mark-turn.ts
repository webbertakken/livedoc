// A mark turned (docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate): an angle stepped a quarter, snapped
// to the handle's steps or put in whole degrees; the box a turned mark shows and its upright box found back from it;
// the page matrix that turns its upright drawing into place, as a file's appearance `Matrix` does; a mark turned to an
// angle and held on its page; and a page point in a turned mark's own frame. A stamp, a Text, a Rectangle and an
// Ellipse hold their angle; a Line, an Arrow, a Polygon, a Cloud and Connected lines turn their points, so they stand at
// none. Pure geometry in page space.
import type { PageMatrix, PagePoint } from './engine-contract';
import { PDF_ROTATE_SNAP_DEGREES } from './limits';
import { Mark, type Box } from './mark';
import type { MarkPlace } from './mark-place';
import { cosSinOf, middleOf, turnedBounds, turnedPoint } from './turn-geometry';

/** Which way a turn goes, as Format > Rotate names it. */
export type TurnWay = 'clockwise' | 'counterclockwise';

/** A mark turned: its new place, and for a mark that holds its angle, that angle (absent upright). */
export type MarkTurned = MarkPlace & { readonly turn?: number };

/**
 * (default) How near 45° (or 45° past a quarter) a turn's upright box cannot be found from the box it shows, in
 * degrees: there every box shows the same bounds, so the box is read as a square. Safe range: 0.5 to 3.
 */
const SQUARE_WITHIN_DEGREES = 1;

const within = (low: number, high: number, n: number): number => Math.min(high, Math.max(low, n));

/** A box moved, its size kept, as far as it must to lie on `page`; a box wider than the page keeps its left edge on it. */
function heldOn([left, bottom, right, top]: Box, page: Box): PagePoint {
  return {
    x: within(page[0] - left, Math.max(page[0] - left, page[2] - right), 0) + 0,
    y: within(page[1] - bottom, Math.max(page[1] - bottom, page[3] - top), 0) + 0,
  };
}

const shifted = (flat: readonly number[], by: PagePoint): number[] =>
  flat.map((n, at) => n + (at % 2 === 0 ? by.x : by.y));

/** Flat x, y pairs turned `degrees` about `about`. */
function turnedFlat(flat: readonly number[], about: PagePoint, degrees: number): number[] {
  return flat.flatMap((_, at) => {
    if (at % 2 === 1) return [];
    const { x, y } = turnedPoint({ x: flat[at]!, y: flat[at + 1]! }, about, degrees);
    return [x, y];
  });
}

const boundsOf = (flat: readonly number[]): Box => {
  const xs = flat.filter((_, at) => at % 2 === 0);
  const ys = flat.filter((_, at) => at % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

export const MarkTurn = {
  /** An angle in whole degrees within 0 to 359; upright reads as none. */
  normal: (degrees: number): number | undefined => {
    const whole = ((Math.round(degrees) % 360) + 360) % 360;
    return whole === 0 ? undefined : whole;
  },

  /** An angle taken to the nearest `PDF_ROTATE_SNAP_DEGREES`, within 0 to 359; upright reads as none. */
  snap: (degrees: number): number | undefined =>
    MarkTurn.normal(Math.round(degrees / PDF_ROTATE_SNAP_DEGREES) * PDF_ROTATE_SNAP_DEGREES),

  /** The angle a quarter `way` from `turn`: clockwise takes 90 off, anticlockwise adds it; upright reads as none. */
  next: (turn: number | undefined, way: TurnWay): number | undefined =>
    MarkTurn.normal((turn ?? 0) + (way === 'counterclockwise' ? 90 : -90)),

  /** The angle a mark stands at: a boxed mark's own; one that turns its points stands at none. */
  angleOf: (mark: Mark): number => (Mark.turnsByBox(mark) ? (mark.turn ?? 0) : 0),

  /** The box `rect` shows turned `turn` about its middle: its turned box's bounds. */
  shownBox: (rect: Box, turn: number | undefined): Box => turnedBounds(rect, turn),

  /**
   * The upright box of a mark turned `turn` that shows as `shown`, about the same middle: the bounds undone. Near 45°
   * every box shows alike, so there, and where the bounds fit no box, it reads as a square of the shown width.
   */
  uprightOf: (shown: Box, turn: number | undefined): Box => {
    if (!turn) return shown;
    const [cos, sin] = cosSinOf(turn).map(Math.abs) as [number, number];
    const { x, y } = middleOf(shown);
    const wide = shown[2] - shown[0];
    const high = shown[3] - shown[1];
    const square = Math.abs((turn % 90) - 45) <= SQUARE_WITHIN_DEGREES;
    const across = cos * cos - sin * sin;
    let w = (cos * wide - sin * high) / across;
    let h = (cos * high - sin * wide) / across;
    if (square || !(w > 0 && h > 0)) w = h = wide / (cos + sin);
    return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
  },

  /** The page matrix that turns a mark's upright drawing about its middle into place; null upright. */
  matrix: ({ rect, turn }: { readonly rect: Box; readonly turn?: number }): PageMatrix | null => {
    if (!turn) return null;
    const [cos, sin] = cosSinOf(turn);
    const { x, y } = middleOf(rect);
    return [cos, sin, -sin, cos, x - cos * x + sin * y, y - sin * x - cos * y];
  },

  /**
   * The matrix a mark is drawn by on a view drawn by `view`: its turn of its upright drawing, then the view's; the
   * view's own for a mark upright.
   */
  drawnIn: (view: PageMatrix, mark: Mark): PageMatrix => {
    const turn = Mark.turnsByBox(mark) ? MarkTurn.matrix(mark) : null;
    if (!turn) return view;
    const [a, b, c, d, e, f] = view;
    const [ta, tb, tc, td, te, tf] = turn;
    return [
      a * ta + c * tb,
      b * ta + d * tb,
      a * tc + c * td,
      b * tc + d * td,
      a * te + c * tf + e,
      b * te + d * tf + f,
    ];
  },

  /**
   * `mark` turned to stand at `to` on `page`, moved as far as it must for what it shows to lie on the page; null for a
   * kind left out. A boxed mark keeps its upright box and takes the angle; one that turns its points turns them by `to`
   * about the middle of their bounds.
   */
  turned: (mark: Mark, to: number | undefined, page: Box): MarkTurned | null => {
    const turns = Mark.turns(mark);
    if (turns === 'box') {
      const boxed = mark as Mark & { rect: Box };
      const turn = MarkTurn.normal(to ?? 0);
      const by = heldOn(turnedBounds(boxed.rect, turn), page);
      return { rect: shifted(boxed.rect, by) as unknown as Box, ...(turn ? { turn } : {}) };
    }
    if (turns !== 'points') return null;
    const flat = 'line' in mark ? mark.line : (mark as Mark & { corners: number[] }).corners;
    const turnedPoints = turnedFlat(flat, middleOf(Mark.bounds(mark)), to ?? 0);
    const moved = shifted(turnedPoints, heldOn(boundsOf(turnedPoints), page));
    return 'line' in mark
      ? { line: moved as unknown as Box }
      : { corners: moved as unknown as readonly number[] };
  },

  /** A page point in a boxed mark's own frame, its turn undone about its middle; the point itself upright. */
  toFrame: (point: PagePoint, mark: Mark): PagePoint => {
    const turn = MarkTurn.angleOf(mark);
    if (!turn) return point;
    return turnedPoint(point, middleOf((mark as Mark & { rect: Box }).rect), -turn);
  },

  /** A point of a boxed mark's own frame on the page, turned with it; the point itself upright. */
  fromFrame: (point: PagePoint, mark: Mark): PagePoint => {
    const turn = MarkTurn.angleOf(mark);
    if (!turn) return point;
    return turnedPoint(point, middleOf((mark as Mark & { rect: Box }).rect), turn);
  },
} as const;
