// Baking (docs/specs/035-pdf-documents/saving.md "Addition or rewrite"): the stored file with what Reviewing added
// appended as one incremental update. The only file that drives the writer; what it writes for a mark is the
// mapping of marks.md "In the file". Deterministic: every date, id and order comes from the marks, never the clock.
import { PDF, PdfString, rgb } from '@libpdf/core';
import type { Mark } from '../mark';
import { PageName } from '../page-name';

export type Addition =
  | { readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer>; readonly anchorsLost: number }
  | { readonly ok: false; readonly refusal: 'cannot-append' | 'unreadable' };

const two = (n: number): string => String(n).padStart(2, '0');

/** A time as the file writes a date: `D:YYYYMMDDHHmmSSZ`, always in UTC. */
export function pdfDate(ms: number): string {
  const d = new Date(ms);
  return `D:${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`;
}

const channel = (colour: string, at: number): number =>
  parseInt(colour.slice(at, at + 2), 16) / 255;

const startsWith = (bytes: Uint8Array, prefix: Uint8Array): boolean =>
  bytes.length >= prefix.length && prefix.every((byte, at) => bytes[at] === byte);

/**
 * The stored file with each mark appended as one annotation. The stored bytes are never touched: the writer works
 * on a copy, is asked first whether it can append, and its answer is checked to hold the stored file as a prefix.
 */
export async function bakeAddition(stored: Uint8Array, marks: readonly Mark[]): Promise<Addition> {
  let pdf: PDF;
  try {
    pdf = await PDF.load(stored.slice());
  } catch {
    return { ok: false, refusal: 'unreadable' };
  }
  // A silent fall back to a rewrite is a defect: the writer says whether it can append before anything is written.
  if (pdf.canSaveIncrementally() !== null) return { ok: false, refusal: 'cannot-append' };
  const pages = new Map(pdf.getPages().map((page) => [page.ref.objectNumber, page]));
  let anchorsLost = 0;
  for (const mark of marks) {
    const objectNumber = PageName.objectNumber(mark.page);
    const page = objectNumber === null ? undefined : pages.get(objectNumber);
    if (!page) {
      anchorsLost += 1;
      continue;
    }
    const annotation = page.addHighlightAnnotation({
      quadPoints: mark.quads.map((quad) => [...quad]),
      color: rgb(channel(mark.colour, 1), channel(mark.colour, 3), channel(mark.colour, 5)),
      opacity: mark.opacity,
      title: mark.author,
    });
    annotation.setName(mark.id);
    annotation.setModificationDate(pdfDate(mark.modifiedAt));
    annotation.dict.set('CreationDate', PdfString.fromString(pdfDate(mark.createdAt)));
  }
  const bytes = (await pdf.save({ incremental: true })) as Uint8Array<ArrayBuffer>;
  if (!startsWith(bytes, stored)) return { ok: false, refusal: 'cannot-append' };
  return { ok: true, bytes, anchorsLost };
}
