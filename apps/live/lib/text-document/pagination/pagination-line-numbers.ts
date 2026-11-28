// Line numbers on the pages (docs/specs/034-text-documents/page-layout.md "Line numbers", "Drawn", "Counted"): each
// line of a numbered section numbered on the page its middle is drawn on, right-aligned 0.25 in before its column's
// left edge; counted over numbered lines only, on through the document, from 1 at each page's first numbered line, or
// from 1 at each section's first. Pure: the drawn lines come measured (pagination-line-reading.ts).
import { type LineNumbers, PAGE_GAP_PX } from '@livedoc/text-documents';

/** The room between a line's number and its column's left edge: 0.25 in, in CSS pixels (default). */
export const LINE_NUMBER_GAP_PX = 24;

/** A line as drawn: its block, its extent from the body's top and the column it is in (0 the first), in CSS pixels. */
export type DrawnLine = {
  readonly block: number;
  readonly top: number;
  readonly bottom: number;
  readonly column: number;
};

/** A line's number on its page: its line's extent from the page's top, and where the number ends across (page px). */
export type LineNumberMark = {
  readonly top: number;
  readonly height: number;
  readonly right: number;
  readonly number: number;
};

/** Each page's top from the body's, which stands at the first page's top margin `firstTop`, pages `PAGE_GAP_PX` apart. */
export function pageTopsInBody(
  pages: readonly { readonly height: number }[],
  firstTop: number,
): number[] {
  let top = -firstTop;
  return pages.map((page) => {
    const at = top;
    top += page.height + PAGE_GAP_PX;
    return at;
  });
}

/** The page whose top is the last at or above `y`, the first page for a place above them all. */
export function pageAt(pageTops: readonly number[], y: number): number {
  let page = 0;
  for (let q = 1; q < pageTops.length && pageTops[q]! <= y; q++) page = q;
  return page;
}

/** Each page's line numbers, by its index among the pages drawn (blank ones included); none without pages. */
export function lineNumberMarks(input: {
  /** The lines of the body in document order. */
  readonly lines: readonly DrawnLine[];
  readonly sectionOf: readonly number[];
  /** Each section's line numbers; none where it has none. */
  readonly numbering: readonly (LineNumbers | undefined)[];
  readonly pageTops: readonly number[];
  /** A section's column's left edge across its page (page px). */
  readonly leftOf: (section: number, column: number) => number;
}): LineNumberMark[][] {
  const { lines, sectionOf, numbering, pageTops, leftOf } = input;
  const pages: LineNumberMark[][] = pageTops.map(() => []);
  if (pages.length === 0) return pages;
  let count = 0;
  let last: { page: number; section: number } | null = null;
  for (const line of lines) {
    const section = sectionOf[line.block] ?? 0;
    const own = numbering[section];
    if (!own) continue;
    const page = pageAt(pageTops, (line.top + line.bottom) / 2);
    const restarts =
      (own.restart === 'page' && last?.page !== page) ||
      (own.restart === 'section' && last?.section !== section);
    count = restarts ? 1 : count + 1;
    last = { page, section };
    pages[page]!.push({
      top: line.top - pageTops[page]!,
      height: line.bottom - line.top,
      right: leftOf(section, line.column) - LINE_NUMBER_GAP_PX,
      number: count,
    });
  }
  return pages;
}
