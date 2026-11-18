'use client';

// Where a spreadsheet's surface meets the editor (docs/specs/006-document/kinds-outside-the-canvas.md "The surface"):
// it reads the session, the document's tabs and its workbook record from the editor; the sheet store reaches the room
// through the editor's sheets bridge. The surface's code and the engine load only when a spreadsheet opens.
import dynamic from 'next/dynamic';
import { useEditorContext } from '@/app/document/[id]/EditorContext';

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
  } = useEditorContext();
  if (!documentId || !documentWorkbook) return null;
  return (
    <SpreadsheetSurface
      scope={{ ownerId: selfParticipant.id, documentId, shareCode: sessionShareCode }}
      tabId={tabId}
      tabs={tabs.map((t) => ({ id: t.id, name: t.name }))}
      documentName={documentName ?? ''}
      workbook={documentWorkbook}
      onSelectTab={setActiveId}
    />
  );
}
