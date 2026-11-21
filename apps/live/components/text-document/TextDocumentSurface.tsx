'use client';

// A text document's surface (docs/specs/034-text-documents/editing-surface.md,
// docs/specs/006-document/kinds-outside-the-canvas.md "The surface"): the office shell's title row and menus, the
// page on its ground, and the body, edited live through the room; the shell's look tokens colour it all. One surface
// is one tab: its host keys it by the tab, so another tab mounts a fresh one.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { ySyncPlugin } from 'y-prosemirror';
import { tableEditing } from 'prosemirror-tables';
import type { AccessLevel } from '@livedoc/api-schema';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  Columns,
  liveFirstHeaders,
  TextDocumentState,
  type ListDefinition,
  type PageSetup,
  type Style,
} from '@livedoc/text-documents';
import { Button, useMediaQuery } from '@livedoc/ui';
import {
  apiLoadTextDocumentState,
  apiLoadTextDocumentStateSince,
  apiPostTextDocumentUpdate,
  type TextDocumentScope,
} from '@/lib/api/text-documents';
import { debugLog } from '@/lib/debug-log';
import { openRoomYjs, type TextDocumentFrame } from '@/lib/text-document/room-yjs-provider';
import { TextDocumentCopies } from '@/lib/text-document/text-document-copies';
import { paintFormatPlugin } from '@/lib/text-document/text-document-paint-format';
import { clipboardPlugin } from '@/lib/text-document/text-document-clipboard';
import { footnoteClipboard } from '@/lib/text-document/text-document-footnote-clipboard';
import { stretchesPlugin } from '@/lib/text-document/text-document-stretches';
import { typingAidsPlugin } from '@/lib/text-document/text-document-typing-aids-plugin';
import { TypingAids } from '@/lib/text-document/text-document-typing-aids';
import { useTextDocumentPreferences } from './useTextDocumentPreferences';
import { useTextDocumentPageSetup } from './useTextDocumentPageSetup';
import { useTextDocumentClipboard } from './useTextDocumentClipboard';
import { paragraphBoxesPlugin } from '@/lib/text-document/text-document-paragraph-boxes';
import { listKeysPlugin } from '@/lib/text-document/text-document-list-actions';
import { tableKeysPlugin } from '@/lib/text-document/text-document-tables';
import { useTextDocumentTables } from '@/lib/text-document/useTextDocumentTables';
import { listMarkersPlugin } from '@/lib/text-document/text-document-list-markers';
import { writingKeysPlugin } from '@/lib/text-document/text-document-writing-keys';
import { tabStopsPlugin } from '@/lib/text-document/text-document-tab-layout';
import { subscribeLists } from '@/lib/text-document/text-document-live-lists';
import { useTextDocumentLists } from './useTextDocumentLists';
import { textDocumentEditorActions } from '@/lib/text-document/text-document-editor-actions';
import { useTextDocumentFormatting } from '@/lib/text-document/useTextDocumentFormatting';
import { useGoogleDocumentFonts } from '@/lib/text-document/useGoogleDocumentFonts';
import { useTextDocumentParagraphStyles } from '@/lib/text-document/useTextDocumentParagraphStyles';
import { startInMakersDefaults } from '@/lib/text-document/text-document-new-start';
import {
  TEXT_DOCUMENT_LIMIT_NOTICES,
  textDocumentLimitPlugin,
} from '@/lib/text-document/text-document-limit';
import { TextDocumentBus, type TextDocumentLimit } from '@/lib/text-document/text-document-bus';
import { openLocalYjs } from '@/lib/text-document/local-yjs-provider';
import {
  offlineSaveTextDocumentState,
  offlineTextDocumentState,
} from '@/lib/offline/offline-text-documents';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import {
  setLocalTextDocumentCaret,
  useTextDocumentPeers,
} from '@/lib/text-document/text-document-carets-store';
import {
  scrollToTextDocumentPeer,
  setTextDocumentPeers,
  textDocumentPeersPlugin,
} from '@/lib/text-document/text-document-peers';
import { useSurfaceView } from '@/hooks/ui/useSurfaceView';
import type { SurfaceSelection } from '@/lib/surface-view';
import type { OfficeChrome } from '@/components/office/office-chrome';
import type { SaveFactsSource } from '@/lib/text-document/text-document-save-status';
import { useTextDocumentSaveStatus } from '@/lib/text-document/useTextDocumentSaveStatus';
import { useTextDocumentZoom } from '@/lib/text-document/useTextDocumentZoom';
import { levelInMode } from '@/lib/office/office-mode';
import { useOfficeMode } from '@/lib/office/useOfficeMode';
import { TEXT_DOCUMENT_MODES } from '@/lib/text-document/text-document-modes';
import { OfficePanel, OfficePanelLayout } from '@/components/office/OfficePanel';
import { TextDocumentRightPanel } from './TextDocumentRightPanel';
import { useTextDocumentWatermark } from './useTextDocumentWatermark';
import { watermarkLook } from '@/lib/text-document/text-document-watermark';
import { useTextDocumentLineNumbers } from './useTextDocumentLineNumbers';
import { useOfficePanels } from '@/lib/office/useOfficePanels';
import { createTextDocumentChanges } from '@/lib/text-document/text-document-changes';
import { OUTLINE_PANEL, TEXT_DOCUMENT_PANELS } from '@/lib/text-document/text-document-panels';
import { TextDocumentOutline } from './TextDocumentOutline';
import { useTextDocumentParagraphs } from './useTextDocumentParagraphs';
import {
  placeTextDocumentCaret,
  textDocumentCaretPoint,
} from '@/lib/text-document/text-document-caret';
import { TextDocumentTitleRow } from './TextDocumentTitleRow';
import { TextDocumentRuler } from './TextDocumentRuler';
import { sheetsFrame, TextDocumentSheets } from './TextDocumentSheets';
import { useTextDocumentPageStories } from './useTextDocumentPageStories';
import { useTextDocumentColumns } from './useTextDocumentColumns';
import { breaksPlugin } from '@/lib/text-document/text-document-breaks';
import { useTextDocumentBreaks } from '@/lib/text-document/useTextDocumentBreaks';
import {
  paginationPlugin,
  relayoutPages,
  type PageGeometry,
} from '@/lib/text-document/pagination/pagination-plugin';
import { sectionWidthsPlugin } from '@/lib/text-document/pagination/pagination-sections';
import { pageBox, pagelessSetup, usePagelessColumn } from '@/lib/text-document/text-document-page';
import { useTextDocumentTextWidth } from '@/lib/text-document/useTextDocumentTextWidth';
import {
  NON_PRINTING_TOGGLE,
  PRINT_LAYOUT_TOGGLE,
  RULER_TOGGLE,
  useTextDocumentViewToggle,
} from '@/lib/text-document/useTextDocumentViewToggle';
import { nonPrintingPlugin, setNonPrinting } from '@/lib/text-document/text-document-non-printing';
import {
  TEXT_DOCUMENT_LISTS_ORIGIN,
  textDocumentUndoPlugins,
} from '@/lib/text-document/text-document-undo';
import { documentTextStyle } from '@/lib/document-fonts/document-text-style';
// The served document fonts' faces, loaded with the surface, never on other pages (fonts.md "Served from LiveDoc").
import '@/app/document-fonts.css';
import { FIELD_NODE_VIEWS } from '@/lib/text-document/text-document-fields';
import { footnoteNumbersPlugin } from '@/lib/text-document/text-document-footnotes';
import { TextDocumentEndNotes } from './TextDocumentEndNotes';
import { TextDocumentPageNotes } from './TextDocumentPageNotes';
import { useTextDocumentEndNotes } from './useTextDocumentEndNotes';

// A remembered selection put back, clamped to the body there is now (docs/specs/006-document/kinds-outside-the-canvas.md
// "Switching tabs"): the text may have changed since it was left.
function restoreSelectionIn(view: EditorView, { anchor, head }: SurfaceSelection): void {
  const { doc } = view.state;
  const clamp = (at: number) => Math.min(at, doc.content.size);
  const selection = TextSelection.between(doc.resolve(clamp(anchor)), doc.resolve(clamp(head)));
  view.dispatch(view.state.tr.setSelection(selection).setMeta('addToHistory', false));
}

export type TextDocumentSurfaceProps = {
  scope: TextDocumentScope;
  documentName: string;
  format: TextDocumentFormat;
  canEdit: boolean;
  // The session's share level: what the menus show (editing-surface.md "The menu bar").
  level: AccessLevel;
  // One frame to the room; true once the room has stored it ("Sending").
  sequence: (op: TextDocumentFrame) => Promise<boolean>;
  // A text document in This Browser: no room; its state lives in its offline record ("A text document in This
  // Browser"). Fixed for the surface's life: its host keys it by this.
  local?: boolean;
  // The title row's document parts (editing-surface.md "The title row"); null in the read-only pane of a split.
  chrome?: OfficeChrome | null;
};

type SurfaceState = 'loading' | 'ready' | 'failed';

export function TextDocumentSurface({
  scope,
  documentName,
  format,
  canEdit,
  level,
  sequence,
  local = false,
  chrome = null,
}: TextDocumentSurfaceProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const mount = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const editor = useRef<EditorView | null>(null);
  // The editor as state too: the menus act on the one there is now.
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  // The live state, for a download written in this browser.
  const liveDoc = useRef<Y.Doc | null>(null);
  // Collaborators' carets in this tab's writing (live-editing-and-storage.md "Presence"), drawn by the editor.
  const peers = useTextDocumentPeers(scope.tabId);
  const [state, setState] = useState<SurfaceState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [limitReached, setLimitReached] = useState<TextDocumentLimit | null>(null);
  const clipboardLeftOut = useRef<(count: number) => void>(() => {});
  // What the layout lays the writing onto (page-layout.md "Laying out"), read as it lays out; and the pages it made.
  const layout = useRef<{ setup: PageSetup; pages: boolean } | null>(null);
  const [pageList, setPageList] = useState<readonly PageGeometry[]>([]);
  // Each header's and footer's height at its width, as the pages draw them (page-layout.md "Headers and footers").
  const storyHeights = useRef(new Map<string, number>());
  // The person's typing aids, as the writing reads them (text-and-paragraphs.md "Typing aids").
  const typingAids = useRef<() => TypingAids>(TypingAids.defaults);
  // The writing changed: what the outline listens to, so the surface does not draw again on every keystroke.
  const [changes] = useState(createTextDocumentChanges);
  // What the title row's save status reads (editing-surface.md "The title row"), once the writing is bound.
  const [saveFacts, setSaveFacts] = useState<SaveFactsSource | null>(null);
  const saveStatus = useTextDocumentSaveStatus(saveFacts, local);
  // The pages' zoom, this person's for this document (editing-surface.md "Zoom").
  const { zoom, scale } = useTextDocumentZoom(scope.documentId, scroller);
  const { ownerId, documentId, tabId, shareCode } = scope;
  // The latest sender and gate, read when an update goes out, so a new room connection never rebinds the editor.
  // This person's editing mode (review.md "Editing modes"): the writing takes edits only in Editing.
  const {
    mode,
    choice: modeChoice,
    actions: modeActions,
  } = useOfficeMode(level, TEXT_DOCUMENT_MODES, 'TextDocumentMode');
  const writes = canEdit && mode === 'editing';
  // The side panels (office-shell.md "Side panels"); closing one gives the writing the keyboard back. Line numbers is
  // an Editor's (page-layout.md "Line numbers").
  const panels = useOfficePanels({
    kind: 'TextDocument',
    panels: TEXT_DOCUMENT_PANELS,
    onFocusDocument: () => editor.current?.focus(),
    writes,
  });
  const live = useRef({ sequence, canEdit, writes, format });
  useLayoutEffect(() => {
    live.current = { sequence, canEdit, writes, format };
  });
  // Where the person was in this tab, back when they return to it.
  const { noteViewChanged } = useSurfaceView({
    documentId,
    tabId,
    ready: state === 'ready',
    scroller,
    readSelection: () => {
      const selection = editor.current?.state.selection;
      return selection ? { anchor: selection.anchor, head: selection.head } : null;
    },
    restoreSelection: (selection) => {
      const view = editor.current;
      if (!view) return;
      restoreSelectionIn(view, selection);
      // Back in the writing where it was left, as a word processor keeps its caret; focus never scrolls the page.
      if (live.current.writes) view.focus();
    },
  });
  const viewChanged = useRef(noteViewChanged);
  useLayoutEffect(() => {
    viewChanged.current = noteViewChanged;
  });

  useEffect(() => {
    let cancelled = false;
    let teardown = () => {};
    const where = { ownerId, documentId, tabId, shareCode };
    const started = performance.now();
    debugLog('[text-document] surface loading', { documentId, tabId, ownerId, shareCode });
    const gate = {
      get canEdit() {
        return live.current.canEdit;
      },
    };
    // Load, then bind: the editor never sees an empty state, so it never invents a first paragraph.
    const opening = local
      ? openLocalYjs({
          documentId,
          tabId,
          get canEdit() {
            return gate.canEdit;
          },
          load: () => offlineTextDocumentState(documentId, tabId),
          save: (update) => offlineSaveTextDocumentState(documentId, tabId, update),
        })
      : openRoomYjs({
          documentId,
          tabId,
          get canEdit() {
            return gate.canEdit;
          },
          sequence: (op) => live.current.sequence(op),
          post: (update) => apiPostTextDocumentUpdate(where, update),
          loadState: () => apiLoadTextDocumentState(where),
          loadSince: (vector) => apiLoadTextDocumentStateSince(where, vector),
          copies: TextDocumentCopies,
        });
    opening
      .then((binding) => {
        const { doc } = binding;
        if (cancelled || !mount.current) {
          binding.close();
          doc.destroy();
          return;
        }
        // A text document just made here starts in its maker's default styles and page setup (page-layout.md).
        startInMakersDefaults(doc, { tabId, format: live.current.format, canEdit: gate.canEdit });
        const readFormatting = () => ({
          styles: TextDocumentState.styles(doc, live.current.format),
          defaults: TextDocumentState.defaults(doc, live.current.format),
        });
        // New lists made by a paste or a typed marker, on the person's undo timeline.
        const listsAccess = {
          read: () => TextDocumentState.lists(doc),
          set: (id: string, list: ListDefinition) =>
            TextDocumentState.setList(doc, id, list, TEXT_DOCUMENT_LISTS_ORIGIN),
        };
        const view = new EditorView(mount.current, {
          state: EditorState.create({
            schema: textDocumentSchema,
            plugins: [
              ySyncPlugin(TextDocumentState.body(doc)),
              // Cells selected together, tables kept whole as they are edited (tables.md "In the editor").
              tableEditing(),
              changes.plugin,
              ...textDocumentUndoPlugins(),
              textDocumentLimitPlugin({ onRefused: () => setLimitReached('characters') }),
              // Several stretches selected at once (text-and-paragraphs.md "Selection").
              stretchesPlugin(),
              // The typing aids: smart quotes, substitutions, links, capitals, lists.
              typingAidsPlugin({
                read: () => typingAids.current(),
                lists: listsAccess,
                readStyles: () => readFormatting().styles,
              }),
              // Copy, cut and paste (text-and-paragraphs.md "Clipboard").
              clipboardPlugin({
                read: () => ({
                  documentId,
                  tabId,
                  format: live.current.format,
                  ...readFormatting(),
                  lists: TextDocumentState.lists(doc),
                }),
                lists: listsAccess,
                markdown: () => typingAids.current().markdown,
                // A copied footnote's writing goes with its mark (page-layout.md "Footnotes").
                notes: footnoteClipboard(
                  doc,
                  () => live.current.format,
                  () => editor.current?.state.doc ?? null,
                ),
                onLeftOut: (count) => clipboardLeftOut.current(count),
              }),
              // Copy and paste text formatting, and the paint roller (text-and-paragraphs.md "Paint format").
              paintFormatPlugin(),
              // Adjacent paragraphs with the same borders share one box ("Borders and shading").
              paragraphBoxesPlugin(readFormatting),
              // Lists: Enter, Backspace and Tab in an item, and the items drawn (lists.md).
              // Tab and Shift+Tab between a table's cells (tables.md "Working in a table").
              tableKeysPlugin(),
              listKeysPlugin(),
              // Tab types a tab, Shift+Enter breaks the line (text-and-paragraphs.md "Writing"), and each tab is
              // drawn to its stop ("Tab stops").
              writingKeysPlugin(readFormatting),
              tabStopsPlugin(readFormatting),
              nonPrintingPlugin(false),
              listMarkersPlugin(
                () => TextDocumentState.lists(doc),
                (listener) => subscribeLists(doc, listener),
              ),
              // Page and section breaks: their labels, and Backspace and Delete beside a page break.
              breaksPlugin(readFormatting),
              // Each section's writing at its own width (page-layout.md "Each page is drawn at its section's setup").
              sectionWidthsPlugin(
                () =>
                  layout.current?.setup ??
                  TextDocumentState.section(doc, live.current.format).setup,
                // Columns are drawn only where pages are laid out (page-layout.md "Columns").
                () => layout.current?.pages ?? false,
              ),
              // Each footnote's mark told its number (page-layout.md "Footnotes").
              footnoteNumbersPlugin(),
              // The writing laid onto pages (page-layout.md "Laying out").
              paginationPlugin({
                readFormatting,
                read: () => {
                  const first = TextDocumentState.section(doc, live.current.format);
                  return {
                    ...(layout.current ?? { setup: first.setup, pages: false }),
                    headers: liveFirstHeaders(doc),
                    numberStart: first.numberStart,
                    lineNumbers: first.lineNumbers,
                  };
                },
                heights: () => storyHeights.current,
                onPages: setPageList,
              }),
              keymap(baseKeymap),
              // A moved selection is part of the view remembered for this tab.
              new Plugin({
                view: () => ({
                  update: (view, previous) => {
                    if (!view.state.selection.eq(previous.selection)) viewChanged.current();
                  },
                }),
              }),
              textDocumentPeersPlugin({
                canEdit: () => live.current.writes,
                publish: (selection) => setLocalTextDocumentCaret(tabId, selection),
              }),
            ],
          }),
          editable: () => live.current.writes,
          // Page numbers and page counts drawn as their page's (page-layout.md "Page numbers").
          nodeViews: FIELD_NODE_VIEWS,
          // Read only in Viewing (or for a Viewer), yet still focusable: the keyboard reads it, and its shortcuts work.
          attributes: () => ({
            role: 'textbox',
            'aria-multiline': 'true',
            'aria-label': 'Document body',
            'aria-readonly': live.current.writes ? 'false' : 'true',
            tabindex: '0',
            // Spaces and line breaks show as typed; the caret is the focus mark, as in any word processor.
            class: 'text-document-body whitespace-pre-wrap break-words outline-none',
            // The document's default family and size (fonts.md "Substitution").
            style: documentTextStyle(TextDocumentState.defaults(doc, live.current.format).text),
            spellcheck: 'true',
          }),
        });
        editor.current = view;
        setEditorView(view);
        setSaveFacts(binding.saveFacts);
        liveDoc.current = doc;
        teardown = () => {
          editor.current = null;
          setEditorView(null);
          setSaveFacts(null);
          liveDoc.current = null;
          view.destroy();
          binding.close();
          doc.destroy();
        };
        setState('ready');
        debugLog('[text-document] surface ready', {
          documentId,
          tabId,
          ms: Math.round(performance.now() - started),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState('failed');
        debugLog('[text-document] surface failed', { documentId, tabId, error: String(error) });
      });
    return () => {
      cancelled = true;
      teardown();
    };
  }, [ownerId, documentId, tabId, shareCode, attempt, local, changes]);

  useEffect(() => {
    if (state === 'ready' && editor.current) setTextDocumentPeers(editor.current, peers);
  }, [peers, state]);

  // The page drawn at its setup, and the ruler that sets its margins, indents and tab stops (editing-surface.md
  // "The ruler", page-layout.md "Page setup").
  const page = useTextDocumentPageSetup({
    view: editorView,
    liveDoc,
    format,
    ready: state === 'ready',
    writes,
    ownerId,
    subscribeCaret: changes.subscribeCaret,
  });
  // Tools > Line numbers' panel (page-layout.md "Line numbers").
  const lineNumbers = useTextDocumentLineNumbers({
    view: editorView,
    liveDoc,
    format,
    writes,
    first: page.section,
    subscribe: changes.subscribeCaret,
  });
  // Insert > Watermark's panel, and the watermark every page draws (page-layout.md "Watermark").
  const watermark = useTextDocumentWatermark({
    view: editorView,
    liveDoc,
    ready: state === 'ready',
    writes,
  });
  // Pageless, the page is drawn as a column at the text width (page-layout.md "Pageless").
  // View > Text width, a person's own (page-layout.md "Pageless").
  const textWidth = useTextDocumentTextWidth(page.pageless);
  const column = usePagelessColumn(scroller, scale, page.pageless, textWidth.width);
  const drawn = page.pageless ? pagelessSetup(page.section.setup, column) : page.section.setup;
  // Pages are laid out unless pageless or on a phone, where the writing flows to the window.
  const wide = useMediaQuery('(min-width: 640px)');
  // View > Show print layout, a person's own (page-layout.md "Print layout"): off, one sheet as on a phone.
  const printLayout = useTextDocumentViewToggle(PRINT_LAYOUT_TOGGLE);
  const paginated = !page.pageless && wide && printLayout.shown;
  // Without pages, the footnotes under the writing (page-layout.md "Footnotes").
  const endNotes = useTextDocumentEndNotes(
    editorView,
    !paginated && state === 'ready',
    changes.subscribe,
  );
  // Headers, footers and footnotes drawn on the pages, and one edited in place (page-layout.md "Headers and footers",
  // "Footnotes"); while one is edited, the toolbar, the Format menu and Edit act on it.
  const headers = useTextDocumentPageStories({
    view: editorView,
    liveDoc,
    format,
    pages: paginated && state === 'ready' ? pageList : null,
    writes,
    endNotes,
    heights: storyHeights,
    caret: changes.plugin,
    caretSection: page.caret.index,
  });
  const { activeView } = headers;
  // Edit > Cut, Copy, Paste (text-and-paragraphs.md "Clipboard"); the editor's plugin tells it of a paste's losses.
  const clipboard = useTextDocumentClipboard(activeView, writes);
  // Tools > Preferences (tools.md "Preferences"); the writing reads the aids it keeps.
  const preferences = useTextDocumentPreferences(editorView, ownerId);
  useLayoutEffect(() => {
    typingAids.current = preferences.read;
  });
  useLayoutEffect(() => {
    clipboardLeftOut.current = clipboard.onLeftOut;
  });
  // Format > Text and the toolbar's text controls (text-and-paragraphs.md "Text formatting").
  const formatting = useTextDocumentFormatting(activeView, liveDoc, format, writes);
  // A family from Google Fonts that the text names loads from there (fonts.md "Substitution").
  useGoogleDocumentFonts(editorView, liveDoc, format, changes.subscribe);
  // Format > Paragraph styles and the Styles control, the paragraphs drawn in their styles.
  const paragraphStyles = useTextDocumentParagraphStyles(
    activeView,
    liveDoc,
    format,
    writes,
    ownerId,
  );
  // Format > Align & indent, the toolbar's Align and indent controls, and Indentation options.
  // Format > Bullets & numbering and the toolbar's list buttons (lists.md).
  const lists = useTextDocumentLists(activeView, liveDoc, writes);
  const paragraphs = useTextDocumentParagraphs(
    activeView,
    liveDoc,
    format,
    writes,
    lists.stepLevel,
  );
  // Format > Columns (page-layout.md "Columns").
  const columns = useTextDocumentColumns({
    view: editorView,
    liveDoc,
    format,
    writes,
    // Dimmed while a header, footer or footnote is edited, as breaks are.
    pageless: page.pageless || headers.editing !== null || headers.note !== null,
    caretSetup: page.caret.section.setup,
  });
  // The frame the pages need, each page at its section's size (page-layout.md "Laying out").
  const sheets = paginated && state === 'ready' ? sheetsFrame(pageList) : null;
  // The ruler shows the section the caret is in, and its margins set that section's.
  const rulerSetup = page.pageless ? drawn : page.caret.section.setup;
  useLayoutEffect(() => {
    layout.current = { setup: page.section.setup, pages: paginated };
    if (editorView && !editorView.isDestroyed) relayoutPages(editorView);
  }, [editorView, page.section.setup, paginated]);
  const ruler = useTextDocumentViewToggle(RULER_TOGGLE);
  // View > Show non-printing characters (text-and-paragraphs.md "Non-printing characters").
  const marks = useTextDocumentViewToggle(NON_PRINTING_TOGGLE);
  useEffect(() => {
    if (editorView && !editorView.isDestroyed) {
      setNonPrinting(editorView, marks.shown);
      // Breaks shown take room on the page (page-layout.md "Breaks").
      relayoutPages(editorView);
    }
  }, [editorView, marks.shown]);
  const readRulerFormatting = useCallback(
    () =>
      liveDoc.current
        ? {
            styles: TextDocumentState.styles(liveDoc.current, format),
            defaults: TextDocumentState.defaults(liveDoc.current, format),
          }
        : null,
    [format],
  );
  // Insert > Break (page-layout.md "Breaks").
  const breakActions = useTextDocumentBreaks(
    editorView,
    liveDoc,
    format,
    // None while a header, footer or footnote is edited (page-layout.md "Editing headers and footers").
    writes && headers.editing === null && headers.note === null,
    page.pageless ? 1 : Columns.of(page.caret.section.setup).count,
  );
  // Insert > Table (tables.md "Inserting"), at the caret's section's column width.
  const tableActions = useTextDocumentTables(
    editorView,
    writes && headers.editing === null && headers.note === null,
    Columns.width(page.caret.section.setup),
  );
  // Edit > Undo, Redo and Select all, run by the menus and the shortcut layer (keyboard-shortcuts.md).
  const editorActions = useMemo(
    () => ({
      ...textDocumentEditorActions(activeView, { canEdit: writes }),
      ...clipboard.actions,
      ...preferences.actions,
      ...formatting.actions,
      ...paragraphStyles.actions,
      ...paragraphs.actions,
      ...lists.actions,
      ...modeActions,
      ...panels.actions,
      ...ruler.actions,
      ...marks.actions,
      ...textWidth.actions,
      [PRINT_LAYOUT_TOGGLE.item]: {
        ...printLayout.actions[PRINT_LAYOUT_TOGGLE.item]!,
        disabled: page.pageless,
      },
      ...page.actions,
      ...columns.actions,
      ...breakActions,
      ...tableActions,
      ...headers.actions,
    }),
    [
      breakActions,
      tableActions,
      columns.actions,
      headers.actions,
      page.actions,
      ruler.actions,
      marks.actions,
      textWidth.actions,
      printLayout.actions,
      page.pageless,
      activeView,
      writes,
      formatting.actions,
      paragraphStyles.actions,
      paragraphs.actions,
      lists.actions,
      modeActions,
      panels.actions,
      clipboard.actions,
      preferences.actions,
    ],
  );
  // The toolbar's choice controls: Styles, Align and spacing, and the list buttons' grids.
  const choices = useMemo(
    () =>
      paragraphStyles.choices || paragraphs.choices
        ? { ...paragraphStyles.choices, ...paragraphs.choices, ...lists.choices }
        : null,
    [paragraphStyles.choices, paragraphs.choices, lists.choices],
  );
  // The caret, for the context menu on text.
  const caret = useMemo(
    () =>
      editorView
        ? {
            point: () => textDocumentCaretPoint(editorView),
            place: (point: { x: number; y: number }) => placeTextDocumentCaret(editorView, point),
          }
        : null,
    [editorView],
  );

  // A mode change re-reads whether the writing is editable.
  useEffect(() => {
    if (editorView && !editorView.isDestroyed) editorView.setProps({});
  }, [editorView, writes]);

  // The styles the outline reads its heading levels through.
  const readStyles = useCallback(
    (): readonly Style[] =>
      liveDoc.current ? TextDocumentState.styles(liveDoc.current, format) : [],
    [format],
  );

  // An edit the room refused names its limit.
  useEffect(() => TextDocumentBus.onRefused(tabId, setLimitReached), [tabId]);

  return (
    <div
      ref={root}
      className="office-shell flex min-h-0 flex-1 flex-col bg-(--office-ground)"
      data-text-document-surface={state}
    >
      <TextDocumentTitleRow
        scope={scope}
        documentName={documentName}
        format={format}
        level={levelInMode(TEXT_DOCUMENT_MODES, level, mode)}
        editorActions={editorActions}
        mode={modeChoice}
        caret={caret}
        keyScope={root}
        localDoc={local ? () => liveDoc.current : null}
        chrome={chrome}
        // A session that may not edit saves nothing, so shows no save status.
        saveStatus={canEdit ? saveStatus : null}
        zoom={zoom}
        fontSize={formatting.fontSize}
        fontFamily={formatting.fontFamily}
        colours={formatting.colours}
        choices={choices}
        refresh={changes.subscribeCaret}
        onFollow={(personId) =>
          editorView ? scrollToTextDocumentPeer(editorView, personId) : false
        }
      />
      {paragraphs.dialog}
      {clipboard.dialog}
      {preferences.dialog}
      {page.dialog}
      {columns.dialog}
      {headers.optionsDialog}
      {headers.pageNumbersDialog}
      {lists.dialog}
      {limitReached ? (
        <p
          role="status"
          className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          {TEXT_DOCUMENT_LIMIT_NOTICES[limitReached]}
        </p>
      ) : null}
      {clipboard.notice}
      <OfficePanelLayout
        left={
          panels.open.left === 'outline' ? (
            <OfficePanel
              spec={OUTLINE_PANEL}
              onClose={() => panels.close('left')}
              focusNonce={panels.focusNonce}
            >
              <TextDocumentOutline view={editorView} changes={changes} readStyles={readStyles} />
            </OfficePanel>
          ) : null
        }
        right={
          <TextDocumentRightPanel panels={panels} lineNumbers={lineNumbers} watermark={watermark} />
        }
      >
        <div
          ref={scroller}
          data-region="document"
          // Pageless, the page's colour fills the document's whole area (page-layout.md "Pageless"). Its scroll padding
          // keeps what is scrolled into sight below the ruler standing over it.
          style={page.pageless ? pageBox(page.section.setup) : undefined}
          className={`min-h-0 flex-1 overflow-y-auto scroll-pt-8 ${page.pageless ? 'text-document-pageless-ground' : 'pb-6'}`}
        >
          {ruler.shown && state === 'ready' ? (
            <TextDocumentRuler
              view={editorView}
              readFormatting={readRulerFormatting}
              setup={rulerSetup}
              pageless={page.pageless}
              onSetup={page.setCaretSetup}
              scale={scale}
              canEdit={writes}
              refresh={changes.subscribeCaret}
              guideHeight={() => scroller.current?.clientHeight ?? 0}
            />
          ) : null}
          {state === 'failed' ? (
            <div
              role="alert"
              className="mx-auto mt-16 max-w-sm text-center text-sm text-slate-700 dark:text-slate-200"
            >
              <p>This text document could not be opened.</p>
              <Button
                className="mt-3"
                onClick={() => {
                  setState('loading');
                  setAttempt((n) => n + 1);
                }}
              >
                Try Again
              </Button>
            </div>
          ) : null}
          {/* The page: a fixed width and a page's height before the state arrives, so nothing shifts as it does. */}
          <div
            // CSS zoom scales the page and its layout box alike, so the scroller scrolls the page as drawn. Its width and
            // margins are its setup's; a phone flows it to the window (editing-surface.md "Phone and tablet").
            style={{
              zoom: scale,
              ...pageBox(drawn),
              ...(sheets
                ? { '--pages-width': `${sheets.width}px`, minHeight: `${sheets.height}px` }
                : { '--pages-width': 'var(--page-width)' }),
            }}
            data-page-format={page.pageless ? 'pageless' : 'pages'}
            data-editing-story={headers.editing?.kind}
            onDoubleClick={(event) => headers.onDoubleClick(event, scale)}
            data-pages={paginated ? pageList.length : undefined}
            data-laid-out={paginated ? 'pages' : 'flow'}
            className={`relative isolate mx-auto w-(--pages-width) max-w-full text-document-page px-6 py-10 text-[11pt] sm:pt-(--page-top) sm:pr-[calc((var(--pages-width)-var(--page-width))/2+var(--page-right))] sm:pb-(--page-bottom) sm:pl-[calc((var(--pages-width)-var(--page-width))/2+var(--page-left))] leading-[1.15] ${page.pageless ? '' : 'mt-6 min-h-(--page-height)'} ${state === 'failed' ? 'hidden' : ''}`}
          >
            <TextDocumentSheets
              pages={paginated && state === 'ready' ? pageList : null}
              shadow={!page.pageless}
              storyHost={headers.storyHost}
              editing={headers.editing}
              editingBox={headers.box}
              editingBar={headers.bar}
              watermark={watermarkLook(watermark.watermark, page.section.setup)}
            />
            {state === 'loading' ? (
              <p className="text-(--office-muted)" aria-live="polite">
                Loading the text document…
              </p>
            ) : null}
            <div ref={mount} />
            <TextDocumentPageNotes
              pages={paginated && state === 'ready' ? pageList : null}
              editing={headers.note}
              box={headers.noteBox}
              onPress={headers.onNotePress}
            />
            <TextDocumentEndNotes
              notes={endNotes}
              editing={headers.note}
              box={headers.noteBox}
              onPress={headers.onNotePress}
            />
          </div>
        </div>
      </OfficePanelLayout>
    </div>
  );
}
