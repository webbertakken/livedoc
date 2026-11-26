// Changing marks made here (docs/specs/035-pdf-documents/marks.md "Changing a mark"): the selected marks moved whole by
// an offset in page space, or deleted, each as one change under the person's own origin, so it is one step of their
// undo. Each move is made from the mark as the live changes hold it now, never from what the page last drew. A mark
// the file arrived with is reached too, as LiveDoc reads it (`fileOwn`): changed, it is taken as LiveDoc's in the same
// step, under its own id, and the file's own named gone; deleted, it is named gone.
import type * as Y from 'yjs';
import {
  MARK_KIND_LABELS,
  MarkPlace,
  PdfChange,
  PdfChangeset,
  PdfLiveChanges,
  type Mark,
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
  polygon: 'Polygon',
  cloud: 'Cloud',
  polyline: 'ConnectedLines',
  text: 'Text',
  callout: 'Callout',
  stamp: 'Stamp',
} as const satisfies Readonly<Record<MarkKind, string>>;

export { MARK_KIND_LABELS };

/** A mark's control's name: its kind and who made it, "Highlight by Ada Lovelace". */
export const markControlName = (mark: { kind: MarkKind; author: string }): string =>
  mark.author.trim()
    ? `${MARK_KIND_LABELS[mark.kind]} by ${mark.author.trim()}`
    : MARK_KIND_LABELS[mark.kind];

/** No mark of the file's own: only LiveDoc's are reached. */
export const NO_FILE_MARKS: ReadonlyMap<string, Mark> = new Map();

/** A mark by id: LiveDoc's as the live changes hold it now, else the file's own as LiveDoc reads it; null where gone. */
export const markIn = (doc: Y.Doc, id: string, fileOwn: ReadonlyMap<string, Mark>): Mark | null =>
  PdfLiveChanges.mark(doc, id) ?? fileOwn.get(id) ?? null;

/**
 * What takes a mark as LiveDoc's before it is changed (marks.md "Changing a mark"): for the file's own, the mark as
 * LiveDoc reads it under its own id, and the file's own named gone; nothing for one that is LiveDoc's already.
 */
export const adopting = (doc: Y.Doc, mark: Mark): PdfChange[] =>
  PdfLiveChanges.mark(doc, mark.id)
    ? []
    : [PdfChange.removeFromFile(mark.id, 'mark'), PdfChange.addMark(mark)];

/** Makes the changes as one step of the person's own; answers whether they were made, none being refused. */
export const changeAsOne = (doc: Y.Doc, changes: readonly PdfChange[]): boolean =>
  changes.length > 0 && PdfChangeset.apply(doc, changes, PDF_LOCAL_ORIGIN).ok;

/** The marks of `ids` moved by `by` as one change, `now` their time of change; answers how many moved. */
export function moveMarks(
  doc: Y.Doc,
  ids: readonly string[],
  by: PagePoint,
  now: number,
  fileOwn: ReadonlyMap<string, Mark> = NO_FILE_MARKS,
): number {
  if (by.x === 0 && by.y === 0) return 0;
  let moved = 0;
  const changes = ids.flatMap((id) => {
    const mark = markIn(doc, id, fileOwn);
    const place = mark ? MarkPlace.moved(mark, by) : null;
    if (!mark || !place) return [];
    moved += 1;
    return [...adopting(doc, mark), PdfChange.changeMark(id, { ...place, modifiedAt: now })];
  });
  return changeAsOne(doc, changes) ? moved : 0;
}

/** A mark given new geometry as one change, `now` its time of change; answers its kind, or null where it is gone. */
export function reshapeMark(
  doc: Y.Doc,
  id: string,
  place: Place,
  now: number,
  fileOwn: ReadonlyMap<string, Mark> = NO_FILE_MARKS,
): MarkKind | null {
  const mark = markIn(doc, id, fileOwn);
  if (!mark) return null;
  const changes = [...adopting(doc, mark), PdfChange.changeMark(id, { ...place, modifiedAt: now })];
  return changeAsOne(doc, changes) ? mark.kind : null;
}

/**
 * The marks of `ids` deleted as one change, the file's own named gone; answers the kind of each deleted, in the order
 * named.
 */
export function deleteMarks(
  doc: Y.Doc,
  ids: readonly string[],
  fileOwn: ReadonlyMap<string, Mark> = NO_FILE_MARKS,
): MarkKind[] {
  const there = ids.flatMap((id) => {
    const mark = markIn(doc, id, fileOwn);
    return mark ? [mark] : [];
  });
  const changes = there.map((mark) =>
    PdfLiveChanges.mark(doc, mark.id)
      ? PdfChange.removeMark(mark.id)
      : PdfChange.removeFromFile(mark.id, 'mark'),
  );
  return changeAsOne(doc, changes) ? there.map((mark) => mark.kind) : [];
}

/** The marks of `ids` given `group` as one change, `now` their time of change; answers how many it reached. */
export function groupMarks(
  doc: Y.Doc,
  ids: readonly string[],
  group: string,
  now: number,
  fileOwn: ReadonlyMap<string, Mark> = NO_FILE_MARKS,
): number {
  const there = ids.flatMap((id) => {
    const mark = markIn(doc, id, fileOwn);
    return mark ? [mark] : [];
  });
  const changes = there.flatMap((mark) => [
    ...adopting(doc, mark),
    PdfChange.changeMark(mark.id, { group, modifiedAt: now }),
  ]);
  return changeAsOne(doc, changes) ? there.length : 0;
}

/** The marks of `ids` in a group taken out of it as one change; answers how many were. */
export function ungroupMarks(
  doc: Y.Doc,
  ids: readonly string[],
  now: number,
  fileOwn: ReadonlyMap<string, Mark> = NO_FILE_MARKS,
): number {
  const grouped = ids.flatMap((id) => {
    const mark = markIn(doc, id, fileOwn);
    return mark?.group ? [mark] : [];
  });
  const changes = grouped.flatMap((mark): PdfChange[] => [
    ...adopting(doc, mark),
    { root: 'marks', id: mark.id, set: { modifiedAt: now }, unset: ['group'] },
  ]);
  return changeAsOne(doc, changes) ? grouped.length : 0;
}
