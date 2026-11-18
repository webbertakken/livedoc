'use client';

// The text document's title row in its bare form (docs/specs/034-text-documents/editing-surface.md "The title row"):
// the name, its format, and a File menu holding Open and Download, drawn by the office documents' shared row.
import { useState } from 'react';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import { apiDownloadTextDocument } from '@/lib/api/text-documents';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import { track } from '@/lib/telemetry';
import { openTextDocumentFile } from '@/lib/text-document/open-text-document-file';

export function TextDocumentTitleRow({
  scope,
  documentName,
}: {
  scope: TextDocumentScope;
  documentName: string;
}) {
  const [problem, setProblem] = useState<string | null>(null);

  const download = async () => {
    try {
      const { blob, fileName } = await apiDownloadTextDocument(scope, 'odt');
      downloadBlob(blob, fileName);
      track('Document', 'Exported', 'TextDocumentOdt');
    } catch (error) {
      setProblem('The file could not be downloaded. Try again.');
      debugLog('[text-document] download failed', { error: String(error) });
    }
  };

  const open = async (file: File) => {
    setProblem(null);
    const opened = await openTextDocumentFile(scope.ownerId, file);
    if (opened.ok) window.location.assign(`/document/${opened.documentId}`);
    else setProblem(opened.message);
  };

  return (
    <OfficeTitleRow
      name={documentName || 'Untitled document'}
      format=".ODT"
      formatTitle="OpenDocument format"
      openAccept=".odt,.fodt,application/vnd.oasis.opendocument.text"
      onOpenFile={(file) => void open(file)}
      items={[{ label: 'Download as OpenDocument (.odt)', run: download }]}
      problem={problem}
    />
  );
}
