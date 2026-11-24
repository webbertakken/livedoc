// Changing marks made here (docs/specs/035-pdf-documents/marks.md "Changing a mark"): the selected marks moved whole by
// an offset in page space, or deleted, each as one change under the person's own origin, so it is one step of their
// undo. Each move is made from the mark as the live changes hold it now, never from what the page last drew.
import type * as Y from 'yjs';
import {
  MarkPlace,
  PdfChange,
  PdfLiveChanges,
  type MarkKind,
  type MarkPlace as Place,
  type PagePoint,
} from '@livedoc/pdf-documents';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

/** Each kind's name in telemetry (marks.md "Telemetry and observability": `Mark.<Kind>`), as its making names it. */
export const MARK_KIND_NAMES = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'Strikethrough',
  squiggly: 'SquigglyUnderline',
  drawing: 'Drawing',
  line: 'Line',
  arrow: 'Arrow',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  callout: 'Callout',
  stamp: 'Stamp',
} as const satisfies Readonly<Record<MarkKind, string>>;

/** Each kind's name as a person reads it: a mark's control is named for it (marks.md "Keyboard and accessibility"). */
export const MARK_KIND_LABELS = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'Strikethrough',
  squiggly: 'Squiggly underline',
  drawing: 'Drawing',
  line: 'Line',
  arrow: 'Arrow',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  callout: 'Callout',
  stamp: 'Stamp',
} as const satisfies Readonly<Record<MarkKind, string>>;

/** A mark's control's name: its kind and who made it, "Highlight by Ada Lovelace". */
export const markControlName = (mark: { kind: MarkKind; author: string }): string =>
  mark.author.trim()
    ? `${MARK_KIND_LABELS[mark.kind]} by ${mark.author.trim()}`
    : MARK_KIND_LABELS[mark.kind];

/** The marks of `ids` moved by `by` as one change, `now` their time of change; answers how many moved. */
export function moveMarks(doc: Y.Doc, ids: readonly string[], by: PagePoint, now: number): number {
  if (by.x === 0 && by.y === 0) return 0;
  const moves = ids.flatMap((id) => {
    const mark = PdfLiveChanges.mark(doc, id);
    const place = mark ? MarkPlace.moved(mark, by) : null;
    return place ? [PdfChange.changeMark(id, { ...place, modifiedAt: now })] : [];
  });
  if (moves.length > 0)
    doc.transact(() => {
      for (const move of moves) PdfChange.apply(doc, move, PDF_LOCAL_ORIGIN);
    }, PDF_LOCAL_ORIGIN);
  return moves.length;
}

/** A mark given new geometry as one change, `now` its time of change; answers its kind, or null where it is gone. */
export function reshapeMark(doc: Y.Doc, id: string, place: Place, now: number): MarkKind | null {
  const mark = PdfLiveChanges.mark(doc, id);
  if (!mark) return null;
  PdfChange.apply(doc, PdfChange.changeMark(id, { ...place, modifiedAt: now }), PDF_LOCAL_ORIGIN);
  return mark.kind;
}

/** The marks of `ids` deleted as one change; answers the kind of each deleted, in the order named. */
export function deleteMarks(doc: Y.Doc, ids: readonly string[]): MarkKind[] {
  const there = ids.flatMap((id) => {
    const mark = PdfLiveChanges.mark(doc, id);
    return mark ? [mark] : [];
  });
  if (there.length > 0)
    doc.transact(() => {
      for (const mark of there) PdfLiveChanges.removeMark(doc, mark.id, PDF_LOCAL_ORIGIN);
    }, PDF_LOCAL_ORIGIN);
  return there.map((mark) => mark.kind);
}
