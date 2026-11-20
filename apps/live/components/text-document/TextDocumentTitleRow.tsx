'use client';

// The text document's title row (docs/specs/034-text-documents/editing-surface.md "The title row", "The menu bar"):
// the office shell's, filled with the text document's menus and shortcuts. Download writes the file in the format the
// text document is held in (text-document.md "The format it is in"); the editor's own items come from the surface.
import { useMemo, useState, type RefObject } from 'react';
import type * as Y from 'yjs';
import type { AccessLevel } from '@livedoc/api-schema';
import type { TextDocumentFormat } from '@livedoc/document';
import type { TextDocumentFileType } from '@livedoc/text-documents';
import type { OfficeChrome } from '@/components/office/office-chrome';
import type { OfficeSaveStatus } from '@/components/office/office-save-status';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import { apiDownloadTextDocument } from '@/lib/api/text-documents';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { textDocumentMenus } from '@/lib/text-document/text-document-menus';
import { TEXT_DOCUMENT_SHORTCUTS } from '@/lib/text-document/text-document-shortcuts';
import { TEXT_DOCUMENT_TOOLBAR } from '@/lib/text-document/text-document-toolbar';
import type { OfficeZoom } from '@/components/office/OfficeZoomField';
import { openTextDocumentFile } from '@/lib/text-document/open-text-document-file';

// A text document no room holds is written in this browser; the writer loads only when it is asked for.
async function writtenHere(
  doc: Y.Doc | null,
  format: TextDocumentFormat,
  name: string,
  type: TextDocumentFileType,
) {
  if (!doc) throw new Error('text document not loaded');
  const { textDocumentFileOf } = await import('@/lib/text-document/text-document-file');
  return textDocumentFileOf(doc, format, name, type);
}

// What the title row says of each format, and the files it downloads as itself.
const FORMATS = {
  odf: { badge: '.ODT', title: 'OpenDocument format' },
  ooxml: { badge: '.DOCX', title: 'Microsoft Word format' },
} as const;

const DOWNLOADS: Record<TextDocumentFileType, { item: string; telemetry: string }> = {
  odt: { item: 'download-odt', telemetry: 'TextDocumentOdt' },
  fodt: { item: 'download-fodt', telemetry: 'TextDocumentFodt' },
  docx: { item: 'download-docx', telemetry: 'TextDocumentDocx' },
};

const NATIVE: Record<TextDocumentFormat, readonly TextDocumentFileType[]> = {
  odf: ['odt', 'fodt'],
  ooxml: ['docx'],
};

const OPEN_ACCEPT =
  '.odt,.fodt,.docx,application/vnd.oasis.opendocument.text,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function TextDocumentTitleRow({
  scope,
  documentName,
  format,
  level,
  editorActions,
  keyScope,
  localDoc = null,
  chrome = null,
  onFollow,
  saveStatus = null,
  zoom = null,
}: {
  scope: TextDocumentScope;
  documentName: string;
  format: TextDocumentFormat;
  level: AccessLevel;
  // What the editor runs: Undo, Redo, Select all, ...
  editorActions: OfficeActions;
  keyScope: RefObject<HTMLElement | null>;
  // A text document in This Browser: its file is written here, from its live state (live-editing-and-storage.md).
  localDoc?: (() => Y.Doc | null) | null;
  chrome?: OfficeChrome | null;
  // Brings a collaborator's caret into view; false when they have none here.
  onFollow?: (personId: string) => boolean;
  saveStatus?: OfficeSaveStatus | null;
  zoom?: OfficeZoom | null;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const catalogue = useMemo(() => textDocumentMenus(format), [format]);

  const actions = useMemo(() => {
    const download = async (type: TextDocumentFileType) => {
      setProblem(null);
      try {
        const { blob, fileName } = localDoc
          ? await writtenHere(localDoc(), format, documentName, type)
          : await apiDownloadTextDocument(scope, type);
        downloadBlob(blob, fileName);
        track('Document', 'Exported', DOWNLOADS[type].telemetry);
      } catch (error) {
        setProblem('The file could not be downloaded. Try again.');
        debugLog('[text-document] download failed', { type, error: String(error) });
      }
    };
    const out: Record<string, OfficeActions[string]> = { ...editorActions };
    for (const type of NATIVE[format])
      out[DOWNLOADS[type].item] = { run: () => void download(type) };
    return out;
  }, [editorActions, format, documentName, localDoc, scope]);

  const opening = useMemo(
    () => ({
      accept: OPEN_ACCEPT,
      onFile: (file: File) => {
        setProblem(null);
        void openTextDocumentFile(scope.ownerId, file).then((opened) => {
          if (opened.ok) window.location.assign(`/document/${opened.documentId}`);
          else setProblem(opened.message);
        });
      },
    }),
    [scope.ownerId],
  );

  return (
    <OfficeTitleRow
      name={documentName || 'Untitled document'}
      format={FORMATS[format].badge}
      formatTitle={FORMATS[format].title}
      problem={problem}
      catalogue={catalogue}
      level={level}
      actions={actions}
      shortcuts={TEXT_DOCUMENT_SHORTCUTS}
      keyScope={keyScope}
      opening={opening}
      telemetryKind="TextDocument"
      chrome={chrome}
      tabId={scope.tabId}
      onFollow={onFollow}
      saveStatus={saveStatus}
      toolbar={TEXT_DOCUMENT_TOOLBAR}
      zoom={zoom}
    />
  );
}
