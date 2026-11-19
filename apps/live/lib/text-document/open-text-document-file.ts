// File > Open > Upload (docs/specs/034-text-documents/files-and-print.md "Opening"): a file from the computer becomes
// a new text document in its format, named after the file. The api reads it under the package's guards and answers a
// named rejection, which this words for the person.
import { base64OfBytes } from '@livedoc/text-documents';
import { ApiError, apiCreateDocument } from '@/lib/api-client';
import { createIdsFor } from '@/lib/new-document/create-failure';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
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

/** The document's name from the file's: its name without the extension. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || UNTITLED_TEXT_DOCUMENT;
}

export async function openTextDocumentFile(
  ownerId: string,
  file: File,
): Promise<OpenedTextDocument> {
  const { documentId, tabId } = createIdsFor(null);
  const name = nameFromFile(file.name);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await apiCreateDocument(ownerId, {
      id: documentId,
      name,
      tabs: [newTextDocumentTab(tabId, name, formatOfFileName(file.name))],
      textDocuments: [{ tabId, file: base64OfBytes(bytes) }],
    });
    track('Tab', 'Imported', formatOfFileName(file.name) === 'ooxml' ? 'Docx' : 'Odt');
    return { ok: true, documentId };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : null;
    debugLog('[text-document] open refused', { code });
    return { ok: false, message: (code && REJECTION_COPY[code]) || GENERIC };
  }
}
