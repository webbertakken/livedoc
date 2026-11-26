'use client';

// The marks a person has selected (docs/specs/035-pdf-documents/marks.md "Changing a mark"): a press selects a mark,
// ⇧ adds one or takes one out, and a selection holds the marks of one page; a mark selected lets a text selection go,
// and text selected lets the marks go. The selection moved, by a drag or an arrow key, and deleted, by Delete or
// Edit > Delete, and a mark resized by a handle or ⌥ with an arrow key, each one step of the person's undo. A press on a
// grouped mark selects its group, and Format > Group and Ungroup make the selection one or take it apart. Marks are
// Reviewing's: while `marking` is off nothing is chosen; and a mark the session may not change (a Participant's
// another's, marks.md "Share roles") is never chosen.
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  MarkGroups,
  type Box,
  type Mark,
  type MarkPlace,
  type PagePoint,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  deleteMarks,
  groupMarks,
  MARK_KIND_NAMES,
  moveMarks,
  NO_FILE_MARKS,
  reshapeMark,
  ungroupMarks,
} from './pdf-mark-change';
import {
  changeableOnPage,
  type PdfChangeableByPage,
  type PdfChangeableStore,
} from './pdf-changeable-marks';
import { DELETE_MARKS, GROUP_MARKS, UNGROUP_MARKS } from './pdf-menus';
import type { PdfDocumentOpen } from './usePdfDocument';
import type { PdfTextSelected } from './usePdfTextSelection';
import { turnMarksOn } from './pdf-mark-turn-step';

type Ready = Pick<Extract<PdfDocumentOpen, { phase: 'ready' }>, 'pages' | 'binding' | 'undo'>;

/** The marks selected: their page's index, and their ids. */
export type PdfMarksChosen = { readonly page: number; readonly ids: readonly string[] };

/** What a page does with its marks while they may be changed. */
export type PdfPageChoosing = {
  /** Whether this session may change `mark`: a press on one it may not falls to the page beneath. */
  readonly mayChange: (mark: Mark) => boolean;
  /** A press on a mark of the page at `index`; `shift` adds it, or takes it out. */
  readonly choose: (index: number, id: string, shift: boolean) => void;
  /** A box drawn from empty space on the page at `index` let go over the marks of `ids`; `add` (⇧) joins them. */
  readonly chooseAll: (index: number, ids: readonly string[], add: boolean) => void;
  /** A press on nothing: the marks go. */
  readonly letGo: () => void;
  /** Escape: the marks go, and the pages take the keys. */
  readonly leave: () => void;
  /** The selection on the page at `index` moved by `by`, in page space, held on the page already. */
  readonly move: (index: number, by: PagePoint) => void;
  /** A mark of the page at `index` given new geometry by a handle or ⌥ with an arrow key. */
  readonly reshape: (index: number, id: string, place: MarkPlace) => void;
  /** A mark of the page at `index` turned by its rotate handle to `to` (a mark that turns its points, by it), held on
   *  `page` (marks.md "Changing a mark": Rotate). */
  readonly turn: (index: number, id: string, to: number, page: Box) => void;
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
  mayChange,
  textSelected,
  clearText,
  focusPages,
}: {
  // The open PDF and the marks a person may change, by page; null before it is.
  ready: Ready | null;
  marks: PdfChangeableStore | null;
  // Whether marks may be changed now: Reviewing, for a session that reviews.
  marking: boolean;
  // Whether this session may change a mark: an Editor any, a Participant their own (marks.md "Share roles").
  mayChange: (mark: Mark) => boolean;
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

  // The marks of a page, and the ids given widened to their whole groups, of the marks this session may change.
  const marksOn = useCallback(
    (index: number): readonly Mark[] => {
      const page = ready?.pages[index];
      return page ? changeableOnPage(byPage, page.name).marks : [];
    },
    [ready, byPage],
  );
  const widened = useCallback(
    (there: readonly Mark[], ids: readonly string[]) =>
      MarkGroups.widen(there, ids).filter((id) => {
        const mark = there.find((each) => each.id === id);
        return mark !== undefined && mayChange(mark);
      }),
    [mayChange],
  );

  const choose = useCallback(
    (index: number, id: string, shift: boolean) => {
      const there = marksOn(index);
      const mark = there.find((each) => each.id === id);
      if (!mark || !mayChange(mark)) return;
      const group = widened(there, [id]);
      clearText();
      setHeld((before) => {
        if (!before || before.page !== index) return { page: index, ids: group };
        if (!shift) return before.ids.includes(id) ? before : { page: index, ids: group };
        if (!before.ids.includes(id))
          return {
            page: index,
            ids: [...before.ids, ...group.filter((other) => !before.ids.includes(other))],
          };
        const ids = before.ids.filter((other) => !group.includes(other));
        return ids.length > 0 ? { page: index, ids } : null;
      });
    },
    [clearText, marksOn, widened, mayChange],
  );
  const chooseAll = useCallback(
    (index: number, ids: readonly string[], add: boolean) => {
      const there = marksOn(index);
      const taken = widened(
        there,
        there.filter((mark) => ids.includes(mark.id) && mayChange(mark)).map((mark) => mark.id),
      );
      debugLog(`[pdf] marks-boxed count=${taken.length}`);
      if (taken.length > 0) clearText();
      setHeld((before) => {
        const kept = add && before?.page === index ? before.ids : [];
        const joined = [...kept, ...taken.filter((id) => !kept.includes(id))];
        if (joined.length > 0) return { page: index, ids: joined };
        return add ? before : null;
      });
    },
    [clearText, marksOn, widened, mayChange],
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

  const turn = useCallback(
    (index: number, id: string, to: number, box: Box) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      turnMarksOn({
        ready,
        page,
        box,
        ids: [id],
        asked: { to },
        way: 'handle',
        fileOwn: fileOwnOn(index),
      });
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

  const group = useCallback(() => {
    const page = chosen ? ready?.pages[chosen.page] : undefined;
    if (!ready || !chosen || !page || chosen.ids.length < 2) return;
    const count = ready.undo.step({ page: page.name }, () =>
      groupMarks(
        ready.binding.doc,
        chosen.ids,
        crypto.randomUUID(),
        Date.now(),
        fileOwnOn(chosen.page),
      ),
    );
    if (count === 0) return;
    debugLog(`[pdf] marks-grouped count=${count}`);
    track('Pdf', 'Changed', 'Mark.Grouped');
  }, [ready, chosen, fileOwnOn]);

  const ungroup = useCallback(() => {
    const page = chosen ? ready?.pages[chosen.page] : undefined;
    if (!ready || !chosen || !page) return;
    const count = ready.undo.step({ page: page.name }, () =>
      ungroupMarks(ready.binding.doc, chosen.ids, Date.now(), fileOwnOn(chosen.page)),
    );
    if (count === 0) return;
    debugLog(`[pdf] marks-ungrouped count=${count}`);
    track('Pdf', 'Changed', 'Mark.Ungrouped');
  }, [ready, chosen, fileOwnOn]);

  const changing = marking && ready !== null;
  const choosing = useMemo<PdfPageChoosing | null>(
    () =>
      changing ? { mayChange, choose, chooseAll, letGo, leave, move, reshape, turn, remove } : null,
    [changing, mayChange, choose, chooseAll, letGo, leave, move, reshape, turn, remove],
  );
  const grouped = chosen !== null && MarkGroups.anyGrouped(marksOn(chosen.page), chosen.ids);
  const actions = useMemo<OfficeActions>(
    () =>
      changing
        ? {
            [DELETE_MARKS]: { run: remove, disabled: chosen === null },
            [GROUP_MARKS]: { run: group, disabled: (chosen?.ids.length ?? 0) < 2 },
            [UNGROUP_MARKS]: { run: ungroup, disabled: !grouped },
          }
        : {},
    [changing, remove, group, ungroup, chosen, grouped],
  );

  return { chosen, choosing, actions };
}
