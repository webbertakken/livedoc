// A Blank PDF (docs/specs/035-pdf-documents/starting-and-finding.md "Starting one"), written by the repository's one
// PDF writer (files-print-and-sync.md "One writer"): one empty page, so New Document's PDF document is a real file,
// stored and opened as any PDF is. Loaded where one is made, never before.
import { PDF } from '@libpdf/core';

/** (D228) A4 in PDF points (1/72 inch), portrait: 210 × 297 mm. */
export const A4_POINTS = { width: 595.28, height: 841.89 } as const;

const PRODUCER = 'LiveDoc';

/** One empty page of `size` (A4 unless said), made `at` (now unless said); LiveDoc as what made it, no author. */
export async function writeBlankPdf(
  size: { readonly width: number; readonly height: number } = A4_POINTS,
  at: Date = new Date(),
): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = PDF.create();
  // Every property is set: the writer fills any it is not told with a placeholder of its own.
  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setProducer(PRODUCER);
  pdf.setCreator(PRODUCER);
  pdf.setCreationDate(at);
  pdf.setModificationDate(at);
  pdf.addPage({ width: size.width, height: size.height });
  return (await pdf.save()) as Uint8Array<ArrayBuffer>;
}
