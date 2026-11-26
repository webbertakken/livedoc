// What the room knows of a PDF tab without reading its state again
// (docs/specs/035-pdf-documents/live-editing-and-storage.md "The digest"). Pure; built from a loaded state when the
// outbox drains the tab. The file's own text reaches search from the api Worker, never from the room.
import type * as Y from 'yjs';
import type { BlobKey } from '@livedoc/document';
import { PdfLiveChanges } from './live-changes';
import { Mark } from './mark';

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
  /** The pictures its marks name (a custom stamp's), each once, in order: what the tab holds of the blob store
   *  besides its stored file (blob-store.md "Holds and retention"). */
  readonly blobKeys: readonly BlobKey[];
};

export function pdfDigest(doc: Y.Doc): PdfDigest {
  const marks = PdfLiveChanges.marks(doc);
  return {
    characters: 0,
    words: 0,
    pages: PdfLiveChanges.stored(doc)?.pages ?? 0,
    hasContent: true,
    searchText: marks
      .map((mark) => (Mark.isText(mark) ? mark.text : ''))
      .filter((text) => text !== '')
      .join('\n'),
    marks: marks.length,
    blobKeys: [
      ...new Set(
        marks.flatMap((mark) => (mark.kind === 'stamp' && mark.picture ? [mark.picture.key] : [])),
      ),
    ].sort(),
  };
}
