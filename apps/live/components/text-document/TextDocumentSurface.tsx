'use client';

// A text document's surface (docs/specs/034-text-documents/editing-surface.md,
// docs/specs/006-document/kinds-outside-the-canvas.md "The surface"): the office shell's title row and menus, the
// page on its ground, and the body, edited live through the room; the shell's look tokens colour it all. One surface
// is one tab: its host keys it by the tab, so another tab mounts a fresh one.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { ySyncPlugin } from 'y-prosemirror';
import type { AccessLevel } from '@livedoc/api-schema';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState } from '@livedoc/text-documents';
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
import { textDocumentEditorActions } from '@/lib/text-document/text-document-editor-actions';
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
  setTextDocumentPeers,
  textDocumentPeersPlugin,
} from '@/lib/text-document/text-document-peers';
import { useSurfaceView } from '@/hooks/ui/useSurfaceView';
import type { SurfaceSelection } from '@/lib/surface-view';
import { TextDocumentTitleRow } from './TextDocumentTitleRow';

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
  const { ownerId, documentId, tabId, shareCode } = scope;
  // The latest sender and gate, read when an update goes out, so a new room connection never rebinds the editor.
  const live = useRef({ sequence, canEdit });
  useLayoutEffect(() => {
    live.current = { sequence, canEdit };
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
      if (live.current.canEdit) view.focus();
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
        const view = new EditorView(mount.current, {
          state: EditorState.create({
            schema: textDocumentSchema,
            plugins: [
              ySyncPlugin(TextDocumentState.body(doc)),
              ...textDocumentUndoPlugins(),
              textDocumentLimitPlugin({ onRefused: () => setLimitReached('characters') }),
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
                canEdit: () => live.current.canEdit,
                publish: (selection) => setLocalTextDocumentCaret(tabId, selection),
              }),
            ],
          }),
          editable: () => live.current.canEdit,
          attributes: {
            role: 'textbox',
            'aria-multiline': 'true',
            'aria-label': 'Document body',
            // Spaces and line breaks show as typed; the caret is the focus mark, as in any word processor.
            class: 'text-document-body whitespace-pre-wrap break-words outline-none',
            spellcheck: 'true',
          },
        });
        editor.current = view;
        setEditorView(view);
        liveDoc.current = doc;
        teardown = () => {
          editor.current = null;
          setEditorView(null);
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
  }, [ownerId, documentId, tabId, shareCode, attempt, local]);

  useEffect(() => {
    if (state === 'ready' && editor.current) setTextDocumentPeers(editor.current, peers);
  }, [peers, state]);

  // Edit > Undo, Redo and Select all, run by the menus and the shortcut layer (keyboard-shortcuts.md).
  const editorActions = useMemo(
    () => textDocumentEditorActions(editorView, { canEdit }),
    [editorView, canEdit],
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
        level={level}
        editorActions={editorActions}
        keyScope={root}
        localDoc={local ? () => liveDoc.current : null}
      />
      {limitReached ? (
        <p
          role="status"
          className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          {TEXT_DOCUMENT_LIMIT_NOTICES[limitReached]}
        </p>
      ) : null}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto py-6">
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
          className={`mx-auto min-h-[1056px] w-[816px] max-w-full bg-white px-6 py-10 text-[11pt] sm:px-24 sm:py-24 leading-[1.15] text-black shadow-sm ${state === 'failed' ? 'hidden' : ''}`}
        >
          {state === 'loading' ? (
            <p className="text-slate-500" aria-live="polite">
              Loading the text document…
            </p>
          ) : null}
          <div ref={mount} />
        </div>
      </div>
    </div>
  );
}
