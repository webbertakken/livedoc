'use client';

// The text document's title row in its bare form (docs/specs/034-text-documents/editing-surface.md "The title row"):
// the name, its format, and a File menu holding Open and Download, drawn by the office documents' shared row. A text
// document leaves in the format it is held in (text-document.md "The format it is in").
import { useState } from 'react';
import type { TextDocumentFormat } from '@livedoc/document';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import { apiDownloadTextDocument } from '@/lib/api/text-documents';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import { track } from '@/lib/telemetry';
import { openTextDocumentFile } from '@/lib/text-document/open-text-document-file';

// What the title row says of each format, and the file it downloads.
const FORMATS = {
  odf: {
    badge: '.ODT',
    title: 'OpenDocument format',
    type: 'odt',
    label: 'Download as OpenDocument (.odt)',
    telemetry: 'TextDocumentOdt',
  },
  ooxml: {
    badge: '.DOCX',
    title: 'Microsoft Word format',
    type: 'docx',
    label: 'Download as Microsoft Word (.docx)',
    telemetry: 'TextDocumentDocx',
  },
} as const;

export function TextDocumentTitleRow({
  scope,
  documentName,
  format,
}: {
  scope: TextDocumentScope;
  documentName: string;
  format: TextDocumentFormat;
}) {
  const held = FORMATS[format];
  const [problem, setProblem] = useState<string | null>(null);

  const download = async () => {
    try {
      const { blob, fileName } = await apiDownloadTextDocument(scope, held.type);
      downloadBlob(blob, fileName);
      track('Document', 'Exported', held.telemetry);
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
      format={held.badge}
      formatTitle={held.title}
      openAccept=".odt,.fodt,.docx,application/vnd.oasis.opendocument.text,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      onOpenFile={(file) => void open(file)}
      items={[{ label: held.label, run: download }]}
      problem={problem}
    />
  );
}
