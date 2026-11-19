'use client';

// A text document's surface (docs/specs/034-text-documents/editing-surface.md,
// docs/specs/006-document/kinds-outside-the-canvas.md "The surface"): the title row, the page on its grey ground, and
// the body, edited live through the room. Its bare form: the office shell's title row, menus and toolbar take this
// one's place. One surface is one tab: its host keys it by the tab, so another tab mounts a fresh one.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { redo, undo, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState } from '@livedoc/text-documents';
import { Button } from '@livedoc/ui';
import { apiLoadTextDocumentState, type TextDocumentScope } from '@/lib/api/text-documents';
import { debugLog } from '@/lib/debug-log';
import { bindRoomYjsProvider } from '@/lib/text-document/room-yjs-provider';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import {
  setLocalTextDocumentCaret,
  useTextDocumentPeers,
} from '@/lib/text-document/text-document-carets-store';
import {
  setTextDocumentPeers,
  textDocumentPeersPlugin,
} from '@/lib/text-document/text-document-peers';
import { TextDocumentTitleRow } from './TextDocumentTitleRow';

export type TextDocumentSurfaceProps = {
  scope: TextDocumentScope;
  documentName: string;
  format: TextDocumentFormat;
  canEdit: boolean;
  send: (op: { kind: 'text-document'; tabId: string; update: string }) => void;
};

type SurfaceState = 'loading' | 'ready' | 'failed';

export function TextDocumentSurface({
  scope,
  documentName,
  format,
  canEdit,
  send,
}: TextDocumentSurfaceProps) {
  const mount = useRef<HTMLDivElement | null>(null);
  const editor = useRef<EditorView | null>(null);
  // Collaborators' carets in this tab's writing (live-editing-and-storage.md "Presence"), drawn by the editor.
  const peers = useTextDocumentPeers(scope.tabId);
  const [state, setState] = useState<SurfaceState>('loading');
  const [attempt, setAttempt] = useState(0);
  const { ownerId, documentId, tabId, shareCode } = scope;
  // The latest sender and gate, read when an update goes out, so a new room connection never rebinds the editor.
  const live = useRef({ send, canEdit });
  useLayoutEffect(() => {
    live.current = { send, canEdit };
  });

  useEffect(() => {
    let cancelled = false;
    let teardown = () => {};
    const where = { ownerId, documentId, tabId, shareCode };
    const started = performance.now();
    debugLog('[text-document] surface loading', { documentId, tabId, ownerId, shareCode });
    apiLoadTextDocumentState(where)
      .then((stored) => {
        if (cancelled || !mount.current) return;
        // Load, then bind: the editor never sees an empty state, so it never invents a first paragraph.
        const doc = TextDocumentState.load([stored]);
        const unbind = bindRoomYjsProvider({
          doc,
          tabId,
          get canEdit() {
            return live.current.canEdit;
          },
          send: (op) => live.current.send(op),
          loadState: () => apiLoadTextDocumentState(where),
        });
        const view = new EditorView(mount.current, {
          state: EditorState.create({
            schema: textDocumentSchema,
            plugins: [
              ySyncPlugin(TextDocumentState.body(doc)),
              yUndoPlugin(),
              keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo }),
              keymap(baseKeymap),
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
        teardown = () => {
          editor.current = null;
          view.destroy();
          unbind();
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
  }, [ownerId, documentId, tabId, shareCode, attempt]);

  useEffect(() => {
    if (state === 'ready' && editor.current) setTextDocumentPeers(editor.current, peers);
  }, [peers, state]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-slate-900"
      data-text-document-surface={state}
    >
      <TextDocumentTitleRow scope={scope} documentName={documentName} format={format} />
      <div className="min-h-0 flex-1 overflow-y-auto py-6">
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
