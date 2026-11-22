// A page's text (docs/specs/035-pdf-documents/opening.md "What is read": Text; marks.md "Kinds": a text mark follows
// its text): characters with their boxes in the file's own order, and the text between two points.
import { type PagePoint, type TextSelection } from '../engine-contract';
import { type Quad } from '../mark';
import { PageText } from '../page-text';
import { PDF_MARK_MAX_QUADS, PDF_MARK_TEXT_MAX_CHARS, PDF_PAGE_TEXT_MAX_CHARS } from '../limits';
import type { ReaderFile } from './reader-file';

// How far from a glyph a point still picks it, in points: half a line of body text.
const PICK_TOLERANCE = 6;

/** The page's text, at most `most` characters of it, each with its box. */
export function readPageText(
  file: ReaderFile,
  index: number,
  most = PDF_PAGE_TEXT_MAX_CHARS,
): PageText | null {
  const { p } = file;
  return file.withPage(index, (page) => {
    const text = p.FPDFText_LoadPage(page);
    if (!text) return PageText.of([], []);
    // Four doubles: left, right, bottom, top, as the reader writes a character's box.
    const out = file.alloc(32);
    try {
      const held = Math.max(p.FPDFText_CountChars(text), 0);
      const count = Math.min(held, most);
      const codes = new Uint32Array(count);
      const boxes = new Float32Array(count * 4);
      const unmapped: number[] = [];
      for (let at = 0; at < count; at += 1) {
        codes[at] = p.FPDFText_GetUnicode(text, at);
        if (p.FPDFText_HasUnicodeMapError(text, at) === 1) unmapped.push(at);
        if (!p.FPDFText_GetCharBox(text, at, out, out + 8, out + 16, out + 24)) continue;
        boxes[at * 4] = file.held(file.runtime.getValue(out, 'double'));
        boxes[at * 4 + 1] = file.held(file.runtime.getValue(out + 16, 'double'));
        boxes[at * 4 + 2] = file.held(file.runtime.getValue(out + 8, 'double'));
        boxes[at * 4 + 3] = file.held(file.runtime.getValue(out + 24, 'double'));
      }
      if (held > count) file.clamped('list');
      return PageText.of(codes, boxes, { unmapped, cut: held > count });
    } finally {
      file.free(out);
      p.FPDFText_ClosePage(text);
    }
  });
}

export function selectText(
  file: ReaderFile,
  index: number,
  from: PagePoint,
  to: PagePoint,
): TextSelection | null {
  const { p } = file;
  return file.withPage(index, (page) => {
    const text = p.FPDFText_LoadPage(page);
    if (!text) return null;
    try {
      const pick = ({ x, y }: PagePoint) =>
        Number.isFinite(x) && Number.isFinite(y)
          ? p.FPDFText_GetCharIndexAtPos(text, x, y, PICK_TOLERANCE, PICK_TOLERANCE)
          : -1;
      const a = pick(from);
      const b = pick(to);
      if (a < 0 || b < 0) return null;
      const start = Math.min(a, b);
      const count = Math.min(Math.abs(a - b) + 1, PDF_MARK_TEXT_MAX_CHARS);
      const quads = rectsOf(file, text, start, count);
      return quads.length === 0 ? null : { text: textOf(file, text, start, count), quads };
    } finally {
      p.FPDFText_ClosePage(text);
    }
  });
}

function rectsOf(file: ReaderFile, text: number, start: number, count: number): Quad[] {
  const { p } = file;
  const rects = Math.min(p.FPDFText_CountRects(text, start, count), PDF_MARK_MAX_QUADS);
  const out = file.alloc(32);
  const quads: Quad[] = [];
  for (let n = 0; n < rects; n += 1) {
    if (!p.FPDFText_GetRect(text, n, out, out + 8, out + 16, out + 24)) continue;
    const [left, top, right, bottom] = [0, 8, 16, 24].map((at) =>
      file.held(file.runtime.getValue(out + at, 'double')),
    ) as [number, number, number, number];
    quads.push([left, top, right, top, left, bottom, right, bottom]);
  }
  file.free(out);
  return quads;
}

function textOf(file: ReaderFile, text: number, start: number, count: number): string {
  const { p } = file;
  const size = (count + 1) * 2;
  const buffer = file.alloc(size);
  p.FPDFText_GetText(text, start, count, buffer);
  const read = file.runtime.UTF16ToString(buffer);
  file.free(buffer);
  return read;
}
