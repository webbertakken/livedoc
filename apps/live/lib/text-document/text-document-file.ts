// A text document's file written in this browser (docs/specs/034-text-documents/live-editing-and-storage.md "A text
// document in This Browser"): what the file route writes from the room's state, written here from the live one, for
// a text document no room holds. Named after the document, in the format it is held in.
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import type { TextDocumentFileType } from '@livedoc/text-documents';
import { downloadFileName } from '@livedoc/office-packages';
import { TextDocumentState, writeTextDocumentFile } from '@livedoc/text-documents';

const MEDIA_TYPES = {
  odt: 'application/vnd.oasis.opendocument.text',
  fodt: 'application/vnd.oasis.opendocument.text-flat-xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export function textDocumentFileOf(
  doc: Y.Doc,
  format: TextDocumentFormat,
  name: string,
  // The file asked for: the format's own (an OpenDocument one may be flat); another format's is a conversion.
  type: TextDocumentFileType = format === 'ooxml' ? 'docx' : 'odt',
): { blob: Blob; fileName: string } {
  if ((type === 'docx') !== (format === 'ooxml'))
    throw new Error('text document file refused: format_not_native');
  const live = TextDocumentState.document(doc, format);
  // Its title is the document's name, as the room writes it.
  const written = writeTextDocumentFile(
    { ...live, metadata: { ...live.metadata, title: name } },
    type,
  );
  if (!written.ok) throw new Error(`text document file refused: ${written.rejection}`);
  return {
    blob: new Blob([written.bytes.slice().buffer], { type: MEDIA_TYPES[type] }),
    fileName: downloadFileName(name, type, 'Untitled'),
  };
}
