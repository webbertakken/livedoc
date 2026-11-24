import { describe, expect, it } from 'vitest';
import { parseA1 } from '../address';
import { cellKey, type CellFormat } from '../sheet';
import { book } from '../testing/book';
import { renderWindow } from './render';

// formatting.md "Alignment, wrapping, rotation": images and exports draw turned text in the box its row was sized by.
describe('the render model of turned text', () => {
  it('carries a turned cell its angle and turned box, a stacked one its characters as lines', () => {
    const b = book({
      A1: 'Up',
      A2: 'ab\ncd',
      A3: 'Top',
      A4: 'plain',
      A5: '=CONCAT("a", CHAR(10), "b")',
      A6: '=""',
      A7: '=CHAR(10)',
    });
    const sheet = b.sheets[0]!;
    const set = (a1: string, f: CellFormat) => {
      const p = parseA1(a1)!;
      const key = cellKey(sheet.layout.rows[p.r]!, sheet.layout.cols[p.c]!);
      sheet.cells.set(key, { ...sheet.cells.get(key), format: f });
    };
    set('A1', { ro: 90 });
    set('A2', { ro: -45 });
    set('A3', { ro: 'v' });
    set('A5', { ro: 45 });
    set('A6', { ro: 45, bg: '#ffff00' });
    set('A7', { ro: 'v', bg: '#ffff00' });
    b.wb.updateSheet({ ...sheet });
    const model = renderWindow(b.wb, sheet.id, { width: 600, height: 400 }, 'en-GB')!;
    const cell = (r: number) => model.cells.find((x) => x.r === r)!;
    expect(cell(0)).toMatchObject({ text: 'Up', turn: { deg: 90, w: 17 } });
    expect(cell(0).lines).toBeUndefined();
    expect(cell(1)).toMatchObject({ lines: ['ab', 'cd'], turn: { deg: -45 } });
    expect(cell(2)).toMatchObject({ lines: ['T', 'o', 'p'] });
    expect(cell(2).turn).toBeUndefined();
    expect(cell(3).turn).toBeUndefined();
    // A formula's line break is drawn as a space, as the row was sized.
    expect(cell(4)).toMatchObject({ text: 'a b', turn: { deg: 45 } });
    // Nothing to turn: an empty text, and a stacked one of line breaks alone.
    expect(cell(5)).toMatchObject({ text: '', fill: '#ffff00' });
    expect(cell(5).turn).toBeUndefined();
    expect(cell(6)).toMatchObject({ text: '', fill: '#ffff00' });
  });
});
