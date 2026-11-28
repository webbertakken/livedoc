'use client';

// The text document's title row (docs/specs/034-text-documents/editing-surface.md "The title row", "The menu bar"):
// the office shell's, filled with the text document's menus and shortcuts. Download writes the file in the format the
// text document is held in (text-document.md "The format it is in"), or a converted copy after the conversion dialog
// (standard-mapping.md "Conversion"); the editor's own items come from the surface.
import { useMemo, useState, type RefObject } from 'react';
import { useTextDocumentConversion } from './useTextDocumentConversion';
import type { OfficeProposals } from '@/lib/office/office-mode';
import type * as Y from 'yjs';
import type { AccessLevel } from '@livedoc/api-schema';
import type { TextDocumentFormat } from '@livedoc/document';
import type { TextDocumentDownloadType } from '@livedoc/text-documents';
import type { OfficeChrome } from '@/components/office/office-chrome';
import type { OfficeSaveStatusSource } from '@/components/office/office-save-status';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import type { TextDocumentScope } from '@/lib/api/text-documents';
import { apiDownloadTextDocument } from '@/lib/api/text-documents';
import { apiFetchImageBytes } from '@/lib/api/images';
import { leftOutNotice, textDocumentDownload } from '@/lib/text-document/text-document-download';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  textDocumentMenus,
  textDocumentTextContextMenu,
} from '@/lib/text-document/text-document-menus';
import type { Point } from '@/lib/office/context-menu-place';
import { TEXT_DOCUMENT_SHORTCUTS } from '@/lib/text-document/text-document-shortcuts';
import { TEXT_DOCUMENT_TOOLBAR } from '@/lib/text-document/text-document-toolbar';
import type { OfficeZoom } from '@/components/office/OfficeZoomField';
import type { OfficeFontSize } from '@/components/office/OfficeFontSizeField';
import type { OfficeFontFamily } from '@/components/office/OfficeFontMenu';
import type { OfficeColours } from '@/components/office/OfficeColourControl';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import type { OfficeModeChoice } from '@/components/office/OfficeModeSwitch';
import { openTextDocumentFile } from '@/lib/text-document/open-text-document-file';
import { COMMENTS_PANEL } from '@/lib/text-document/text-document-panels';

// What the title row says of each format, and the files it downloads as itself.
const FORMATS = {
  odf: { badge: '.ODT', title: 'OpenDocument format' },
  ooxml: { badge: '.DOCX', title: 'Microsoft Word format' },
} as const;

const DOWNLOADS: Record<TextDocumentDownloadType, { item: string; telemetry: string }> = {
  odt: { item: 'download-odt', telemetry: 'TextDocumentOdt' },
  fodt: { item: 'download-fodt', telemetry: 'TextDocumentFodt' },
  docx: { item: 'download-docx', telemetry: 'TextDocumentDocx' },
  txt: { item: 'download-txt', telemetry: 'TextDocumentTxt' },
  md: { item: 'download-md', telemetry: 'TextDocumentMd' },
  html: { item: 'download-html', telemetry: 'TextDocumentHtml' },
  epub: { item: 'download-epub', telemetry: 'TextDocumentEpub' },
  rtf: { item: 'download-rtf', telemetry: 'TextDocumentRtf' },
};

const FILE_TYPES: readonly TextDocumentDownloadType[] = [
  'docx',
  'odt',
  'fodt',
  'rtf',
  'txt',
  'html',
  'epub',
  'md',
];

// What File > Open takes (files-and-print.md "Opening"): the formats a text document is held in, their templates and
// Word's macro-enabled file (its macros dropped), and the imports.
const OPEN_ACCEPT = [
  '.odt,.fodt,.ott,.docx,.dotx,.docm,.txt,.md,.markdown,.html,.htm,.rtf,.pdf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.text-template',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.ms-word.document.macroEnabled.12',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/rtf',
  'text/rtf',
  'application/pdf',
].join(',');

export function TextDocumentTitleRow({
  scope,
  documentName,
  format,
  level,
  editorActions,
  keyScope,
  localDoc = null,
  liveDoc = null,
  drawDrawing = null,
  chrome = null,
  onFollow,
  saveStatus = null,
  zoom = null,
  fontSize = null,
  fontFamily = null,
  colours = null,
  choices = null,
  refresh,
  mode = null,
  caret = null,
  proposals = null,
  screenReader = false,
  conversion = null,
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
  // The writing bound to the room, and a drawing drawn now: a writing naming drawings is written here, each drawn
  // afresh into the file (objects.md "In the file").
  liveDoc?: (() => Y.Doc | null) | null;
  drawDrawing?: ((drawingTabId: string) => Promise<Uint8Array | null>) | null;
  chrome?: OfficeChrome | null;
  // Brings a collaborator's caret into view; false when they have none here.
  onFollow?: (personId: string) => boolean;
  saveStatus?: OfficeSaveStatusSource | null;
  zoom?: OfficeZoom | null;
  // The toolbar's font size, and when what the toolbar shows may have changed (text-and-paragraphs.md).
  fontSize?: OfficeFontSize | null;
  fontFamily?: OfficeFontFamily | null;
  colours?: OfficeColours | null;
  choices?: OfficeChoices | null;
  refresh?: (listener: () => void) => () => void;
  mode?: OfficeModeChoice | null;
  // The caret, for the context menu on text (editing-surface.md "Context menus"); none until the writing is bound.
  caret?: { point: () => Point | null; place: (point: Point) => void } | null;
  // Suggesting drawn above a Participant's level: what can be suggested runs above it (review.md "While suggesting").
  proposals?: OfficeProposals | null;
  // Screen reader support is on: the Accessibility menu shows (tools.md "Accessibility settings").
  screenReader?: boolean;
  // The body's undo manager and the tab's format, for File > Convert (standard-mapping.md "Conversion"); a converted
  // download needs neither.
  conversion?: {
    undoManager: () => Y.UndoManager | null;
    setFormat: ((format: TextDocumentFormat) => void) | null;
  } | null;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const catalogue = useMemo(
    () => textDocumentMenus(format, { screenReader }),
    [format, screenReader],
  );
  const contextMenu = useMemo(
    () =>
      caret
        ? {
            entries: textDocumentTextContextMenu(catalogue),
            caretPoint: caret.point,
            placeCaret: caret.place,
          }
        : null,
    [catalogue, caret],
  );

  // A file in the document's own format, or the other's converted copy once the dialog is confirmed.
  const download = async (type: TextDocumentDownloadType) => {
    setProblem(null);
    try {
      const here = localDoc?.() ?? null;
      if (localDoc && !here) throw new Error('text document not loaded');
      const { blob, fileName, leftOut } = await textDocumentDownload({
        file: { format, name: documentName, type },
        localDoc: here,
        liveDoc: liveDoc?.() ?? null,
        draw: drawDrawing,
        // A picture whose media is in the gallery is read back from it (objects.md "Where the bytes live").
        readImage: (imageId) =>
          apiFetchImageBytes(scope.ownerId, imageId, {
            documentId: scope.documentId,
            shareCode: scope.shareCode,
          }),
        fromApi: () => apiDownloadTextDocument(scope, type),
      });
      downloadBlob(blob, fileName);
      if (leftOut > 0) setProblem(leftOutNotice(leftOut));
      track('Document', 'Exported', DOWNLOADS[type].telemetry);
    } catch (error) {
      setProblem('The file could not be downloaded. Try again.');
      debugLog('[text-document] download failed', { type, error: String(error) });
    }
  };
  const converting = useTextDocumentConversion({
    format,
    doc: () => localDoc?.() ?? liveDoc?.() ?? null,
    undoManager: () => conversion?.undoManager() ?? null,
    setFormat: conversion?.setFormat ?? null,
    download,
    setProblem,
  });

  const { download: downloadAs, convert } = converting;
  const actions = useMemo(() => {
    const out: Record<string, OfficeActions[string]> = { ...editorActions };
    for (const type of FILE_TYPES) out[DOWNLOADS[type].item] = { run: () => downloadAs(type) };
    if (convert)
      out[format === 'odf' ? 'convert-to-word' : 'convert-to-opendocument'] = { run: convert };
    return out;
  }, [editorActions, format, downloadAs, convert]);

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
    <>
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
        fontSize={fontSize}
        fontFamily={fontFamily}
        colours={colours}
        choices={choices}
        refresh={refresh}
        mode={mode}
        contextMenu={contextMenu}
        commentHistoryItem={COMMENTS_PANEL.item}
        proposals={proposals}
      />
      {converting.dialog}
    </>
  );
}
