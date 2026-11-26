// A stamp's quarter turns made (docs/specs/035-pdf-documents/marks.md "Changing a mark": A stamp's quarter turns): every
// selected stamp turned a quarter about its middle, held on its page, as one change under the person's own origin, so
// it is one step of their undo; a stamp of the file's own is taken as LiveDoc's in the same change. Any other mark
// selected is left as it is.
import type * as Y from 'yjs';
import { PdfChange, StampTurn, type Box, type Mark, type TurnWay } from '@livedoc/pdf-documents';
import { adopting, changeAsOne, markIn } from './pdf-mark-change';

/** Format > Rotate's items, by the way each turns. */
export const TURN_ITEMS: Readonly<Record<string, TurnWay>> = {
  'rotate-clockwise': 'clockwise',
  'rotate-counterclockwise': 'counterclockwise',
};

/** The stamps of `ids` turned a quarter `way` on `page` as one change, `now` their time of change; answers how many. */
export function turnStamps(
  doc: Y.Doc,
  ids: readonly string[],
  way: TurnWay,
  page: Box,
  now: number,
  fileOwn: ReadonlyMap<string, Mark>,
): number {
  let turned = 0;
  const changes = ids.flatMap((id) => {
    const mark = markIn(doc, id, fileOwn);
    if (mark?.kind !== 'stamp') return [];
    turned += 1;
    const { turn, rect } = StampTurn.turned(mark, way, page);
    const change: PdfChange = turn
      ? PdfChange.changeMark(id, { turn, rect, modifiedAt: now })
      : { root: 'marks', id, set: { rect, modifiedAt: now }, unset: ['turn'] };
    return [...adopting(doc, mark), change];
  });
  return changeAsOne(doc, changes) ? turned : 0;
}
