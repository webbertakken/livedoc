// File > Open > Upload (docs/specs/034-text-documents/files-and-print.md "Opening"): a file from the computer becomes
// a new text document in its format, named after the file; a Plain Text, Markdown, HTML, Rich Text or PDF file is imported into a new
// OpenDocument one. The api reads it under the package's guards and answers a named rejection, which this words for
// the person.
import { base64OfBytes, importTypeOfFileName } from '@livedoc/text-documents';
import { ApiError, apiCreateDocument } from '@/lib/api-client';
import { createIdsFor } from '@/lib/new-document/create-failure';
import { debugLog } from '@/lib/debug-log';
import { keepImportReport } from '@/lib/office/import-report-handoff';
import { track } from '@/lib/telemetry';
import type { PdfImportEngine } from './import-pdf-file';
import { formatOfFileName, newTextDocumentTab, UNTITLED_TEXT_DOCUMENT } from './text-document-tab';

export type OpenedTextDocument = { ok: true; documentId: string } | { ok: false; message: string };

// What each named rejection says (docs/specs/020-import-export/office-packages.md "Named rejections").
const REJECTION_COPY: Record<string, string> = {
  package_damaged: 'This file is damaged and could not be opened.',
  package_too_large: 'This file is too large to open.',
  package_encrypted:
    'This file is protected by a password. Remove the password, then open it again.',
  package_wrong_type: 'This file is not a text document LiveDoc can open yet.',
  xml_doctype_refused: 'This file holds content LiveDoc never opens.',
  xml_malformed: 'This file is damaged and could not be opened.',
  picture_too_large: 'A picture in this file is too large to open.',
  document_too_large: 'This file is past the 1,020,000-character limit of a text document.',
};

const GENERIC = 'The file could not be opened. Try again.';

const startPdfEngineWorker = async (): Promise<PdfImportEngine> =>
  (await import('@/lib/pdf-document/pdf-engine-client')).startPdfEngineWorker();

/** Each file's `Tab·Imported` type, by extension; one LiveDoc opens as itself and names none is an OpenDocument one. */
const IMPORTED_TYPES: Readonly<Record<string, string>> = {
  docx: 'Docx',
  dotx: 'Dotx',
  docm: 'Docm',
  ott: 'Ott',
  txt: 'Txt',
  md: 'Md',
  markdown: 'Md',
  html: 'Html',
  htm: 'Html',
  rtf: 'Rtf',
};

/** The `Tab·Imported` type of a file by its name. */
export const importedTypeOf = (fileName: string): string =>
  IMPORTED_TYPES[/\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? ''] ?? 'Odt';

/** The document's name from the file's: its name without the extension. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || UNTITLED_TEXT_DOCUMENT;
}

export async function openTextDocumentFile(
  ownerId: string,
  file: File,
  // The PDF engine, started only when a PDF is imported (files-and-print.md "A PDF imported").
  startPdfEngine: () => Promise<PdfImportEngine> = startPdfEngineWorker,
): Promise<OpenedTextDocument> {
  const name = nameFromFile(file.name);
  // The reader and the engine load only when a PDF is imported, never with the editor.
  if (/\.pdf$/i.test(file.name))
    return (await import('./import-pdf-file')).importPdfFile(ownerId, file, name, startPdfEngine);
  const { documentId, tabId } = createIdsFor(null);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // An import is born in OpenDocument (fork C5).
    const type = importTypeOfFileName(file.name);
    await apiCreateDocument(ownerId, {
      id: documentId,
      name,
      tabs: [newTextDocumentTab(tabId, name, type ? 'odf' : formatOfFileName(file.name))],
      textDocuments: [{ tabId, file: base64OfBytes(bytes), ...(type ? { type } : {}) }],
    });
    track('Tab', 'Imported', importedTypeOf(file.name));
    // The room keeps the import report in the document; the new document shows it once to this person
    // (files-and-print.md "Import report").
    keepImportReport(documentId, { name, lines: [] });
    return { ok: true, documentId };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : null;
    debugLog('[text-document] open refused', { code });
    return { ok: false, message: (code && REJECTION_COPY[code]) || GENERIC };
  }
}
