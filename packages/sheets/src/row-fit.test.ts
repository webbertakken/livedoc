import { describe, expect, it } from 'vitest';
import { parseA1 } from './address';
import { AXIS_SIZE_MAX, ROW_HEIGHT_NEW } from './limits';
import { cellLines, rowHeights } from './row-fit';
import { cellKey, type CellFormat, type SheetLayout } from './sheet';
import { book } from './testing/book';

const PROSE =
  'Rows grow to fit the text their cells hold, so nobody has to size them by hand, in any browser at all';

type Book = ReturnType<typeof book>;
const sheetOf = (b: Book) => b.sheets[0]!;

// The cell's format changed, as the editor's write would, and the workbook told.
function format(b: Book, a1: string, f: CellFormat): void {
  const sheet = sheetOf(b);
  const pos = parseA1(a1)!;
  const key = cellKey(sheet.layout.rows[pos.r]!, sheet.layout.cols[pos.c]!);
  const cells = sheet.cells.copy();
  cells.set(key, { ...cells.get(key), format: f });
  const next = { ...sheet, cells };
  b.sheets[0] = next;
  b.wb.updateSheet(next, [key]);
}

function relayout(b: Book, change: (layout: SheetLayout) => Partial<SheetLayout>): void {
  const sheet = sheetOf(b);
  const next = { ...sheet, layout: { ...sheet.layout, ...change(sheet.layout) } };
  b.sheets[0] = next;
  b.wb.updateSheet(next);
}

const heightOf = (b: Book, row: number, font?: string) =>
  rowHeights(b.wb, sheetOf(b).id, font)(sheetOf(b).layout.rows[row - 1]!);

const linesOf = (b: Book, a1: string, font?: string) => {
  const pos = parseA1(a1)!;
  const text = b.wb.value(sheetOf(b).id, pos.r, pos.c) as string;
  return cellLines(b.wb, sheetOf(b).id, pos.r, pos.c, text, font);
};

// docs/specs/029-sheets/sheet.md "Row height".
describe('rowHeights', () => {
  it("leaves a row of single lines at the sheet's row height", () => {
    const b = book({ A1: 'Deal', B1: '1234.5', A2: PROSE });
    expect(heightOf(b, 1)).toBe(ROW_HEIGHT_NEW);
    // Text that does not wrap runs over its neighbours: one line, however long.
    expect(heightOf(b, 2)).toBe(ROW_HEIGHT_NEW);
    expect(heightOf(b, 3)).toBe(ROW_HEIGHT_NEW);
  });

  it('grows a row to the lines its wrapping cell breaks into: 17 px a line and 8 px round them', () => {
    const b = book({ A1: PROSE });
    format(b, 'A1', { wr: 'w' });
    const lines = linesOf(b, 'A1');
    expect(lines.length).toBeGreaterThan(3);
    expect(heightOf(b, 1)).toBe(lines.length * 17 + 8);
    expect(lines.join(' ')).toBe(PROSE);
  });

  it('shrinks the row back when the text shortens or its column widens', () => {
    const b = book({ A1: PROSE });
    format(b, 'A1', { wr: 'w' });
    const tall = heightOf(b, 1);
    relayout(b, (l) => ({ colSize: { [l.cols[0]!]: 480 } }));
    expect(heightOf(b, 1)).toBeLessThan(tall);
    expect(heightOf(b, 1)).toBe(linesOf(b, 'A1').length * 17 + 8);
    b.set('A1', 'Short');
    format(b, 'A1', { wr: 'w' });
    expect(heightOf(b, 1)).toBe(ROW_HEIGHT_NEW);
  });

  it('takes the tallest cell of the row', () => {
    const b = book({ A1: PROSE, B1: `${PROSE} ${PROSE}`, C1: 'x' });
    format(b, 'A1', { wr: 'w' });
    format(b, 'B1', { wr: 'w' });
    expect(heightOf(b, 1)).toBe(linesOf(b, 'B1').length * 17 + 8);
  });

  it('starts a line at a typed line break whether the cell wraps or not', () => {
    const b = book({ A1: 'one\ntwo\nthree' });
    expect(heightOf(b, 1)).toBe(3 * 17 + 8);
    format(b, 'A1', { wr: 'c' });
    expect(heightOf(b, 1)).toBe(3 * 17 + 8);
  });

  it("wraps a formula's text, and starts a line at its line breaks only where the cell wraps", () => {
    const b = book({ A1: '="one"&CHAR(10)&"two"', A2: `=REPT("word ", 40)` });
    expect(heightOf(b, 1)).toBe(ROW_HEIGHT_NEW);
    expect(linesOf(b, 'A1')).toEqual(['one two']);
    format(b, 'A1', { wr: 'w' });
    expect(linesOf(b, 'A1')).toEqual(['one', 'two']);
    expect(heightOf(b, 1)).toBe(2 * 17 + 8);
    format(b, 'A2', { wr: 'w' });
    expect(heightOf(b, 2)).toBe(linesOf(b, 'A2').length * 17 + 8);
  });

  it('reads a value a formula spills into a cell that wraps, and no cell without an input otherwise', () => {
    const b = book({ A1: '={"a";"b"&CHAR(10)&"c"&CHAR(10)&"d"}', C5: 'x' });
    expect(b.v('A2')).toBe('b\nc\nd');
    expect([heightOf(b, 1), heightOf(b, 2)]).toEqual([28, 28]);
    format(b, 'A2', { wr: 'w' });
    expect(heightOf(b, 2)).toBe(3 * 17 + 8);
    // A wrapping cell with nothing in it, on a sheet with no formula that may spill, is never read.
    const plain = book({ A1: 'x' });
    format(plain, 'B2', { wr: 'w', fs: 30 });
    expect(heightOf(plain, 2)).toBe(ROW_HEIGHT_NEW);
  });

  it('wraps only text: a number, a true/false and an error stay one line', () => {
    const b = book({ A1: '123456789012345678901234567890', A2: 'TRUE', A3: '=1/0' });
    for (const a1 of ['A1', 'A2', 'A3']) format(b, a1, { wr: 'w' });
    relayout(b, (l) => ({ colSize: { [l.cols[0]!]: 30 } }));
    expect([heightOf(b, 1), heightOf(b, 2), heightOf(b, 3)]).toEqual([28, 28, 28]);
  });

  it('gives one tall line its line height and 1 px: 16 points still fit 28 px, 18 do not (D90)', () => {
    const b = book({ A1: 'Title', A2: 'Title', A3: '12' });
    format(b, 'A1', { fs: 16 });
    format(b, 'A2', { fs: 18 });
    format(b, 'A3', { fs: 24 });
    expect(heightOf(b, 1)).toBe(28);
    expect(heightOf(b, 2)).toBe(31 + 1);
    expect(heightOf(b, 3)).toBe(42 + 1);
  });

  it('measures wrapped text at its own size, bold a little wider', () => {
    const b = book({ A1: PROSE, A2: PROSE });
    format(b, 'A1', { wr: 'w', fs: 14 });
    expect(heightOf(b, 1)).toBe(linesOf(b, 'A1').length * 25 + 8);
    format(b, 'A2', { wr: 'w' });
    const plain = linesOf(b, 'A2').length;
    format(b, 'A2', { wr: 'w', b: true });
    expect(linesOf(b, 'A2').length).toBeGreaterThanOrEqual(plain);
    expect(heightOf(b, 2)).toBe(linesOf(b, 'A2').length * 17 + 8);
  });

  it("measures a cell in its own font, else its tab's", () => {
    const b = book({ A1: PROSE, A2: PROSE });
    format(b, 'A1', { wr: 'w' });
    format(b, 'A2', { wr: 'w', ff: 'oswald' });
    const inter = heightOf(b, 1);
    expect(heightOf(b, 1, 'roboto-mono')).toBeGreaterThan(inter);
    // Its own font, whatever the tab's.
    expect(heightOf(b, 2, 'roboto-mono')).toBe(heightOf(b, 2));
    expect(heightOf(b, 2)).toBeLessThan(inter);
  });

  it('never lets a merged cell make a row taller', () => {
    const b = book({ A1: PROSE, A3: 'one\ntwo\nthree' });
    format(b, 'A1', { wr: 'w' });
    relayout(b, (l) => ({
      merges: [
        { r1: l.rows[0]!, c1: l.cols[0]!, r2: l.rows[0]!, c2: l.cols[1]! },
        { r1: l.rows[2]!, c1: l.cols[0]!, r2: l.rows[3]!, c2: l.cols[0]! },
      ],
    }));
    expect([heightOf(b, 1), heightOf(b, 3), heightOf(b, 4)]).toEqual([28, 28, 28]);
  });

  it('keeps a sized row at its size whatever its cells hold', () => {
    const b = book({ A1: PROSE, A2: PROSE });
    format(b, 'A1', { wr: 'w' });
    format(b, 'A2', { wr: 'w' });
    relayout(b, (l) => ({ rowSize: { [l.rows[0]!]: 40 } }));
    expect(heightOf(b, 1)).toBe(40);
    expect(heightOf(b, 2)).toBeGreaterThan(40);
    // Back to automatic: its size taken away.
    relayout(b, () => ({ rowSize: {} }));
    expect(heightOf(b, 1)).toBe(heightOf(b, 2));
  });

  it("never goes under the sheet's row height, which Cell Size sets", () => {
    const b = book({ A1: 'one\ntwo', A2: 'x' });
    relayout(b, () => ({ rowHeight: 60 }));
    expect([heightOf(b, 1), heightOf(b, 2)]).toEqual([60, 60]);
    relayout(b, () => ({ rowHeight: 24 }));
    expect([heightOf(b, 1), heightOf(b, 2)]).toEqual([2 * 17 + 8, 24]);
  });

  it('stops at 2,000 px', () => {
    const b = book({ A1: `=REPT("word ", 1800)` });
    format(b, 'A1', { wr: 'w' });
    relayout(b, (l) => ({ colSize: { [l.cols[0]!]: 40 } }));
    expect(heightOf(b, 1)).toBe(AXIS_SIZE_MAX);
    expect(linesOf(b, 'A1').length).toBe(Math.ceil(AXIS_SIZE_MAX / 17));
  });

  it('keeps room at the right for a dropdown arrow, a card table column and a filter button', () => {
    const text = 'Waiting on the supplier to confirm';
    const b = book({ A1: text, B1: text, C1: text, D1: text });
    for (const a1 of ['A1', 'B1', 'C1', 'D1']) format(b, a1, { wr: 'w' });
    const plain = linesOf(b, 'A1');
    relayout(b, (l) => ({
      rules: [
        {
          id: 'v1',
          is: 'list',
          show: 'arrow',
          opts: [{ v: text }],
          r1: l.rows[0]!,
          c1: l.cols[1]!,
          r2: l.rows[0]!,
          c2: l.cols[1]!,
        },
      ],
      cardTables: [
        {
          id: 't1',
          head: l.rows[5]!,
          cols: [{ c: l.cols[2]!, field: 'title' }],
          rows: {},
          type: 'x',
        },
      ],
      filter: { r1: l.rows[0]!, c1: l.cols[3]!, r2: l.rows[9]!, c2: l.cols[3]!, conds: {} },
    }));
    const narrower = (a1: string, room: number) => {
      const lines = linesOf(b, a1);
      relayout(b, (l) => ({ colSize: { ...l.colSize, [l.cols[0]!]: 120 - room } }));
      expect(lines).toEqual(linesOf(b, 'A1'));
    };
    narrower('B1', 22);
    narrower('C1', 22);
    narrower('D1', 20);
    expect(plain).toEqual(wrapAt(b, 120));
  });

  it('draws a dropdown chip and a checkbox as one line', () => {
    const b = book({ A1: PROSE, A2: 'TRUE' });
    format(b, 'A1', { wr: 'w' });
    relayout(b, (l) => ({
      rules: [
        {
          id: 'v1',
          is: 'list',
          opts: [{ v: PROSE }],
          r1: l.rows[0]!,
          c1: l.cols[0]!,
          r2: l.rows[0]!,
          c2: l.cols[0]!,
        },
      ],
    }));
    expect(heightOf(b, 1)).toBe(ROW_HEIGHT_NEW);
  });

  it('measures a cell a format rule may make bold as bold, met or not', () => {
    const b = book({ A1: PROSE, A2: PROSE });
    format(b, 'A1', { wr: 'w' });
    format(b, 'A2', { wr: 'w', b: true });
    relayout(b, (l) => ({
      formatRules: [
        {
          id: 'f1',
          is: 'when',
          op: 'contains',
          a: 'never there',
          style: { b: true },
          r1: l.rows[0]!,
          c1: l.cols[0]!,
          r2: l.rows[0]!,
          c2: l.cols[0]!,
        },
      ],
    }));
    expect(linesOf(b, 'A1')).toEqual(linesOf(b, 'A2'));
  });

  it('hands back the same heights while none changed, and new ones when one did', () => {
    const b = book({ A1: PROSE, B1: 'x' });
    format(b, 'A1', { wr: 'w' });
    const first = rowHeights(b.wb, sheetOf(b).id);
    expect(rowHeights(b.wb, sheetOf(b).id)).toBe(first);
    // A change that moves no height: another cell's value.
    b.set('B1', 'y');
    expect(rowHeights(b.wb, sheetOf(b).id)).toBe(first);
    b.set('A2', 'one\ntwo');
    expect(rowHeights(b.wb, sheetOf(b).id)).not.toBe(first);
  });

  // sheet.md "Performance": only cells whose text, room or type changed are measured again.
  it('measures a cell again only when what its lines hang on changed', () => {
    const b = book({ A1: PROSE, B1: 'x' });
    format(b, 'A1', { wr: 'w' });
    heightOf(b, 1);
    const first = linesOf(b, 'A1');
    b.set('B1', 'y');
    heightOf(b, 1);
    expect(linesOf(b, 'A1')).toBe(first);
    // The layout changed, but nothing this cell is measured by.
    relayout(b, (l) => ({ hiddenCols: [l.cols[5]!] }));
    heightOf(b, 1);
    expect(linesOf(b, 'A1')).toBe(first);
    relayout(b, (l) => ({ colSize: { [l.cols[0]!]: 90 } }));
    heightOf(b, 1);
    expect(linesOf(b, 'A1')).not.toBe(first);
  });

  it('answers the new row height for a sheet the workbook does not hold', () => {
    const b = book({ A1: 'x' });
    expect(rowHeights(b.wb, 'gone')('r1')).toBe(ROW_HEIGHT_NEW);
    expect(cellLines(b.wb, 'gone', 0, 0, 'a\nb')).toEqual(['a\nb']);
  });
});

describe('cellLines', () => {
  it('wraps a merged cell in the width of the columns it spans, hidden ones aside', () => {
    const b = book({ A1: PROSE });
    format(b, 'A1', { wr: 'w' });
    const single = linesOf(b, 'A1');
    relayout(b, (l) => ({
      merges: [{ r1: l.rows[0]!, c1: l.cols[0]!, r2: l.rows[0]!, c2: l.cols[2]! }],
    }));
    const merged = linesOf(b, 'A1');
    expect(merged.length).toBeLessThan(single.length);
    relayout(b, (l) => ({ hiddenCols: [l.cols[1]!] }));
    expect(linesOf(b, 'A1').length).toBeGreaterThan(merged.length);
  });

  it('splits text that does not wrap at its line breaks', () => {
    const b = book({ A1: 'one\ntwo' });
    expect(linesOf(b, 'A1')).toEqual(['one', 'two']);
  });

  it('applies a Custom format before measuring', () => {
    const b = book({ A1: 'Ada' });
    format(b, 'A1', { wr: 'w', nf: 'custom', nc: '"Dear "@' });
    const pos = parseA1('A1')!;
    expect(cellLines(b.wb, sheetOf(b).id, pos.r, pos.c, 'Dear Ada')).toEqual(['Dear Ada']);
  });
});

// A1's lines when its column is `width` wide.
function wrapAt(b: Book, width: number): readonly string[] {
  relayout(b, (l) => ({ colSize: { ...l.colSize, [l.cols[0]!]: width } }));
  return linesOf(b, 'A1');
}
