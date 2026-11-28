'use client';

// Where a spreadsheet's surface meets the editor (docs/specs/006-document/kinds-outside-the-canvas.md "The surface"):
// it reads the session, the document's tabs and its workbook record from the editor; the sheet store reaches the room
// through the editor's sheets bridge. The surface's code and the engine load only when a spreadsheet opens.
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { useIsOfflineDocument } from '@/hooks/persistence/useIsOfflineDocument';
import { commenterOf } from '@/lib/office/review/office-commenter';
import type { SpreadsheetReview } from './spreadsheet-review-context';

const SpreadsheetSurface = dynamic(
  () => import('./SpreadsheetSurface').then((m) => m.SpreadsheetSurface),
  { ssr: false },
);

export function SpreadsheetHost({ tabId }: { tabId: string }) {
  const {
    documentId,
    selfParticipant,
    sessionShareCode,
    documentName,
    tabs,
    setActiveId,
    documentWorkbook,
    syncToCloud,
    receiveWorkbookRecord,
    undo,
    redo,
    canUndo,
    canRedo,
    tickTabs,
    documentList,
    can,
    accountId,
    commentMentions,
    threadArrival,
  } = useEditorContext();
  // Who comments (review.md "Comments"): the room ticket's key, never in This Browser (D656), never a Viewer (D655).
  const local = useIsOfflineDocument(documentId);
  const review = useMemo(
    (): SpreadsheetReview => ({
      commenter: local
        ? null
        : commenterOf({
            commentKey: can.commentKey,
            level: can.level,
            self: selfParticipant,
            local: false,
            readOnly: false,
          }),
      local,
      selfUserId: accountId ?? null,
      onMentioned: commentMentions.notifyMentioned,
      onAssigned: commentMentions.notifyAssigned,
      // An Inbox row's thread on this sheet's tab (inbox.md §1.8).
      arrival:
        threadArrival?.tabId === tabId
          ? { threadId: threadArrival.threadId, n: threadArrival.n }
          : null,
    }),
    [
      local,
      can.commentKey,
      can.level,
      selfParticipant,
      accountId,
      commentMentions.notifyMentioned,
      commentMentions.notifyAssigned,
      threadArrival,
      tabId,
    ],
  );
  if (!documentId || !documentWorkbook) return null;
  return (
    <SpreadsheetSurface
      scope={{ ownerId: selfParticipant.id, documentId, shareCode: sessionShareCode }}
      tabId={tabId}
      tabs={tabs.map((t) => ({ id: t.id, name: t.name }))}
      documentName={documentName ?? ''}
      workbook={documentWorkbook}
      onSelectTab={setActiveId}
      editTabs={tickTabs}
      // Imports in This Browser wait for the document's own Sync Document, never as the 'self' placeholder.
      sync={{ run: syncToCloud, ready: selfParticipant.id !== 'self' }}
      onWorkbook={receiveWorkbookRecord}
      history={{ undo: () => void undo(), redo: () => void redo(), canUndo, canRedo }}
      documents={documentList}
      review={review}
    />
  );
}
