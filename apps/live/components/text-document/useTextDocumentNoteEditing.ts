// Putting footnotes in and editing them (docs/specs/034-text-documents/page-layout.md "Footnotes"): Insert > Footnote
// puts a mark at the caret and enters its new note; a press on a drawn note enters it, the caret where it was pressed;
// the note's source moves into its box at the page's foot (under the writing where there are no pages) and the
// toolbar acts on it. Escape or a press on the body leaves, the caret just after its mark; the mark gone ends it.
// Move to current, next and previous footnote go between marks and notes. Putting in and entering are an Editor's.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import { storyKey } from '@/lib/text-document/pagination/pagination-headers';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';
import { noteWidthAt } from '@/lib/text-document/pagination/pagination-plugin';
import { NOTE_BOX_NUMBER_ATTRIBUTE } from '@/lib/text-document/text-document-footnotes';
import {
  afterMark,
  FOOTNOTE_ITEM,
  insertFootnote,
  markAfter,
  markBefore,
  markBeside,
  marksIn,
  noteStartMarks,
} from '@/lib/text-document/text-document-footnotes-edit';
import type { StorySource } from '@/lib/text-document/text-document-story-sources';
import type { TextDocumentStories } from './useTextDocumentStories';

/** The shortcuts bound here under their own ids (keyboard-shortcuts.md "Comments and footnotes"). */
export const MOVE_TO_CURRENT_FOOTNOTE = 'move-to-current-footnote';
export const MOVE_TO_NEXT_FOOTNOTE = 'move-to-next-footnote';
export const MOVE_TO_PREVIOUS_FOOTNOTE = 'move-to-previous-footnote';
export const FOOTNOTE_KEY_ACTIONS: readonly string[] = [
  MOVE_TO_CURRENT_FOOTNOTE,
  MOVE_TO_NEXT_FOOTNOTE,
  MOVE_TO_PREVIOUS_FOOTNOTE,
];

/** A note where it is drawn: on which page (-1 under the writing), at which key, with which number. */
export type NoteShown = { readonly page: number; readonly note: PageNote };

/** Where a note is drawn, on the pages or under the writing; null where no mark names it. */
export function noteShown(
  pages: readonly PageGeometry[] | null,
  endNotes: readonly PageNote[],
  story: string,
): NoteShown | null {
  if (pages) {
    for (const [page, geometry] of pages.entries()) {
      const note = geometry.notes?.find((n) => n.story === story);
      if (note) return { page, note };
    }
    return null;
  }
  const note = endNotes.find((n) => n.story === story);
  return note ? { page: -1, note } : null;
}

/** The note being edited: its story, the source it is edited in, and where and with which number it is drawn. */
export type NoteEditing = {
  readonly story: string;
  readonly key: string;
  readonly view: EditorView;
  readonly page: number;
  readonly number: number;
};

type Entered = { readonly story: string; readonly key: string; readonly view: EditorView };
type Point = { readonly left: number; readonly top: number };

export type TextDocumentNoteEditing = {
  /** The note edited, while its mark still names it and the person may edit; null while it is not. */
  readonly editing: NoteEditing | null;
  /** Enters a note, the caret where `point` is or at its end. */
  readonly enter: (story: string, point?: Point) => void;
  /** Leaves it, the caret just after its mark. */
  readonly leave: () => void;
  /** The callback ref for the box it is edited in. */
  readonly box: (element: HTMLElement | null) => void;
  /** A press on a drawn note enters it. */
  readonly onPress: (event: {
    target: EventTarget;
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) => void;
  readonly actions: OfficeActions;
};

export function useTextDocumentNoteEditing(input: {
  readonly view: EditorView | null;
  readonly liveDoc: RefObject<Y.Doc | null>;
  readonly format: TextDocumentFormat;
  /** The pages laid out, or null where there are none (the notes drawn under the writing). */
  readonly pages: readonly PageGeometry[] | null;
  readonly endNotes: readonly PageNote[];
  readonly writes: boolean;
  readonly stories: TextDocumentStories;
  /** A header or footer is being edited: Insert > Footnote is dimmed. */
  readonly inStory: boolean;
  /** Leaves a header or footer being edited, before a note is entered. */
  readonly leaveOthers: () => void;
}): TextDocumentNoteEditing {
  const { view, liveDoc, format, pages, endNotes, writes, stories, inStory } = input;
  const [entered, setEntered] = useState<Entered | null>(null);
  const shown = entered ? noteShown(pages, endNotes, entered.story) : null;
  const page = shown?.page;
  const number = shown?.note.number;
  const editing = useMemo(
    (): NoteEditing | null =>
      entered && writes && page !== undefined && number !== undefined
        ? { ...entered, page, number }
        : null,
    [entered, writes, page, number],
  );
  const source = useRef<StorySource | null>(null);
  const box = useRef<HTMLElement | null>(null);
  const pressed = useRef<Point | null>(null);
  const latest = useRef({
    view,
    pages,
    endNotes,
    writes,
    format,
    stories,
    entered,
    editing,
    input,
  });
  useLayoutEffect(() => {
    latest.current = { view, pages, endNotes, writes, format, stories, entered, editing, input };
  });

  const stop = useCallback((was: Entered) => {
    source.current?.stopEditing();
    source.current = null;
    latest.current.stories.release(was.key);
    debugLog('[text-document] footnote', { change: 'left' });
  }, []);

  // The caret back in the body, just after a note's mark.
  const toMark = useCallback((story: string) => {
    const body = latest.current.view;
    if (!body || body.isDestroyed) return;
    const at = afterMark(body.state.doc, story);
    if (at !== null)
      body.dispatch(
        body.state.tr.setSelection(TextSelection.create(body.state.doc, at)).scrollIntoView(),
      );
    body.focus();
  }, []);

  const leave = useCallback(() => {
    const was = latest.current.entered;
    if (!was) return;
    stop(was);
    latest.current = { ...latest.current, entered: null, editing: null };
    setEntered(null);
    toMark(was.story);
  }, [stop, toMark]);

  const enter = useCallback(
    (story: string, point?: Point) => {
      const {
        view: body,
        pages: laid,
        endNotes: under,
        writes: can,
        stories: held,
      } = latest.current;
      if (!body || !can) return;
      const now = latest.current.entered;
      if (now?.story === story) return;
      if (now) stop(now);
      latest.current.input.leaveOthers();
      // Where it is drawn; a note just put in is not yet, so its width is its mark's section's.
      const drawn = noteShown(laid, under, story)?.note;
      const at = afterMark(body.state.doc, story) ?? body.state.selection.head;
      const width =
        drawn?.width ??
        (laid ? noteWidthAt(body, at) : null) ??
        (Number.parseFloat(getComputedStyle(body.dom).width) || 0);
      const key = drawn?.key ?? storyKey(story, width);
      const found = held.hold(key, { story, width, kind: 'footnote' });
      if (!found) return;
      source.current = found;
      pressed.current = point ?? null;
      const next = { story, key, view: found.view };
      latest.current = { ...latest.current, entered: next };
      setEntered(next);
      debugLog('[text-document] footnote', { change: 'entered' });
    },
    [stop],
  );

  // Into its box: the caret where it was pressed, or at its end, starting at 10 pt in an empty OOXML note.
  const editIn = useCallback((element: HTMLElement) => {
    const edited = source.current;
    if (!edited) return;
    const fresh = !edited.editing;
    edited.edit(element);
    if (!fresh) return;
    const point = pressed.current;
    pressed.current = null;
    const at = point ? edited.view.posAtCoords(point) : null;
    if (at)
      edited.view.dispatch(
        edited.view.state.tr.setSelection(TextSelection.create(edited.view.state.doc, at.pos)),
      );
    noteStartMarks(edited.view, latest.current.format);
  }, []);

  // Its own box, drawn again once it is left, painted again.
  const drawnKey = editing ? shown?.note.key : undefined;
  const shownKey = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const was = shownKey.current;
    shownKey.current = drawnKey;
    if (was && was !== drawnKey) latest.current.stories.repaint(was);
  }, [drawnKey]);

  // In its box while it is edited; back to its hidden place once its mark is gone.
  useLayoutEffect(() => {
    const edited = source.current;
    if (!edited) return;
    if (editing && box.current) editIn(box.current);
    else if (!editing && edited.editing) edited.stopEditing();
  }, [editing, editIn]);

  // A press on the body leaves it.
  useLayoutEffect(() => {
    if (!editing || !view) return;
    const dom = view.dom;
    dom.addEventListener('mousedown', leave);
    return () => dom.removeEventListener('mousedown', leave);
  }, [editing, view, leave]);

  const boxRef = useCallback(
    (element: HTMLElement | null) => {
      box.current = element;
      if (element && source.current) editIn(element);
    },
    [editIn],
  );

  const onPress = useCallback<TextDocumentNoteEditing['onPress']>(
    (event) => {
      const drawn = (event.target as Element).closest?.(`[${NOTE_BOX_NUMBER_ATTRIBUTE}]`);
      const story = drawn?.getAttribute('data-story');
      if (!story || !latest.current.writes) return;
      event.preventDefault();
      enter(story, { left: event.clientX, top: event.clientY });
    },
    [enter],
  );

  const insert = useCallback(() => {
    const { view: body, format: kept } = latest.current;
    const doc = liveDoc.current;
    if (!body || !doc) return;
    const story = insertFootnote(body, doc, kept);
    if (!story) return;
    track('Element', 'Added', 'TextDocumentFootnote');
    debugLog('[text-document] footnote', {
      change: 'inserted',
      number: marksIn(body.state.doc).findIndex((m) => m.story === story) + 1,
    });
    enter(story);
  }, [liveDoc, enter]);

  // From a mark to its note, from a note back to its mark.
  const current = useCallback(() => {
    const { view: body, editing: now } = latest.current;
    if (now) return leave();
    const mark = body ? markBeside(body.state) : null;
    if (mark) enter(mark.story);
    else debugLog('[text-document] footnote', { change: 'moved', to: 'none' });
  }, [enter, leave]);

  // From the body, the caret just after the next or previous mark; from a note, that note entered.
  const step = useCallback(
    (forward: boolean) => {
      const { view: body, editing: now } = latest.current;
      if (!body) return;
      if (now) {
        const marks = marksIn(body.state.doc);
        const index = marks.findIndex((m) => m.story === now.story);
        const next = marks[index + (forward ? 1 : -1)];
        if (next) enter(next.story);
        debugLog('[text-document] footnote', { change: 'moved', to: next ? 'note' : 'none' });
        return;
      }
      const mark = forward ? markAfter(body.state) : markBefore(body.state);
      debugLog('[text-document] footnote', { change: 'moved', to: mark ? 'mark' : 'none' });
      if (mark) toMark(mark.story);
    },
    [enter, toMark],
  );

  const ready = view !== null;
  const inNote = editing !== null;
  const actions = useMemo((): OfficeActions => {
    if (!ready) return {};
    const moves: OfficeActions = {
      [MOVE_TO_NEXT_FOOTNOTE]: { run: () => step(true) },
      [MOVE_TO_PREVIOUS_FOOTNOTE]: { run: () => step(false) },
    };
    if (!writes) return moves;
    return {
      ...moves,
      [FOOTNOTE_ITEM]: { run: insert, disabled: inStory || inNote },
      [MOVE_TO_CURRENT_FOOTNOTE]: { run: current },
    };
  }, [ready, writes, insert, current, step, inStory, inNote]);

  return { editing, enter, leave, box: boxRef, onPress, actions };
}
