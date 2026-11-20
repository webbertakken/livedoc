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
import type { AccessLevel } from '@livedoc/api-schema';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState, type Style } from '@livedoc/text-documents';
import { Button } from '@livedoc/ui';
import {
  apiLoadTextDocumentState,
  apiLoadTextDocumentStateSince,
  apiPostTextDocumentUpdate,
  type TextDocumentScope,
} from '@/lib/api/text-documents';
import { debugLog } from '@/lib/debug-log';
import { openRoomYjs, type TextDocumentFrame } from '@/lib/text-document/room-yjs-provider';
import { TextDocumentCopies } from '@/lib/text-document/text-document-copies';
import { textDocumentUndoPlugins } from '@/lib/text-document/text-document-undo';
import { paintFormatPlugin } from '@/lib/text-document/text-document-paint-format';
import { paragraphBoxesPlugin } from '@/lib/text-document/text-document-paragraph-boxes';
import { listKeysPlugin } from '@/lib/text-document/text-document-list-actions';
import { listMarkersPlugin } from '@/lib/text-document/text-document-list-markers';
import { subscribeLists } from '@/lib/text-document/text-document-live-lists';
import { useTextDocumentLists } from './useTextDocumentLists';
import { textDocumentEditorActions } from '@/lib/text-document/text-document-editor-actions';
import { useTextDocumentFormatting } from '@/lib/text-document/useTextDocumentFormatting';
import { useGoogleDocumentFonts } from '@/lib/text-document/useGoogleDocumentFonts';
import { useTextDocumentParagraphStyles } from '@/lib/text-document/useTextDocumentParagraphStyles';
import { startInDefaultStyles } from '@/lib/text-document/text-document-default-styles';
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
import { OfficePanel, OfficePanelLayout } from '@/components/office/OfficePanel';
import { useOfficePanels } from '@/lib/office/useOfficePanels';
import { createTextDocumentChanges } from '@/lib/text-document/text-document-changes';
import { TEXT_DOCUMENT_PANELS } from '@/lib/text-document/text-document-panels';
import { TextDocumentOutline } from './TextDocumentOutline';
import { useTextDocumentParagraphs } from './useTextDocumentParagraphs';
import {
  placeTextDocumentCaret,
  textDocumentCaretPoint,
} from '@/lib/text-document/text-document-caret';
import { TextDocumentTitleRow } from './TextDocumentTitleRow';
import { documentTextStyle } from '@/lib/document-fonts/document-text-style';
// The served document fonts' faces, loaded with the surface, never on other pages (fonts.md "Served from LiveDoc").
import '@/app/document-fonts.css';

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
  // The writing changed: what the outline listens to, so the surface does not draw again on every keystroke.
  const [changes] = useState(createTextDocumentChanges);
  // The side panels (office-shell.md "Side panels"); closing one gives the writing the keyboard back.
  const panels = useOfficePanels({
    kind: 'TextDocument',
    panels: TEXT_DOCUMENT_PANELS,
    onFocusDocument: () => editor.current?.focus(),
  });
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
  } = useOfficeMode(level, 'TextDocumentMode');
  const writes = canEdit && mode === 'editing';
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
        // A text document just made here starts in its maker's default styles (text-and-paragraphs.md).
        startInDefaultStyles(doc, { tabId, format: live.current.format, canEdit: gate.canEdit });
        const view = new EditorView(mount.current, {
          state: EditorState.create({
            schema: textDocumentSchema,
            plugins: [
              ySyncPlugin(TextDocumentState.body(doc)),
              changes.plugin,
              ...textDocumentUndoPlugins(),
              textDocumentLimitPlugin({ onRefused: () => setLimitReached('characters') }),
              // Copy and paste text formatting, and the paint roller (text-and-paragraphs.md "Paint format").
              paintFormatPlugin(),
              // Adjacent paragraphs with the same borders share one box ("Borders and shading").
              paragraphBoxesPlugin(() => ({
                styles: TextDocumentState.styles(doc, live.current.format),
                defaults: TextDocumentState.defaults(doc, live.current.format),
              })),
              // Lists: Enter, Backspace and Tab in an item, and the items drawn (lists.md).
              listKeysPlugin(),
              listMarkersPlugin(
                () => TextDocumentState.lists(doc),
                (listener) => subscribeLists(doc, listener),
              ),
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

  // Format > Text and the toolbar's text controls (text-and-paragraphs.md "Text formatting").
  const formatting = useTextDocumentFormatting(editorView, liveDoc, format, writes);
  // A family from Google Fonts that the text names loads from there (fonts.md "Substitution").
  useGoogleDocumentFonts(editorView, liveDoc, format, changes.subscribe);
  // Format > Paragraph styles and the Styles control, the paragraphs drawn in their styles.
  const paragraphStyles = useTextDocumentParagraphStyles(
    editorView,
    liveDoc,
    format,
    writes,
    ownerId,
  );
  // Format > Align & indent, the toolbar's Align and indent controls, and Indentation options.
  // Format > Bullets & numbering and the toolbar's list buttons (lists.md).
  const lists = useTextDocumentLists(editorView, liveDoc, writes);
  const paragraphs = useTextDocumentParagraphs(
    editorView,
    liveDoc,
    format,
    writes,
    lists.stepLevel,
  );
  // Edit > Undo, Redo and Select all, run by the menus and the shortcut layer (keyboard-shortcuts.md).
  const editorActions = useMemo(
    () => ({
      ...textDocumentEditorActions(editorView, { canEdit: writes }),
      ...formatting.actions,
      ...paragraphStyles.actions,
      ...paragraphs.actions,
      ...lists.actions,
      ...modeActions,
      ...panels.actions,
    }),
    [
      editorView,
      writes,
      formatting.actions,
      paragraphStyles.actions,
      paragraphs.actions,
      lists.actions,
      modeActions,
      panels.actions,
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
        level={levelInMode(level, mode)}
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
      {lists.dialog}
      {limitReached ? (
        <p
          role="status"
          className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          {TEXT_DOCUMENT_LIMIT_NOTICES[limitReached]}
        </p>
      ) : null}
      <OfficePanelLayout
        left={
          panels.open.left === 'outline' ? (
            <OfficePanel
              spec={TEXT_DOCUMENT_PANELS[0]!}
              onClose={() => panels.close('left')}
              focusNonce={panels.focusNonce}
            >
              <TextDocumentOutline view={editorView} changes={changes} readStyles={readStyles} />
            </OfficePanel>
          ) : null
        }
        right={null}
      >
        <div ref={scroller} data-region="document" className="min-h-0 flex-1 overflow-y-auto py-6">
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
            // CSS zoom scales the page and its layout box alike, so the scroller scrolls the page as drawn.
            style={{ zoom: scale }}
            className={`mx-auto min-h-[1056px] w-[816px] max-w-full text-document-page px-6 py-10 text-[11pt] sm:px-24 sm:py-24 leading-[1.15] shadow-sm ${state === 'failed' ? 'hidden' : ''}`}
          >
            {state === 'loading' ? (
              <p className="text-(--office-muted)" aria-live="polite">
                Loading the text document…
              </p>
            ) : null}
            <div ref={mount} />
          </div>
        </div>
      </OfficePanelLayout>
    </div>
  );
}
