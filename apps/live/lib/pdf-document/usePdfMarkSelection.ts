'use client';

// The marks a person has selected (docs/specs/035-pdf-documents/marks.md "Changing a mark"): a press selects a mark,
// ⇧ adds one or takes one out, and a selection holds the marks of one page; a mark selected lets a text selection go,
// and text selected lets the marks go. The selection moved, by a drag or an arrow key, and deleted, by Delete or
// Edit > Delete, and a mark resized by a handle or ⌥ with an arrow key, each one step of the person's undo. Marks are Reviewing's: while `marking` is off nothing is chosen.
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { Mark, MarkPlace, PagePoint } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  deleteMarks,
  MARK_KIND_NAMES,
  moveMarks,
  NO_FILE_MARKS,
  reshapeMark,
} from './pdf-mark-change';
import {
  changeableOnPage,
  type PdfChangeableByPage,
  type PdfChangeableStore,
} from './pdf-changeable-marks';
import { DELETE_MARKS } from './pdf-menus';
import type { PdfDocumentOpen } from './usePdfDocument';
import type { PdfTextSelected } from './usePdfTextSelection';

type Ready = Pick<Extract<PdfDocumentOpen, { phase: 'ready' }>, 'pages' | 'binding' | 'undo'>;

/** The marks selected: their page's index, and their ids. */
export type PdfMarksChosen = { readonly page: number; readonly ids: readonly string[] };

/** What a page does with its marks while they may be changed. */
export type PdfPageChoosing = {
  /** A press on a mark of the page at `index`; `shift` adds it, or takes it out. */
  readonly choose: (index: number, id: string, shift: boolean) => void;
  /** A press on nothing: the marks go. */
  readonly letGo: () => void;
  /** Escape: the marks go, and the pages take the keys. */
  readonly leave: () => void;
  /** The selection on the page at `index` moved by `by`, in page space, held on the page already. */
  readonly move: (index: number, by: PagePoint) => void;
  /** A mark of the page at `index` given new geometry by a handle or ⌥ with an arrow key. */
  readonly reshape: (index: number, id: string, place: MarkPlace) => void;
  /** The selection deleted. */
  readonly remove: () => void;
};

const NO_MARKS: PdfChangeableByPage = new Map();
const neverChanges = () => () => {};
const noMarks = () => NO_MARKS;

/** What of `chosen` is still there to change: a mark someone deleted, or an undo took, is not. */
function present(
  chosen: PdfMarksChosen | null,
  byPage: PdfChangeableByPage,
  pages: Ready['pages'],
): PdfMarksChosen | null {
  const page = chosen ? pages[chosen.page] : undefined;
  if (!chosen || !page) return null;
  const there = new Set(changeableOnPage(byPage, page.name).marks.map((mark) => mark.id));
  const ids = chosen.ids.filter((id) => there.has(id));
  if (ids.length === chosen.ids.length) return chosen;
  return ids.length > 0 ? { page: chosen.page, ids } : null;
}

/** The file's own marks of a page a person may change, by id; none before the page is read. */
export function fileOwnOf(
  byPage: PdfChangeableByPage,
  page: Ready['pages'][number]['name'] | undefined,
): ReadonlyMap<string, Mark> {
  if (!page) return NO_FILE_MARKS;
  const { marks, fileOwn } = changeableOnPage(byPage, page);
  return fileOwn.size === 0
    ? NO_FILE_MARKS
    : new Map(marks.filter((mark) => fileOwn.has(mark.id)).map((mark) => [mark.id, mark]));
}

export function usePdfMarkSelection({
  ready,
  marks,
  marking,
  textSelected,
  clearText,
  focusPages,
}: {
  // The open PDF and the marks a person may change, by page; null before it is.
  ready: Ready | null;
  marks: PdfChangeableStore | null;
  // Whether marks may be changed now: Reviewing, for a session that reviews.
  marking: boolean;
  // The text selected on the pages, which a mark selected lets go.
  textSelected: PdfTextSelected | null;
  clearText: () => void;
  // Gives the pages the keys, once the marks go.
  focusPages: () => void;
}) {
  const [held, setHeld] = useState<PdfMarksChosen | null>(null);
  // Text selected lets the marks go (adjusted while rendering, as React has a prop's change met).
  const [textSeen, setTextSeen] = useState(textSelected);
  if (textSelected !== textSeen) {
    setTextSeen(textSelected);
    if (textSelected) setHeld(null);
  }
  const read = marks?.get ?? noMarks;
  const byPage = useSyncExternalStore(marks?.subscribe ?? neverChanges, read, read);
  const chosen = marking && ready ? present(held, byPage, ready.pages) : null;
  // The file's own marks of a page, by id: changed, each is taken as LiveDoc's (marks.md "Changing a mark").
  const fileOwnOn = useCallback(
    (index: number) => fileOwnOf(byPage, ready?.pages[index]?.name),
    [byPage, ready],
  );

  const choose = useCallback(
    (index: number, id: string, shift: boolean) => {
      clearText();
      setHeld((before) => {
        if (!before || before.page !== index) return { page: index, ids: [id] };
        if (!shift) return before.ids.includes(id) ? before : { page: index, ids: [id] };
        if (!before.ids.includes(id)) return { page: index, ids: [...before.ids, id] };
        const ids = before.ids.filter((other) => other !== id);
        return ids.length > 0 ? { page: index, ids } : null;
      });
    },
    [clearText],
  );
  const letGo = useCallback(() => setHeld(null), []);
  const leave = useCallback(() => {
    setHeld(null);
    focusPages();
  }, [focusPages]);

  const move = useCallback(
    (index: number, by: PagePoint) => {
      const page = ready?.pages[index];
      if (!ready || !page || !chosen || chosen.page !== index) return;
      const moved = ready.undo.step({ page: page.name }, () =>
        moveMarks(ready.binding.doc, chosen.ids, by, Date.now(), fileOwnOn(index)),
      );
      if (moved === 0) return;
      debugLog(`[pdf] marks-moved count=${moved}`);
      track('Pdf', 'Changed', 'Mark.Moved');
    },
    [ready, chosen, fileOwnOn],
  );

  const reshape = useCallback(
    (index: number, id: string, place: MarkPlace) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      const kind = ready.undo.step({ page: page.name }, () =>
        reshapeMark(ready.binding.doc, id, place, Date.now(), fileOwnOn(index)),
      );
      if (!kind) return;
      debugLog(`[pdf] mark-resized kind=${kind}`);
      track('Pdf', 'Changed', 'Mark.Resized');
    },
    [ready, fileOwnOn],
  );

  const remove = useCallback(() => {
    const page = chosen ? ready?.pages[chosen.page] : undefined;
    if (!ready || !chosen || !page) return;
    const kinds = ready.undo.step({ page: page.name }, () =>
      deleteMarks(ready.binding.doc, chosen.ids, fileOwnOn(chosen.page)),
    );
    debugLog(`[pdf] marks-deleted count=${kinds.length}`);
    for (const kind of kinds) track('Pdf', 'Deleted', `Mark.${MARK_KIND_NAMES[kind]}`);
    setHeld(null);
    focusPages();
  }, [ready, chosen, focusPages, fileOwnOn]);

  const changing = marking && ready !== null;
  const choosing = useMemo<PdfPageChoosing | null>(
    () => (changing ? { choose, letGo, leave, move, reshape, remove } : null),
    [changing, choose, letGo, leave, move, reshape, remove],
  );
  const actions = useMemo<OfficeActions>(
    () => (changing ? { [DELETE_MARKS]: { run: remove, disabled: chosen === null } } : {}),
    [changing, remove, chosen],
  );

  return { chosen, choosing, actions };
}
