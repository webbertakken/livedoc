// Baking (docs/specs/035-pdf-documents/saving.md "Addition or rewrite"): the stored file with the live changes
// written in, in at most two stages. Where a change rewrites (a page turned), or the file cannot take an addition,
// the stored file is rewritten first; what Reviewing added is then appended as one incremental update. With
// writer.ts, the only files that drive the writer. Deterministic: every date, id and order comes from the changes,
// never the clock.
import { PdfString, rgb, type PDF, type PDFPage } from '@libpdf/core';
import type { FieldValue } from '../field-value';
import type { Mark } from '../mark';
import { PageName } from '../page-name';
import type { RemovedKind } from '../pdf-change';
import { openWriter } from './writer';

/** What a bake writes: the live changes as plain values. */
export type BakeChanges = {
  readonly marks: readonly Mark[];
  readonly fieldValues: readonly FieldValue[];
  readonly removed: ReadonlyMap<string, RemovedKind>;
  readonly turns: ReadonlyMap<PageName, 0 | 90 | 180 | 270>;
};

export type Written =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly kind: 'addition' | 'rewrite';
      readonly anchorsLost: number;
      readonly fieldsLost: number;
    }
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

type Pages = ReadonlyMap<PageName, PDFPage>;

/** The writer's pages under the names the live changes use: the stored file's own, in the stored file's order. */
const pagesOf = (pdf: PDF, order: readonly PageName[]): Pages =>
  new Map(pdf.getPages().map((page, at) => [order[at]!, page]));

/** Turns each page named; answers how many the file does not hold. */
function turn(pages: Pages, turns: BakeChanges['turns']): number {
  let lost = 0;
  for (const [name, rotation] of turns) {
    const page = pages.get(name);
    if (page) page.setRotation(rotation);
    else lost += 1;
  }
  return lost;
}

/** Appends each mark to its page as one annotation (marks.md "In the file"); answers how many have no page. */
function addMarks(pages: Pages, marks: readonly Mark[]): number {
  let lost = 0;
  for (const mark of marks) {
    const page = pages.get(mark.page);
    if (!page) {
      lost += 1;
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
  return lost;
}

/** Removes the stored file's own marks that were deleted, each named as the reader names it. */
function removeMarks(pages: Pages, removed: BakeChanges['removed']): void {
  if (![...removed.values()].includes('mark')) return;
  for (const page of pages.values())
    for (const annotation of page.getAnnotations()) {
      const id = annotation.name ?? `o:${annotation.ref?.objectNumber}`;
      if (removed.get(id) === 'mark') page.removeAnnotation(annotation);
    }
}

/**
 * Writes one value into its field with its appearance (fields.md "In the file"); false where the file's field does
 * not take it: there is no such field, it is read-only, a button or a signature field, or the value is none of its
 * options.
 */
function fillField(pdf: PDF, { field, value }: FieldValue): boolean {
  const form = pdf.getForm();
  if (!form || form.getField(field)?.isReadOnly() !== false) return false;
  try {
    if (typeof value !== 'string') {
      const list = form.getListBox(field);
      list?.setValue([...value]);
      return list !== undefined;
    }
    const tick = form.getCheckbox(field);
    if (tick) {
      if (value === 'Off') tick.uncheck();
      else tick.check();
      return true;
    }
    const taking = form.getTextField(field) ?? form.getRadioGroup(field) ?? form.getDropdown(field);
    taking?.setValue(value);
    return taking !== undefined;
  } catch {
    // The writer refuses a value that is none of the field's options.
    return false;
  }
}

/**
 * The stored file with the changes written in. The stored bytes are never touched: the writer works on a copy, is
 * asked first whether it can append, and an addition is checked to hold what it was appended to as a prefix.
 */
export async function bakeChanges(
  stored: Uint8Array<ArrayBuffer>,
  changes: BakeChanges,
  // The password the file was opened with: a protected file is written only where its password is.
  password: string | null = null,
): Promise<Written> {
  const first = await openWriter(stored, password);
  if (!first) return { ok: false, refusal: 'unreadable' };
  const order = first.getPages().map((page) => PageName.ofObject(page.ref.objectNumber));
  // A silent fall back to a rewrite is a defect: the writer says whether it can append before anything is written.
  const rewrites = changes.turns.size > 0 || first.canSaveIncrementally() !== null;
  let base = stored;
  let pdf = first;
  let anchorsLost = 0;
  if (rewrites) {
    anchorsLost += turn(pagesOf(first, order), changes.turns);
    // The writer hands back the bytes it read where it sees nothing changed: the catalogue is marked changed, its
    // content as it was, so a file that cannot take an addition is written anew whatever the changes are.
    first.getCatalog().dirty = true;
    base = (await first.save()) as Uint8Array<ArrayBuffer>;
    const rewritten = await openWriter(base, password);
    if (!rewritten || rewritten.canSaveIncrementally() !== null)
      return { ok: false, refusal: 'cannot-append' };
    pdf = rewritten;
  }
  const pages = pagesOf(pdf, order);
  anchorsLost += addMarks(pages, changes.marks);
  removeMarks(pages, changes.removed);
  const fieldsLost = changes.fieldValues.filter((value) => !fillField(pdf, value)).length;
  const bytes = (await pdf.save({ incremental: true })) as Uint8Array<ArrayBuffer>;
  if (!startsWith(bytes, base)) return { ok: false, refusal: 'cannot-append' };
  return { ok: true, bytes, kind: rewrites ? 'rewrite' : 'addition', anchorsLost, fieldsLost };
}
