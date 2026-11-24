// Baking (docs/specs/035-pdf-documents/saving.md "Addition or rewrite"): the stored file with the live changes
// written in, in at most two stages. Where a change rewrites (a page turned), or the file cannot take an addition,
// the stored file is rewritten first; what Reviewing added is then appended as one incremental update. With
// writer.ts, the only files that drive the writer. Deterministic: every date, id and order comes from the changes,
// never the clock.
import {
  PdfArray,
  PdfDict,
  PdfRef,
  PdfString,
  type PDF,
  type PdfObject,
  type PDFPage,
} from '@libpdf/core';
import type { FieldValue } from '../field-value';
import type { Mark } from '../mark';
import { PageName } from '../page-name';
import type { RemovedKind } from '../pdf-change';
import { annotate, type MarkFaceWriting } from './annotate';
import { embeddedFaces } from './embedded-faces';
import type { Typesetter } from './typesetter';
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
      /** Characters no mark face has, set as the missing box (marks.md "Words in every script"). */
      readonly glyphsMissing: number;
    }
  | { readonly ok: false; readonly refusal: 'cannot-append' | 'unreadable' };

const two = (n: number): string => String(n).padStart(2, '0');

/** A time as the file writes a date: `D:YYYYMMDDHHmmSSZ`, always in UTC. */
export function pdfDate(ms: number): string {
  const d = new Date(ms);
  return `D:${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`;
}

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

/** A page's list of marks and fields where the page names it as an object of its own; null where it holds it. */
function listApart(pdf: PDF, page: PDFPage): PdfArray | null {
  const named = page.dict.get('Annots');
  const list = named instanceof PdfRef ? pdf.getObject(named) : null;
  return list instanceof PdfArray ? list : null;
}

/**
 * Holds a page's list of marks and fields in the page itself, before anything is added to it or removed from it.
 * Most software writes the list as an object of its own, and the writer then sees no list at all: it would write a
 * new one holding only what was added, so every mark and field the page had would be gone from it, and it would
 * find nothing to remove (saving.md "What is kept untouched").
 */
function holdList(pdf: PDF, page: PDFPage): void {
  const list = listApart(pdf, page);
  if (list) page.dict.set('Annots', PdfArray.of(...list));
}

/** A mark as the reader names it: its own name, else its object. */
function nameOf(pdf: PDF, entry: PdfObject): string | null {
  const mark = entry instanceof PdfRef ? pdf.getObject(entry) : entry;
  if (!(mark instanceof PdfDict)) return null;
  const own = mark.getString('NM')?.asString();
  if (own) return own;
  return entry instanceof PdfRef ? `o:${entry.objectNumber}` : null;
}

/** Appends each mark to its page as one annotation (marks.md "In the file"); answers how many have no page. */
function addMarks(
  pdf: PDF,
  pages: Pages,
  marks: readonly Mark[],
  writing: MarkFaceWriting | null,
): number {
  let lost = 0;
  for (const mark of marks) {
    const page = pages.get(mark.page);
    if (!page) {
      lost += 1;
      continue;
    }
    holdList(pdf, page);
    const annotation = annotate(pdf, page, mark, writing);
    annotation.set('NM', PdfString.fromString(mark.id));
    annotation.set('M', PdfString.fromString(pdfDate(mark.modifiedAt)));
    annotation.set('CreationDate', PdfString.fromString(pdfDate(mark.createdAt)));
  }
  return lost;
}

/** Removes the stored file's own marks that were deleted, each named as the reader names it. */
function removeMarks(pdf: PDF, pages: Pages, removed: BakeChanges['removed']): void {
  if (![...removed.values()].includes('mark')) return;
  for (const page of pages.values()) {
    const deleted = (entry: PdfObject): boolean => removed.get(nameOf(pdf, entry) ?? '') === 'mark';
    // A page none of whose marks was deleted is left as it is, its list where the file wrote it.
    if ([...(listApart(pdf, page) ?? [])].some(deleted)) holdList(pdf, page);
    for (const annotation of page.getAnnotations())
      if (deleted(annotation.ref ?? annotation.dict)) page.removeAnnotation(annotation);
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
  // The mark faces loaded for the marks whose words need them; none where Helvetica writes every mark.
  typesetter: Typesetter | null = null,
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
  const faces = typesetter ? embeddedFaces(pdf, typesetter) : null;
  const writing: MarkFaceWriting | null =
    typesetter && faces
      ? {
          faces,
          setter: {
            shape: typesetter.shape,
            advance: (face, glyph) => typesetter.face(face).advances[glyph] ?? 0,
            levels: typesetter.levels,
            split: typesetter.split,
          },
        }
      : null;
  anchorsLost += addMarks(pdf, pages, changes.marks, writing);
  const glyphsMissing = faces?.finish().missing ?? 0;
  removeMarks(pdf, pages, changes.removed);
  const fieldsLost = changes.fieldValues.filter((value) => !fillField(pdf, value)).length;
  const bytes = (await pdf.save({ incremental: true })) as Uint8Array<ArrayBuffer>;
  if (!startsWith(bytes, base)) return { ok: false, refusal: 'cannot-append' };
  return {
    ok: true,
    bytes,
    kind: rewrites ? 'rewrite' : 'addition',
    anchorsLost,
    fieldsLost,
    glyphsMissing,
  };
}
