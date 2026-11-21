// docs/specs/034-text-documents/page-layout.md "Line numbers" (Drawn, Counted): each numbered line's number on the page
// it is drawn on, 0.25 in before its column, counted on through the document, from 1 on each page or from 1 at each
// section; sections without line numbers neither draw nor count.
import { describe, expect, it } from 'vitest';
import type { LineNumbers } from '@livedoc/text-documents';
import { pagesSaid } from './pagination-draw';
import {
  LINE_NUMBER_GAP_PX,
  lineNumberMarks,
  pageTopsInBody,
  type DrawnLine,
} from './pagination-line-numbers';

const LINE = 20;
// Two pages, 200 px of body each (the second's top 200 px below the first's).
const PAGE_TOPS = [-50, 150];
const line = (block: number, top: number, column = 0): DrawnLine => ({
  block,
  top,
  bottom: top + LINE,
  column,
});
const leftOf = (section: number, column: number) => 96 + section * 10 + column * 300;

const marks = (
  lines: readonly DrawnLine[],
  numbering: readonly (LineNumbers | undefined)[],
  sectionOf: readonly number[] = [0, 0, 0, 0],
  pageTops: readonly number[] = PAGE_TOPS,
) =>
  lineNumberMarks({ lines, sectionOf, numbering, pageTops, leftOf }).map((page) =>
    page.map((m) => m.number),
  );

describe('lineNumberMarks', () => {
  it('numbers each line in page coordinates, right-aligned 0.25 in before its column', () => {
    const [first] = lineNumberMarks({
      lines: [line(0, 0), line(1, 20, 1)],
      sectionOf: [0, 0],
      numbering: [{ restart: 'continuous' }],
      pageTops: PAGE_TOPS,
      leftOf,
    });
    expect(LINE_NUMBER_GAP_PX).toBe(24);
    expect(first).toEqual([
      { top: 50, height: LINE, right: 96 - 24, number: 1 },
      { top: 70, height: LINE, right: 396 - 24, number: 2 },
    ]);
  });

  it('counts on through the document', () => {
    expect(
      marks([line(0, 0), line(0, 20), line(1, 160), line(1, 180)], [{ restart: 'continuous' }]),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('restarts on each page', () => {
    expect(marks([line(0, 0), line(0, 20), line(1, 160)], [{ restart: 'page' }])).toEqual([
      [1, 2],
      [1],
    ]);
  });

  it('puts a line on the page its middle is on', () => {
    // 145 to 165: its middle 155 is on page 2.
    expect(marks([line(0, 0), line(0, 145)], [{ restart: 'page' }])).toEqual([[1], [1]]);
  });

  it('restarts at each section, and a section without numbers neither draws nor counts', () => {
    const lines = [line(0, 0), line(1, 20), line(2, 40), line(3, 60)];
    const sectionOf = [0, 1, 2, 2];
    expect(
      marks(lines, [{ restart: 'section' }, undefined, { restart: 'section' }], sectionOf),
    ).toEqual([[1, 1, 2], []]);
    expect(
      marks(lines, [{ restart: 'continuous' }, undefined, { restart: 'continuous' }], sectionOf),
    ).toEqual([[1, 2, 3], []]);
  });

  it('draws every line where a file counts by another number', () => {
    expect(marks([line(0, 0), line(0, 20)], [{ restart: 'continuous', countBy: 5 }])).toEqual([
      [1, 2],
      [],
    ]);
  });

  it('draws nothing without pages', () => {
    expect(marks([line(0, 0)], [{ restart: 'continuous' }], [0], [])).toEqual([]);
  });
});

describe('pageTopsInBody', () => {
  it("takes each page's top from the body's, which stands at the first page's top margin", () => {
    // Pages 100 px high, 12 px apart; the body starts 30 px down the first.
    expect(pageTopsInBody([{ height: 100 }, { height: 100 }, { height: 80 }], 30)).toEqual([
      -30, 82, 194,
    ]);
  });
});

describe('pagesSaid', () => {
  it("tells the pages again when a line's number moves or changes", () => {
    const page = { width: 816, height: 1056 };
    const with_ = (top: number, number = 1) => [
      { ...page, lines: [{ top, height: LINE, right: 72, number }] },
    ];
    expect(pagesSaid(with_(10))).toBe(pagesSaid(with_(10)));
    expect(pagesSaid(with_(10))).not.toBe(pagesSaid(with_(30)));
    expect(pagesSaid(with_(10))).not.toBe(pagesSaid(with_(10, 2)));
    expect(pagesSaid(with_(10))).not.toBe(pagesSaid([page]));
  });
});
