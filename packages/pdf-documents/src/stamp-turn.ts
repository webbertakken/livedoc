// A stamp's quarter turns (docs/specs/035-pdf-documents/marks.md "Changing a mark": A stamp's quarter turns): the turn
// after a quarter either way, the box it then takes on its page, its upright box from the box it shows, and the page
// matrix that turns its upright drawing into place, as a file's appearance `Matrix` does. Pure geometry in page space.
import type { PageMatrix } from './engine-contract';
import { Mark, type Box, type StampMark, type StampTurnDegrees } from './mark';

/** Which way a turn goes, as Format > Rotate names it. */
export type TurnWay = 'clockwise' | 'counterclockwise';

const within = (low: number, high: number, n: number): number => Math.min(high, Math.max(low, n));

/** A box moved, its size kept, as far as it must to lie on `page`; a box wider than the page keeps its left edge on it. */
function heldOn([left, bottom, right, top]: Box, page: Box): Box {
  const dx = within(page[0] - left, Math.max(page[0] - left, page[2] - right), 0);
  const dy = within(page[1] - bottom, Math.max(page[1] - bottom, page[3] - top), 0);
  return [left + dx, bottom + dy, right + dx, top + dy];
}

export const StampTurn = {
  /** The turn a quarter `way` from `turn`: clockwise takes 90 off, anticlockwise adds it; upright reads as none. */
  next: (turn: StampTurnDegrees | undefined, way: TurnWay): StampTurnDegrees | undefined => {
    const degrees = ((turn ?? 0) + (way === 'counterclockwise' ? 90 : 270)) % 360;
    return degrees === 0 ? undefined : (degrees as StampTurnDegrees);
  },

  /** The upright box of a stamp turned `turn` that shows as `shown`: the sides swapped back about its middle. */
  upright: (shown: Box, turn: StampTurnDegrees | undefined): Box =>
    Mark.shownBox({ rect: shown, turn } as StampMark),

  /**
   * A stamp turned a quarter `way` on `page`: its new turn and its upright box, moved as far as it must for the box it
   * then shows to lie on the page.
   */
  turned: (mark: StampMark, way: TurnWay, page: Box): { turn?: StampTurnDegrees; rect: Box } => {
    const turn = StampTurn.next(mark.turn, way);
    const shown = heldOn(Mark.shownBox({ ...mark, turn }), page);
    return { ...(turn ? { turn } : {}), rect: StampTurn.upright(shown, turn) };
  },

  /** The page matrix that turns a stamp's upright drawing about its middle into place; null for an upright one. */
  matrix: ({ rect, turn }: Pick<StampMark, 'rect' | 'turn'>): PageMatrix | null => {
    if (!turn) return null;
    const angle = (turn * Math.PI) / 180;
    const cos = Math.round(Math.cos(angle));
    const sin = Math.round(Math.sin(angle));
    const x = (rect[0] + rect[2]) / 2;
    const y = (rect[1] + rect[3]) / 2;
    return [cos, sin, -sin, cos, x - cos * x + sin * y, y - sin * x - cos * y];
  },
} as const;
