// Marks turned (docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate): every mark of `ids` that turns,
// turned a quarter either way about its middle (Format > Rotate) or to an angle (the rotate handle, Properties' Angle),
// held on its page, as one change under the person's own origin, so it is one step of their undo; a mark of the file's
// own is taken as LiveDoc's in the same change. A mark that does not turn (a Callout, a Drawing, a text mark) is left
// as it is.
import type * as Y from 'yjs';
import {
  Mark as Marks,
  MarkTurn,
  PdfChange,
  type Box,
  type Mark,
  type TurnWay,
} from '@livedoc/pdf-documents';
import { adopting, changeAsOne, markIn } from './pdf-mark-change';

/** Format > Rotate's items, by the way each turns. */
export const TURN_ITEMS: Readonly<Record<string, TurnWay>> = {
  'rotate-clockwise': 'clockwise',
  'rotate-counterclockwise': 'counterclockwise',
};

/** How a turn is asked: a quarter one way, or to stand at an angle, whole degrees anticlockwise (0 upright). */
export type MarkTurnAsked = TurnWay | { readonly to: number };

/** The angle a mark is turned to: a quarter on from where it stands, or the angle asked. */
const angleAsked = (mark: Mark, asked: MarkTurnAsked): number =>
  typeof asked === 'string' ? (MarkTurn.next(MarkTurn.angleOf(mark), asked) ?? 0) : asked.to;

/** One mark turned as the change that makes it; null for a mark that does not turn, or would not change. */
function turnChange(mark: Mark, asked: MarkTurnAsked, page: Box, now: number): PdfChange | null {
  const to = angleAsked(mark, asked);
  const turned = MarkTurn.turned(mark, to, page);
  if (!turned) return null;
  const { turn, ...place } = turned;
  // A mark that turns its points stands at none: a turn to none leaves it as it is.
  if (!Marks.turnsByBox(mark))
    return MarkTurn.normal(to)
      ? PdfChange.changeMark(mark.id, { ...place, modifiedAt: now })
      : null;
  if (turn === mark.turn && 'rect' in place && place.rect.every((n, at) => n === mark.rect[at]))
    return null;
  return turn
    ? PdfChange.changeMark(mark.id, { ...place, turn, modifiedAt: now })
    : { root: 'marks', id: mark.id, set: { ...place, modifiedAt: now }, unset: ['turn'] };
}

/** The marks of `ids` turned as asked on `page` as one change, `now` their time of change; answers how many. */
export function turnMarks(
  doc: Y.Doc,
  ids: readonly string[],
  asked: MarkTurnAsked,
  page: Box,
  now: number,
  fileOwn: ReadonlyMap<string, Mark>,
): number {
  let turned = 0;
  const changes = ids.flatMap((id) => {
    const mark = markIn(doc, id, fileOwn);
    const change = mark ? turnChange(mark, asked, page, now) : null;
    if (!mark || !change) return [];
    turned += 1;
    return [...adopting(doc, mark), change];
  });
  return changeAsOne(doc, changes) ? turned : 0;
}
