// The marks a file holds on a page, as the file says them (docs/specs/035-pdf-documents/marks.md "In the file",
// comments.md "In the file"): each bounded on the way out.
import { type FileMark } from '../engine-contract';
import { type Quad } from '../mark';
import {
  PDF_MARK_MAX_QUADS,
  PDF_MARK_TEXT_MAX_CHARS,
  PDF_MAX_COORDINATE,
  PDF_NAME_MAX_CHARS,
  PDF_PAGE_MAX_MARKS,
} from '../limits';
import { PageName } from '../page-name';
import { readAsMark } from './read-as-mark';
import type { ReaderFile } from './reader-file';

// The file's own words for what sits on a page, by the reader's number; a link, a pop-up and a field's widget are
// not marks.
const SUBTYPES: Readonly<Record<number, string>> = {
  1: 'text',
  3: 'freetext',
  4: 'line',
  5: 'square',
  6: 'circle',
  7: 'polygon',
  8: 'polyline',
  9: 'highlight',
  10: 'underline',
  11: 'squiggly',
  12: 'strikeout',
  13: 'stamp',
  14: 'caret',
  15: 'ink',
  17: 'fileattachment',
};
// EPDFAnnot_GetReplyType's answer for a mark grouped with the one it names, rather than a reply to it.
const REPLY_GROUPED = 2;
// FPDFANNOT_COLORTYPE_Color: a mark's own colour.
const COLOUR_OF_MARK = 0;
const channel = (n: number): string =>
  Math.min(Math.max(Math.round(n), 0), 255)
    .toString(16)
    .padStart(2, '0');

/** The marks the file holds on a page, at most `most`, each as the file says it. */
export function readMarks(
  file: ReaderFile,
  index: number,
  most = PDF_PAGE_MAX_MARKS,
): readonly FileMark[] {
  const { p } = file;
  return (
    file.withPage(index, (page) => {
      const marks: FileMark[] = [];
      const name = PageName.ofObject(p.EPDFDoc_GetPageObjectNumberByIndex(file.doc, index));
      const count = p.FPDFPage_GetAnnotCount(page);
      let n = 0;
      for (; n < count && marks.length < most; n += 1) {
        const annotation = p.FPDFPage_GetAnnot(page, n);
        if (!annotation) continue;
        const subtype = SUBTYPES[p.FPDFAnnot_GetSubtype(annotation)];
        if (subtype) {
          const read = markOf(file, annotation, subtype);
          marks.push({ ...read, mark: readAsMark(file, page, annotation, read, name) });
        }
        p.FPDFPage_CloseAnnot(annotation);
      }
      if (n < count) file.clamped('list');
      return marks;
    }) ?? []
  );
}

function markOf(file: ReaderFile, annotation: number, subtype: string): Omit<FileMark, 'mark'> {
  const { p } = file;
  const said = (key: string, most = PDF_NAME_MAX_CHARS): string =>
    file.written(most, (buffer, size) => p.FPDFAnnot_GetStringValue(annotation, key, buffer, size));
  const answered = p.FPDFAnnot_GetLinkedAnnot(annotation, 'IRT');
  const answers = answered
    ? {
        mark: idOf(file, answered),
        grouped: p.EPDFAnnot_GetReplyType(annotation) === REPLY_GROUPED,
      }
    : null;
  if (answered) p.FPDFPage_CloseAnnot(answered);
  const state = said('State');
  return {
    id: idOf(file, annotation),
    subtype,
    rect: rectOf(file, annotation),
    quads: quadsOf(file, annotation),
    colour: colourOf(file, annotation),
    opacity: opacityOf(file, annotation),
    author: said('T'),
    words: said('Contents', PDF_MARK_TEXT_MAX_CHARS),
    subject: said('Subj'),
    created: said('CreationDate'),
    modified: said('M'),
    answers,
    state: state === '' ? null : { model: said('StateModel'), state },
  };
}

/** What sits on a page by its own name, or by its object where the file gives it none. */
export function idOf(file: ReaderFile, annotation: number): string {
  const { p } = file;
  const name = file.written(PDF_NAME_MAX_CHARS, (buffer, size) =>
    p.FPDFAnnot_GetStringValue(annotation, 'NM', buffer, size),
  );
  return name === '' ? `o:${p.EPDFAnnot_GetObjectNumber(annotation)}` : name;
}

/** The box of what sits on a page: left, bottom, right, top, each held within reach of the page. */
export function rectOf(
  file: ReaderFile,
  annotation: number,
): readonly [number, number, number, number] {
  // The reader writes left, top, right, bottom.
  const out = file.alloc(16);
  file.heap.fill(0, out, out + 16);
  file.p.FPDFAnnot_GetRect(annotation, out);
  const side = (at: number): number => file.held(file.runtime.getValue(out + at * 4, 'float'));
  const rect = [side(0), side(3), side(2), side(1)] as const;
  file.free(out);
  return rect;
}

function colourOf(file: ReaderFile, annotation: number): string | null {
  const { p } = file;
  if (!p.FPDFAnnot_HasKey(annotation, 'C')) return null;
  const out = file.alloc(12);
  const named = p.EPDFAnnot_GetColor(annotation, COLOUR_OF_MARK, out, out + 4, out + 8);
  const colour = named
    ? `#${[0, 4, 8].map((at) => channel(file.runtime.getValue(out + at, 'i32'))).join('')}`
    : null;
  file.free(out);
  return colour;
}

function opacityOf(file: ReaderFile, annotation: number): number {
  const out = file.alloc(4);
  const named = file.p.FPDFAnnot_GetNumberValue(annotation, 'CA', out);
  const read = file.runtime.getValue(out, 'float');
  file.free(out);
  // The reader answers a single-precision number: a thousandth is as fine as an opacity is told apart.
  return named && Number.isFinite(read)
    ? Math.round(Math.min(Math.max(read, 0), 1) * 1000) / 1000
    : 1;
}

function quadsOf(file: ReaderFile, annotation: number): Quad[] {
  const { p } = file;
  const held = p.FPDFAnnot_CountAttachmentPoints(annotation);
  const count = Math.min(held, PDF_MARK_MAX_QUADS);
  if (held > count) file.clamped('list');
  const out = file.alloc(32);
  const quads: Quad[] = [];
  for (let n = 0; n < count; n += 1) {
    if (!p.FPDFAnnot_GetAttachmentPoints(annotation, n, out)) continue;
    const quad = [0, 4, 8, 12, 16, 20, 24, 28].map((at) =>
      file.runtime.getValue(out + at, 'float'),
    );
    // A quadrilateral out of reach is dropped whole: moved to the edge it would cover text it never covered.
    if (quad.every((n) => Number.isFinite(n) && Math.abs(n) <= PDF_MAX_COORDINATE))
      quads.push(quad as unknown as Quad);
    else file.clamped('coordinate');
  }
  file.free(out);
  return quads;
}
