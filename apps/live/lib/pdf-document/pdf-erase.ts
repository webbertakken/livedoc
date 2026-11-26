// Erase made into changes (docs/specs/035-pdf-documents/marks.md "Changing a mark": Erase): the strokes a drag passed
// over rubbed out of each Drawing as one change under the person's own origin, so it is one step of their undo; a
// Drawing left with none is deleted. A Drawing of the file's own is taken as LiveDoc's in the same change, as any
// change takes it, or named gone.
import type * as Y from 'yjs';
import {
  MarkErase,
  PdfChange,
  PdfLiveChanges,
  type DrawingMark,
  type Mark,
} from '@livedoc/pdf-documents';
import { adopting, changeAsOne, markIn } from './pdf-mark-change';

/** The strokes of one Drawing a drag passed over, by place, and the Drawing as the page had it. */
export type Erased = { readonly mark: DrawingMark; readonly gone: readonly number[] };

/** What one erase did: the strokes rubbed out, the Drawings they were of, and of those the ones deleted. */
export type EraseCount = { readonly strokes: number; readonly marks: number; readonly deleted: number };

const NONE: EraseCount = { strokes: 0, marks: 0, deleted: 0 };

/** The strokes named rubbed out as one change, `now` the time of change; answers what was done, nothing where none. */
export function eraseStrokes(doc: Y.Doc, erased: readonly Erased[], now: number): EraseCount {
  let count = NONE;
  const changes = erased.flatMap(({ mark: shown, gone }) => {
    const mark: Mark | null = markIn(doc, shown.id, new Map([[shown.id, shown]]));
    if (mark?.kind !== 'drawing' || gone.length === 0) return [];
    const left = MarkErase.without(mark, gone);
    const lost = mark.strokes.length - (left?.strokes.length ?? 0);
    count = {
      strokes: count.strokes + lost,
      marks: count.marks + 1,
      deleted: count.deleted + (left ? 0 : 1),
    };
    if (left) return [...adopting(doc, mark), PdfChange.changeMark(mark.id, { ...left, modifiedAt: now })];
    return [
      PdfLiveChanges.mark(doc, mark.id)
        ? PdfChange.removeMark(mark.id)
        : PdfChange.removeFromFile(mark.id, 'mark'),
    ];
  });
  return changeAsOne(doc, changes) ? count : NONE;
}
