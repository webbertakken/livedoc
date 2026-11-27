// The writing of a page's own besides the body (docs/specs/034-text-documents/page-layout.md "Headers and footers",
// "Footnotes"): headers, footers and footnotes, their sources drawn on every page (useTextDocumentStories), and one of
// them edited in place (useTextDocumentHeaderEditing, useTextDocumentNoteEditing), never two at once, with the keys,
// undo and caret changes it is edited with; while one is edited the toolbar acts on it.
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type RefObject,
} from 'react';
import type { Plugin } from 'prosemirror-state';
import type { SuggestingDispatch } from '@/lib/text-document/text-document-suggesting-dispatch';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState } from '@livedoc/text-documents';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import { pageAtPoint } from '@/lib/text-document/pagination/pagination-headers';
import { storyEditingPlugins } from '@/lib/text-document/text-document-story-editing';
import { TextDocumentHeaderBar } from './TextDocumentHeaderBar';
import { useTextDocumentHeaderEditing } from './useTextDocumentHeaderEditing';
import { useTextDocumentHeaderOptions } from './useTextDocumentHeaderOptions';
import { useTextDocumentNoteEditing } from './useTextDocumentNoteEditing';
import { useTextDocumentPageNumbers } from './useTextDocumentPageNumbers';
import { useTextDocumentStories } from './useTextDocumentStories';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';
import type { GalleryPictures } from '@/lib/text-document/text-document-gallery-pictures';

const NO_NOTES: readonly PageNote[] = [];

export function useTextDocumentPageStories(input: {
  readonly view: EditorView | null;
  readonly liveDoc: RefObject<Y.Doc | null>;
  readonly format: TextDocumentFormat;
  readonly pages: readonly PageGeometry[] | null;
  /** The footnotes drawn under the writing where there are no pages. */
  readonly endNotes?: readonly PageNote[];
  readonly writes: boolean;
  /**
   * Suggesting (review.md "Headers, footers and notes"): a header, footer or note is entered and written in as
   * suggestions; its settings stay an Editor's in Editing.
   */
  readonly suggests?: boolean;
  /** An Editor: may put a header or footer in, or take an empty one out, while suggesting too. */
  readonly makes?: boolean;
  /** How a story's changes are applied around suggesting. */
  readonly suggesting?: SuggestingDispatch;
  /** Each drawn story's height by its key, read by the layout. */
  readonly heights: RefObject<Map<string, number>>;
  /** The plugin telling the toolbar of the caret's changes. */
  readonly caret: Plugin;
  /** The section the body's caret is in: Headers and footers options opens on it. */
  readonly caretSection: number;
  /** Where its stories' pictures' gallery images are read from. */
  readonly gallery: GalleryPictures;
  /** The settled writing the stories are drawn from, where the body draws one (useTextDocumentReviewPreview). */
  readonly drawnDoc?: Y.Doc | null;
}) {
  const { view, liveDoc, format, pages, writes, heights, caret, caretSection, gallery } = input;
  const suggests = input.suggests ?? false;
  const enters = writes || suggests;
  const endNotes = input.endNotes ?? NO_NOTES;
  const leave = useRef(() => {});
  const toolbar = useRef<HTMLDivElement | null>(null);
  const plugins = useCallback(() => {
    const doc = liveDoc.current;
    if (!doc) return [];
    return storyEditingPlugins({
      caret,
      readFormatting: () => ({
        styles: TextDocumentState.styles(doc, format),
        defaults: TextDocumentState.defaults(doc, format),
      }),
      leave: () => leave.current(),
      toBar: () => toolbar.current?.querySelector<HTMLElement>('input, button')?.focus(),
    });
  }, [liveDoc, format, caret]);
  const stories = useTextDocumentStories({
    view,
    liveDoc,
    format,
    pages,
    heights,
    plugins,
    endNotes,
    gallery,
    drawnDoc: input.drawnDoc ?? null,
    ...(input.suggesting ? { suggesting: input.suggesting } : {}),
  });
  const leaveNote = useRef(() => {});
  const editing = useTextDocumentHeaderEditing({
    view,
    liveDoc,
    format,
    pages,
    writes,
    suggests,
    makes: input.makes ?? writes,
    caretSection,
    stories,
    leaveOthers: () => leaveNote.current(),
  });
  // Footnotes put in and edited (page-layout.md "Footnotes").
  const notes = useTextDocumentNoteEditing({
    view,
    liveDoc,
    format,
    pages,
    endNotes,
    writes: enters,
    stories,
    inStory: editing.editing !== null,
    leaveOthers: editing.leave,
  });
  useLayoutEffect(() => {
    leaveNote.current = notes.leave;
    // Escape leaves whichever is edited.
    leave.current = notes.editing ? notes.leave : editing.leave;
  });
  const { enter } = editing;
  const edited = editing.editing;
  // Going to a story's suggestion (review.md "Going to a story's suggestion"): its header or footer entered on the
  // first page showing it, or its note; false where the person cannot, or nothing draws it.
  const { enter: enterNote } = notes;
  const open = useCallback(
    (story: string): boolean => {
      if (!enters) return false;
      const page = pages?.findIndex((p) => p.header?.story === story || p.footer?.story === story);
      if (pages && page !== undefined && page >= 0) {
        enter(pages[page]!.header?.story === story ? 'header' : 'footer', page);
        return true;
      }
      const noted =
        pages?.some((p) => p.notes?.some((n) => n.story === story)) ||
        endNotes.some((n) => n.story === story);
      if (noted) enterNote(story);
      return noted === true;
    },
    [enters, pages, endNotes, enter, enterNote],
  );
  // Headers and footers options, from Format and from the bar.
  const options = useTextDocumentHeaderOptions({
    view,
    liveDoc,
    format,
    writes,
    laidOut: (pages?.length ?? 0) > 0,
    caretSection,
    editing: edited,
    changeAround: editing.changeAround,
  });
  // Page numbers put in, from Insert, Format and the bar (page-layout.md "Page numbers").
  const pageNumbers = useTextDocumentPageNumbers({
    view,
    activeView: edited?.view ?? view,
    liveDoc,
    format,
    writes,
    laidOut: (pages?.length ?? 0) > 0,
    caretSection,
    editing: edited,
    changeAround: editing.changeAround,
  });
  // The bar under the one being edited ("The bar").
  const bar = edited ? (
    <TextDocumentHeaderBar
      kind={edited.kind}
      differentFirst={edited.differentFirst}
      later={edited.section > 0}
      linked={edited.linked}
      onFirst={editing.toggleFirst}
      onLink={editing.toggleLink}
      onRemove={editing.remove}
      onFormat={options.open}
      onPageNumbers={pageNumbers.open}
      onBack={() => edited.view.focus()}
      settingsOff={!writes}
      toolbar={toolbar}
    />
  ) : null;
  // A double-click in a page's top or bottom margin enters its header or footer, the space between pages inside the
  // body too (the body never writes in a margin); `scale` is the pages' zoom.
  const onDoubleClick = useCallback(
    (event: MouseEvent<HTMLElement>, scale: number) => {
      if (!pages || (event.target as Element).closest?.('[data-story-editing], [data-page-notes]'))
        return;
      const top = event.currentTarget.getBoundingClientRect().top;
      const hit = pageAtPoint(pages, (event.clientY - top) / scale);
      if (hit?.kind) enter(hit.kind, hit.index);
    },
    [pages, enter],
  );
  const actions = useMemo(
    () => ({
      ...editing.actions,
      ...options.actions,
      ...pageNumbers.actions,
      ...notes.actions,
    }),
    [editing.actions, options.actions, pageNumbers.actions, notes.actions],
  );
  return {
    storyHost: stories.host,
    /** The stories drawn, read for their suggestion cards. */
    stories,
    open,
    ...editing,
    onDoubleClick,
    bar,
    actions,
    optionsDialog: options.dialog,
    pageNumbersDialog: pageNumbers.dialog,
    /** The footnote being edited, its box and a press on a drawn note. */
    note: notes.editing,
    noteBox: notes.box,
    leaveNote: notes.leave,
    onNotePress: notes.onPress,
    /** What the toolbar, the Format menu and Edit act on: the note, header or footer edited, else the body. */
    activeView: notes.editing?.view ?? editing.editing?.view ?? view,
  };
}
