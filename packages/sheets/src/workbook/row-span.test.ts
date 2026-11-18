import { describe, expect, it } from 'vitest';
import { RowSpan, SHEET_PAGE_ROWS, WORKBOOK_FIRST_ROWS } from './row-span';

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet" (Loading by viewport): rows asked by position, `<from>-<to>`
// half-open, a page at most SHEET_PAGE_ROWS rows.
describe('RowSpan', () => {
  it('reads a span of rows by position, half-open', () => {
    expect(RowSpan.read('0-200')).toEqual({ from: 0, to: 200 });
    expect(RowSpan.read('5000-10000')).toEqual({ from: 5000, to: 10000 });
  });

  it('reads an empty span', () => {
    expect(RowSpan.read('7-7')).toEqual({ from: 7, to: 7 });
  });

  it.each([
    ['nothing', null],
    ['an empty text', ''],
    ['one number', '10'],
    ['a span running backwards', '10-5'],
    ['a negative start', '-1-5'],
    ['a fraction', '0-1.5'],
    ['a sign', '+0-5'],
    ['padding', ' 0-5'],
    ['more rows than a page', `0-${SHEET_PAGE_ROWS + 1}`],
    ['a number past the safe range', '0-99999999999999999999'],
  ])('refuses %s', (_, text) => {
    expect(RowSpan.read(text)).toBeNull();
  });

  it('takes a whole page', () => {
    expect(RowSpan.read(`10-${10 + SHEET_PAGE_ROWS}`)).toEqual({
      from: 10,
      to: 10 + SHEET_PAGE_ROWS,
    });
  });

  it('writes a span as it is read', () => {
    expect(RowSpan.text({ from: 3, to: 9 })).toBe('3-9');
    expect(RowSpan.read(RowSpan.text({ from: 3, to: 9 }))).toEqual({ from: 3, to: 9 });
  });

  it('clamps a span to a row count', () => {
    expect(RowSpan.clamp({ from: 100, to: 300 }, 250)).toEqual({ from: 100, to: 250 });
    expect(RowSpan.clamp({ from: 300, to: 400 }, 250)).toEqual({ from: 250, to: 250 });
    expect(RowSpan.clamp({ from: 0, to: 50 }, 250)).toEqual({ from: 0, to: 50 });
  });

  it('pages a sheet from a row onward', () => {
    expect(RowSpan.page(0, 12_000)).toEqual({ from: 0, to: SHEET_PAGE_ROWS });
    expect(RowSpan.page(10_000, 12_000)).toEqual({ from: 10_000, to: 12_000 });
  });

  it('opens on the first rows', () => {
    expect(RowSpan.first()).toEqual({ from: 0, to: WORKBOOK_FIRST_ROWS });
  });
});
