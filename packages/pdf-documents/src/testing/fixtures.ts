// Test fixtures: small PDFs made here, so no file of anyone else's is committed, and the reader's binary as tests
// load it (a browser's worker fetches the same file as an asset).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PDF } from '@libpdf/core';

const require = createRequire(import.meta.url);

/** The reader's WebAssembly binary. */
export const readerWasm = (): Uint8Array =>
  readFileSync(require.resolve('@embedpdf/pdfium/pdfium.wasm'));

export const FIXTURE_LINE = 'The quick brown fox jumps over the lazy dog.';

/** A PDF of US Letter pages, each with one line of text 72 points in and 720 up, and its page number below it. */
export async function textPdf(pages = 2): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = PDF.create();
  for (let n = 1; n <= pages; n += 1) {
    const page = pdf.addPage({ width: 612, height: 792 });
    page.drawText(FIXTURE_LINE, { x: 72, y: 720, size: 12 });
    page.drawText(`Page ${n}`, { x: 72, y: 690, size: 12 });
  }
  return (await pdf.save()) as Uint8Array<ArrayBuffer>;
}

/**
 * A PDF written by hand from its objects (object 1 is the catalogue), for the files no writer makes: one with no
 * pages, one locked by a handler the reader does not know.
 */
export function rawPdf(objects: readonly string[], trailer = ''): Uint8Array<ArrayBuffer> {
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, at) => {
    offsets.push(body.length);
    body += `${at + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

/** A well-formed PDF whose page tree holds no page. */
export const noPagesPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>']);

/** A PDF locked by the security handler named: one the reader does not open. */
export const lockedPdf = (handler: string): Uint8Array<ArrayBuffer> =>
  rawPdf(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
      `<< /Filter /${handler} /V 1 /R 2 /Length 40 >>`,
    ],
    '/Encrypt 4 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]',
  );

/** The same PDF with its cross-reference pointer spoiled: readers rebuild it, and no writer can append to it. */
export function spoiled(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const text = Buffer.from(bytes)
    .toString('latin1')
    .replace(/startxref/g, 'startxxxx');
  return new Uint8Array(Buffer.from(text, 'latin1'));
}
