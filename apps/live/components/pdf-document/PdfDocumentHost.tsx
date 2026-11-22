'use client';

// Where a PDF tab's surface meets the editor (docs/specs/006-document/kinds-outside-the-canvas.md "The surface"): it
// reads the session from the editor and binds the tab's live changes to the document's room. The surface's code, the
// engine and its binary load only when a PDF tab is open. `readOnly`: the other pane of a split shows the pages live,
// in Viewing ("Side by side"). A PDF in This Browser has no room (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "A PDF document in This Browser"): a sync or a Take Offline in place mounts the surface
// afresh on its new home.
import dynamic from 'next/dynamic';
import type { Tab } from '@livedoc/document';
import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { useEditorLines } from '@/components/chrome/lines/editor-lines-context';
import { useIsOfflineDocument } from '@/hooks/persistence/useIsOfflineDocument';

const PdfDocumentSurface = dynamic(
  () => import('./PdfDocumentSurface').then((m) => m.PdfDocumentSurface),
  { ssr: false },
);

export function PdfDocumentHost({ tab, readOnly = false }: { tab: Tab; readOnly?: boolean }) {
  const ctx = useEditorContext();
  const { documentId, selfParticipant, sessionShareCode, can, documentName, roomRef } = ctx;
  // The document's own parts in the title row, for the editor's pane alone.
  const office = useEditorLines()?.office ?? null;
  const local = useIsOfflineDocument(documentId);
  if (!documentId) return null;
  const canReview = !readOnly && can.pdfReviews;
  return (
    <PdfDocumentSurface
      key={`${tab.id}:${local ? 'this-browser' : 'room'}`}
      home={local ? 'this-browser' : 'room'}
      scope={{
        ownerId: selfParticipant.id,
        documentId,
        tabId: tab.id,
        shareCode: sessionShareCode,
      }}
      documentName={documentName ?? ''}
      // A session that may not change a PDF is drawn as a Viewer's (editing-modes.md "Share roles").
      level={canReview ? can.level : 'view'}
      canReview={canReview}
      author={selfParticipant.name}
      chrome={readOnly ? null : office}
      // A person is on one tab: the other pane of a split says nothing of where they are ("Presence").
      present={!readOnly}
      sequence={(op) => roomRef.current?.sequence(op) ?? Promise.resolve(false)}
    />
  );
}
