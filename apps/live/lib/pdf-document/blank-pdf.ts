// A Blank PDF (docs/specs/035-pdf-documents/starting-and-finding.md "Starting one"): a real PDF file of one empty page,
// written here so it is stored and opened as any PDF is. PDF 1.7 (ISO 32000-1): a catalog, a page tree, one page with
// no content and an empty resource dictionary, and a cross-reference table whose offsets are counted as it is written.
import { UNTITLED_PDF } from './open-pdf-file';

/** (D224) A4 in PDF points (1/72 inch), portrait: 210 × 297 mm. */
export const A4_POINTS = { width: 595.28, height: 841.89 } as const;

export function blankPdfBytes(
  size: { width: number; height: number } = A4_POINTS,
): Uint8Array<ArrayBuffer> {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << >> /Contents 4 0 R >>`,
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character written is ASCII, so its length is its byte count.
  return new TextEncoder().encode(pdf);
}

/** A Blank PDF as a file to store: "Untitled PDF.pdf", so the document it makes is named "Untitled PDF". */
export function blankPdfFile(): File {
  return new File([blankPdfBytes()], `${UNTITLED_PDF}.pdf`, { type: 'application/pdf' });
}
