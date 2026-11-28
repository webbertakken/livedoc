// The exports a text document downloads as (docs/specs/034-text-documents/files-and-print.md "Downloading"), written
// from the document as it reads with every pending suggestion accepted, as print has it. One writer a type, shared by
// the api, this browser and the agents. The Web Page and the EPUB carry pictures: their callers read gallery media
// and draw drawings first, as for the native files.
import * as Y from 'yjs';
import type { TextDocumentExportType } from '../file-types';
import { LiveSuggestions } from '../live/live-suggestions';
import { readLiveDocument } from '../live/live-read';
import type { TextDocument, TextDocumentFormat } from '../model/text-document';
import { EPUB_MEDIA_TYPE, writeEpub } from './epub';
import { writeMarkdown } from './markdown';
import { writePlainText } from './plain-text';
import { writeRtf } from './rtf';
import { writeWebPage } from './web-page';

export const EXPORT_MEDIA_TYPES: Record<TextDocumentExportType, string> = {
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  html: 'application/zip',
  epub: EPUB_MEDIA_TYPE,
  rtf: 'application/rtf',
};

/** When a zipped export is dated, and the identifier an EPUB names itself by; each defaults to a fresh one. */
export type ExportOptions = { readonly when?: Date; readonly identifier?: string };

/** The document a live state holds, every pending suggestion accepted; the state untouched. */
export function settledDocument(doc: Y.Doc, format: TextDocumentFormat): TextDocument {
  const settled = LiveSuggestions.settledCopy(doc, true);
  try {
    return readLiveDocument(settled, format);
  } finally {
    settled.destroy();
  }
}

/** The document written as `type`, as bytes. */
export function writeTextDocumentExport(
  document: TextDocument,
  type: TextDocumentExportType,
  options: ExportOptions = {},
): Uint8Array {
  const when = options.when ?? new Date();
  switch (type) {
    case 'txt':
      return new TextEncoder().encode(writePlainText(document));
    case 'md':
      return new TextEncoder().encode(writeMarkdown(document));
    case 'html':
      return writeWebPage(document, when);
    case 'epub':
      return writeEpub(document, {
        when,
        identifier: options.identifier ?? `urn:uuid:${crypto.randomUUID()}`,
      });
    case 'rtf':
      return new TextEncoder().encode(writeRtf(document));
  }
}
