// What the offline modules' tests of a PDF document share: a PDF tab, and live changes with a highlight in them.
import type { BlobKey, Tab } from '@livedoc/document';
import { Mark, PdfLiveChanges, type Quad } from '@livedoc/pdf-documents';

export const PDF_BLOB = 'a'.repeat(64) as BlobKey;
export const OTHER_PDF_BLOB = 'b'.repeat(64) as BlobKey;

const QUAD: Quad = [72, 716, 300, 716, 72, 700, 300, 700];

export const pdfTab = (id: string, blob: BlobKey = PDF_BLOB, size = 1234): Tab => ({
  id,
  name: id,
  kind: 'pdf',
  elements: [],
  blob,
  size,
});

export const testHighlight = (id: string) =>
  Mark.highlight({
    id,
    page: 'p:1',
    quads: [QUAD],
    text: 'words',
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: 1_795_000_000_000,
  })!;

/** Live changes holding one highlight a given id, on the stored file named (none named when null). */
export function pdfStateWith(ids: readonly string[], on: BlobKey | null = PDF_BLOB): Uint8Array {
  const doc = PdfLiveChanges.load();
  if (on) PdfLiveChanges.setStored(doc, { blob: on, pages: 2 });
  for (const id of ids) PdfLiveChanges.addMark(doc, testHighlight(id));
  return PdfLiveChanges.encode(doc);
}

export const markIdsIn = (state: Uint8Array): string[] =>
  PdfLiveChanges.marks(PdfLiveChanges.load([state])).map((mark) => mark.id);
