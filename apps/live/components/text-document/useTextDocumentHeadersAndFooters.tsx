// Headers and footers on the pages (docs/specs/034-text-documents/page-layout.md "Headers and footers"): their sources
// drawn on every page (useTextDocumentStories) and one of them edited in place (useTextDocumentHeaderEditing), with
// the keys, undo and caret changes it is edited with; while one is edited the toolbar acts on it.
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type RefObject,
} from 'react';
import type { Plugin } from 'prosemirror-state';
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
import { useTextDocumentPageNumbers } from './useTextDocumentPageNumbers';
import { useTextDocumentStories } from './useTextDocumentStories';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';

export function useTextDocumentHeadersAndFooters(input: {
  readonly view: EditorView | null;
  readonly liveDoc: RefObject<Y.Doc | null>;
  readonly format: TextDocumentFormat;
  readonly pages: readonly PageGeometry[] | null;
  /** The footnotes drawn under the writing where there are no pages. */
  readonly endNotes?: readonly PageNote[];
  readonly writes: boolean;
  /** Each drawn story's height by its key, read by the layout. */
  readonly heights: RefObject<Map<string, number>>;
  /** The plugin telling the toolbar of the caret's changes. */
  readonly caret: Plugin;
  /** The section the body's caret is in: Headers and footers options opens on it. */
  readonly caretSection: number;
}) {
  const { view, liveDoc, format, pages, writes, heights, caret, caretSection, endNotes } = input;
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
    ...(endNotes ? { endNotes } : {}),
  });
  const editing = useTextDocumentHeaderEditing({ view, liveDoc, format, pages, writes, stories });
  useLayoutEffect(() => {
    leave.current = editing.leave;
  });
  const { enter } = editing;
  const edited = editing.editing;
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
      toolbar={toolbar}
    />
  ) : null;
  // A double-click in a page's top or bottom margin enters its header or footer, the space between pages inside the
  // body too (the body never writes in a margin); `scale` is the pages' zoom.
  const onDoubleClick = useCallback(
    (event: MouseEvent<HTMLElement>, scale: number) => {
      if (!pages || (event.target as Element).closest?.('[data-story-editing]')) return;
      const top = event.currentTarget.getBoundingClientRect().top;
      const hit = pageAtPoint(pages, (event.clientY - top) / scale);
      if (hit?.kind) enter(hit.kind, hit.index);
    },
    [pages, enter],
  );
  const actions = useMemo(
    () => ({ ...editing.actions, ...options.actions, ...pageNumbers.actions }),
    [editing.actions, options.actions, pageNumbers.actions],
  );
  return {
    storyHost: stories.host,
    ...editing,
    onDoubleClick,
    bar,
    actions,
    optionsDialog: options.dialog,
    pageNumbersDialog: pageNumbers.dialog,
    /** What the toolbar, the Format menu and Edit act on: the header or footer edited, else the body. */
    activeView: editing.editing?.view ?? view,
  };
}
