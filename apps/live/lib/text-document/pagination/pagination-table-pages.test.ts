// A table laid onto pages (docs/specs/034-text-documents/tables.md "Laying out across pages"). Header rows repeat at the
// top of each page it continues on: the page's gap grows by their height and its writing starts below them; they never
// end a page alone; too tall, or cut by a span, they repeat none. A row that may not break moves on whole, unless it is
// taller than a page.
import { describe, expect, it } from 'vitest';
import type { BlockMetrics } from './pagination';
import { paginate } from './pagination-engine';
import { tableRepeat } from './pagination-tables';

const ROW = 20;
// A text area five rows high: 50 px from one page's text foot to the next one's text top (19 + 12 + 19).
const page = { width: 400, height: 138, top: 19, bottom: 19, left: 20, textHeight: 100 };
const frame = () => page;

const rows = (count: number, repeat?: BlockMetrics['repeat']): BlockMetrics => ({
  height: count * ROW,
  marginTop: 0,
  marginBottom: 0,
  lines: Array.from({ length: count }, (_, i) => ({ top: i * ROW, bottom: (i + 1) * ROW })),
  ...(repeat ? { repeat } : {}),
});

const starts = (blocks: readonly BlockMetrics[]) =>
  paginate(blocks, frame).starts.map(({ block, line, gap, repeat }) => [block, line, gap, repeat]);

describe('tableRepeat', () => {
  const lines = [0, 1, 2, 3].map((k) => ({ top: k * ROW, bottom: (k + 1) * ROW }));
  const rowsAt = (...rows: number[]) => rows.map((row) => ({ row, at: 0 }));

  it('repeats the header rows by their lines and height', () => {
    expect(tableRepeat(rowsAt(0, 1, 2, 3), lines, 2)).toEqual({ lines: 2, height: 40 });
  });

  it('repeats none without header rows, or when every row is one', () => {
    expect(tableRepeat(rowsAt(0, 1, 2, 3), lines, 0)).toBeUndefined();
    expect(tableRepeat(rowsAt(0, 1, 2, 3), lines, 4)).toBeUndefined();
  });

  it('repeats none when a cell spans from the header rows into the rows below', () => {
    // Rows 1 and 2 are one line: the header's last row is joined to the first body row.
    expect(tableRepeat(rowsAt(0, 1, 3), lines.slice(0, 3), 2)).toBeUndefined();
  });

  it('counts the lines a body row breaks into after the header rows', () => {
    const places = [...rowsAt(0, 1), { row: 1, at: 10 }, ...rowsAt(2)];
    expect(tableRepeat(places, lines, 1)).toEqual({ lines: 1, height: 20 });
  });
});

describe('paginate a table with header rows', () => {
  it('reserves their height at the top of each page it continues on', () => {
    // Ten rows, the first a header: page 1 takes rows 0-4; page 2 the copy (20) and rows 5-8; page 3 the copy and row 9.
    expect(starts([rows(10, { lines: 1, height: ROW })])).toEqual([
      [0, 0, 0, undefined],
      [0, 5, 50 + ROW, ROW],
      [0, 9, 50 + ROW, ROW],
    ]);
  });

  it('never ends a page with the header rows alone, moving the table on', () => {
    // A paragraph of four rows, then a table whose header row would be all page 1 holds of it.
    expect(starts([rows(4), rows(3, { lines: 1, height: ROW })])).toEqual([
      [0, 0, 0, undefined],
      [1, 0, 70, undefined],
    ]);
  });

  it('repeats none when the header rows take more than half the text area', () => {
    const tall = rows(10, { lines: 3, height: 3 * ROW });
    expect(starts([tall]).map(([, , , repeat]) => repeat)).toEqual([undefined, undefined]);
  });

  it('keeps the reserved height when laid again from a page starting inside the table', () => {
    // Pages start at rows 0, 5, 9 and 13 of the table; a change in the last paragraph lays again from row 9.
    const blocks = [rows(14, { lines: 1, height: ROW }), rows(1), rows(1)];
    const previous = paginate(blocks, frame);
    expect(previous.starts.map((s) => [s.line, s.repeat])).toEqual([
      [0, undefined],
      [5, ROW],
      [9, ROW],
      [13, ROW],
    ]);
    const since = paginate(blocks, frame, { previous, first: 2, last: 2, delta: 0 });
    expect(since.laidFrom).toBe(2);
    expect(since.starts).toEqual(previous.starts);
  });
});

describe('paginate a table row that may not break', () => {
  // Rows of one line each, then row 3 of four lines (lines 3 to 6), held inside.
  const table = (count: number, held: number[]): BlockMetrics => ({ ...rows(count), held });

  it('ends the page before it when it does not fit', () => {
    // A paragraph a row high, then the table: lines 0 to 3 fit (to 100 px), line 4 does not, inside row 3.
    expect(starts([rows(1), table(7, [4, 5, 6])]).map(([b, l]) => [b, l])).toEqual([
      [0, 0],
      [1, 3],
    ]);
  });

  it('breaks it anyway when it is taller than a page, at the foot of the page it starts', () => {
    // Lines 1 to 7 are one row held inside; on a page of its own it breaks after five lines.
    expect(starts([rows(1), table(8, [2, 3, 4, 5, 6, 7])]).map(([b, l]) => [b, l])).toEqual([
      [0, 0],
      [1, 1],
      [1, 6],
    ]);
  });
});
