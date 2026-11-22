// What the room knows of a PDF tab without reading its state again
// (docs/specs/035-pdf-documents/live-editing-and-storage.md "The digest"). Pure; built from a loaded state when the
// outbox drains the tab. The file's own text reaches search from the api Worker, never from the room.
import type * as Y from 'yjs';
import { PdfLiveChanges } from './live-changes';

export type PdfDigest = {
  readonly characters: number;
  readonly words: number;
  /** The stored file's pages, as the state names them; 0 until a change names the stored file. */
  readonly pages: number;
  /** Always true: a PDF document has a stored file, so it is never empty. */
  readonly hasContent: boolean;
  /** The words under the marks, one line a mark. */
  readonly searchText: string;
  readonly marks: number;
};

export function pdfDigest(doc: Y.Doc): PdfDigest {
  const marks = PdfLiveChanges.marks(doc);
  return {
    characters: 0,
    words: 0,
    pages: PdfLiveChanges.stored(doc)?.pages ?? 0,
    hasContent: true,
    searchText: marks
      .map((mark) => mark.text)
      .filter((text) => text !== '')
      .join('\n'),
    marks: marks.length,
  };
}
