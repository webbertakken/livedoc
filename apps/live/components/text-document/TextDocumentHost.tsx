'use client';

// Where a text document tab's surface meets the editor (docs/specs/006-document/kinds-outside-the-canvas.md "The
// surface"): it reads the session from the editor and sends through the document's room. The surface's code, Yjs and
// ProseMirror's binding load only when a text document tab is open. `readOnly`: the other pane of a split shows the
// tab live without editing it ("Side by side").
import dynamic from 'next/dynamic';
import { useCallback, useMemo } from 'react';
import { useEditorDrawingTabs } from './useEditorDrawingTabs';
import { textDocumentFormatOf, type Tab } from '@livedoc/document';
import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { useEditorLines } from '@/components/chrome/lines/editor-lines-context';
import { useIsOfflineDocument } from '@/hooks/persistence/useIsOfflineDocument';
import { commenterOf } from '@/lib/text-document/text-document-commenter';

const TextDocumentSurface = dynamic(
  () => import('./TextDocumentSurface').then((m) => m.TextDocumentSurface),
  { ssr: false },
);

export function TextDocumentHost({ tab, readOnly = false }: { tab: Tab; readOnly?: boolean }) {
  const ctx = useEditorContext();
  const { documentId, selfParticipant, sessionShareCode, roomRef, can, documentName } = ctx;
  // A text document in This Browser has no room (live-editing-and-storage.md "A text document in This Browser"); a
  // sync or a Take Offline in place mounts the surface afresh on its new home.
  const local = useIsOfflineDocument(documentId);
  // The document's own parts in the title row, for the editor's pane alone (editing-surface.md "The title row").
  const office = useEditorLines()?.office ?? null;
  // Drawings are an Editor's, in the editor's pane (objects.md "Drawings"); a new one is a new tab, which a link to
  // one tab never adds ("Sharing").
  const { addDrawingTab, isStructureReadOnly } = ctx;
  const mayDraw = !readOnly && can.textDocumentEdits && !isStructureReadOnly;
  const createDrawing = useCallback(() => addDrawingTab(tab.id), [addDrawingTab, tab.id]);
  // A drawing's picture opens its drawing tab, for anyone who sees the text document and is shared the tab (objects.md
  // "Opening it again").
  const drawingTabs = useEditorDrawingTabs();
  // Who comments here (review.md "Threads in the margin"): one value while the person and their key stay.
  const commenter = useMemo(
    () =>
      commenterOf({
        commentKey: can.commentKey,
        level: can.level,
        self: selfParticipant,
        local,
        readOnly,
      }),
    [can.commentKey, can.level, selfParticipant, local, readOnly],
  );
  // Who reads the comments, and the email a mention asks for (review.md "Mentions").
  const { accountId, commentMentions } = ctx;
  const mentions = useMemo(
    () => ({
      selfUserId: accountId ?? null,
      onMentioned: commentMentions.notifyMentioned,
      onAssigned: commentMentions.notifyAssigned,
    }),
    [accountId, commentMentions.notifyMentioned, commentMentions.notifyAssigned],
  );
  // An Inbox row's thread on this tab (docs/specs/013-workspace/inbox.md §1.8), for the editor's pane alone.
  const { textThreadArrival } = ctx;
  const arrival = useMemo(
    () =>
      !readOnly && textThreadArrival?.tabId === tab.id
        ? { threadId: textThreadArrival.threadId, n: textThreadArrival.n }
        : null,
    [readOnly, textThreadArrival, tab.id],
  );
  if (!documentId) return null;
  return (
    <TextDocumentSurface
      key={`${tab.id}:${local ? 'local' : 'room'}`}
      local={local}
      scope={{
        ownerId: selfParticipant.id,
        documentId,
        tabId: tab.id,
        shareCode: sessionShareCode,
      }}
      documentName={documentName ?? ''}
      format={textDocumentFormatOf(tab)}
      canEdit={!readOnly && can.textDocumentEdits}
      level={readOnly ? 'view' : can.level}
      sequence={(op) => roomRef.current?.sequence(op) ?? Promise.resolve(false)}
      chrome={readOnly ? null : office}
      documents={ctx.documentList}
      createDrawing={mayDraw ? createDrawing : null}
      drawingTabs={drawingTabs}
      commenter={commenter}
      mentions={mentions}
      arrival={arrival}
    />
  );
}
