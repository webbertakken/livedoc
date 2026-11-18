'use client';

// Where a text document tab's surface meets the editor (docs/specs/006-document/kinds-outside-the-canvas.md "The
// surface"): it reads the session from the editor and sends through the document's room. The surface's code, Yjs and
// ProseMirror's binding load only when a text document tab is open.
import dynamic from 'next/dynamic';
import { useEditorContext } from '@/app/document/[id]/EditorContext';

const TextDocumentSurface = dynamic(
  () => import('./TextDocumentSurface').then((m) => m.TextDocumentSurface),
  { ssr: false },
);

export function TextDocumentHost({ tabId }: { tabId: string }) {
  const ctx = useEditorContext();
  const { documentId, selfParticipant, sessionShareCode, roomRef, can, documentName } = ctx;
  if (!documentId) return null;
  return (
    <TextDocumentSurface
      key={tabId}
      scope={{ ownerId: selfParticipant.id, documentId, tabId, shareCode: sessionShareCode }}
      documentName={documentName ?? ''}
      canEdit={can.textDocumentEdits}
      send={(op) => roomRef.current?.send({ kind: 'op', op })}
    />
  );
}
