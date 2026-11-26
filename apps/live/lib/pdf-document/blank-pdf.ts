// A Blank PDF as a file to store (docs/specs/035-pdf-documents/starting-and-finding.md "Starting one"): one empty A4
// page, written by the repository's one PDF writer (files-print-and-sync.md "One writer"), loaded only when one is made.
import { UNTITLED_PDF } from './open-pdf-file';

/** "Untitled PDF.pdf", so the document it makes is named "Untitled PDF". */
export async function blankPdfFile(): Promise<File> {
  const { writeBlankPdf } = await import('@livedoc/pdf-documents/blank');
  return new File([await writeBlankPdf()], `${UNTITLED_PDF}.pdf`, { type: 'application/pdf' });
}
