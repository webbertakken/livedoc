// The exports a text document downloads as (docs/specs/034-text-documents/files-and-print.md "Downloading"), written
// from the document as it reads with every pending suggestion accepted, as print has it. One writer a type, shared by
// the api, this browser and the agents.
import * as Y from 'yjs';
import type { TextDocumentExportType } from '../file-types';
import { LiveSuggestions } from '../live/live-suggestions';
import { readLiveDocument } from '../live/live-read';
import type { TextDocument, TextDocumentFormat } from '../model/text-document';
import { writeMarkdown } from './markdown';
import { writePlainText } from './plain-text';

export const EXPORT_MEDIA_TYPES: Record<TextDocumentExportType, string> = {
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
};

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
): Uint8Array {
  const text = type === 'txt' ? writePlainText(document) : writeMarkdown(document);
  return new TextEncoder().encode(text);
}
