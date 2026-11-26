// Filter by Condition to Google's list (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers"): Is
// Not Between, a date's period from today, and Custom Formula Is written for the first row under the header.
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { conditionMatches, filteredOutRows, isFilterCondition, periodDays } from './filter';
import { compileTypedFormula } from './typed-input';
import { formatA1 } from './address';
import { serialFromDate } from './dates';
import type { FilterCondition, Sheet } from './sheet';

type Book = ReturnType<typeof book>;

// 2026-10-08, the book's clock (46303.5) as a day.
const TODAY = 46303;

function filterBy(b: Book, cond: FilterCondition, col = 0) {
  const sheet = b.sheets[0]!;
  const { rows, cols } = sheet.layout;
  const next: Sheet = {
    ...sheet,
    layout: {
      ...sheet.layout,
      filter: {
        r1: rows[0]!,
        c1: cols[0]!,
        r2: rows[5]!,
        c2: cols[1]!,
        conds: { [cols[col]!]: cond },
      },
    },
  };
  b.sheets[0] = next;
  b.wb.updateSheet(next);
}

const hidden = (b: Book) => {
  const rows = b.sheets[0]!.layout.rows;
  return [...filteredOutRows(b.wb, b.sheets[0]!.id)]
    .map((id) => formatA1(rows.indexOf(id), 0))
    .sort();
};

describe('periodDays', () => {
  it('counts each period from today, the past ones ending today', () => {
    expect(periodDays('today', TODAY)).toEqual([TODAY, TODAY]);
    expect(periodDays('tomorrow', TODAY)).toEqual([TODAY + 1, TODAY + 1]);
    expect(periodDays('yesterday', TODAY)).toEqual([TODAY - 1, TODAY - 1]);
    expect(periodDays('pastWeek', TODAY)).toEqual([TODAY - 7, TODAY]);
    expect(periodDays('pastMonth', TODAY)).toEqual([serialFromDate(2026, 9, 8), TODAY]);
    expect(periodDays('pastYear', TODAY)).toEqual([serialFromDate(2025, 10, 8), TODAY]);
  });

  it('keeps a month back inside a shorter month', () => {
    const march31 = serialFromDate(2026, 3, 31);
    expect(periodDays('pastMonth', march31)[0]).toBe(serialFromDate(2026, 2, 28));
    const jan15 = serialFromDate(2026, 1, 15);
    expect(periodDays('pastMonth', jan15)[0]).toBe(serialFromDate(2025, 12, 15));
  });
});

describe('a date condition by period', () => {
  const at = (cond: FilterCondition, day: number) =>
    conditionMatches(cond, day + 0.25, '', 'en-GB', undefined, TODAY);

  it('is within the period', () => {
    expect(at({ op: 'dateOn', d: 'today' }, TODAY)).toBe(true);
    expect(at({ op: 'dateOn', d: 'today' }, TODAY - 1)).toBe(false);
    expect(at({ op: 'dateOn', d: 'pastWeek' }, TODAY - 7)).toBe(true);
    expect(at({ op: 'dateOn', d: 'pastWeek' }, TODAY - 8)).toBe(false);
    expect(at({ op: 'dateOn', d: 'pastWeek' }, TODAY + 1)).toBe(false);
  });

  it('is before its first day, after its last', () => {
    expect(at({ op: 'dateBefore', d: 'yesterday' }, TODAY - 2)).toBe(true);
    expect(at({ op: 'dateBefore', d: 'yesterday' }, TODAY - 1)).toBe(false);
    expect(at({ op: 'dateAfter', d: 'pastMonth' }, TODAY + 1)).toBe(true);
    expect(at({ op: 'dateAfter', d: 'pastMonth' }, TODAY)).toBe(false);
    expect(at({ op: 'dateAfter', d: 'tomorrow' }, TODAY + 2)).toBe(true);
  });

  it('meets no text', () => {
    expect(
      conditionMatches({ op: 'dateOn', d: 'today' }, 'x', 'x', 'en-GB', undefined, TODAY),
    ).toBe(false);
  });

  it('filters the rows of a sheet by today', () => {
    const b = book({
      A1: 'When',
      A2: '=TODAY()',
      A3: '=TODAY()-1',
      A4: '=TODAY()-30',
      A5: '=TODAY()+1',
      A6: 'x',
    });
    filterBy(b, { op: 'dateOn', d: 'pastWeek' });
    expect(hidden(b)).toEqual(['A4', 'A5', 'A6']);
  });
});

describe('Is Not Between', () => {
  it('keeps the numbers outside either way round', () => {
    const b = book({ A1: 'n', A2: '1', A3: '5', A4: '9', A5: '3', A6: 'x' });
    filterBy(b, { op: 'notBetween', a: '5', b: '3' });
    expect(hidden(b)).toEqual(['A3', 'A5', 'A6']);
  });
});

describe('Custom Formula Is', () => {
  const formula = (b: Book, text: string) => {
    const made = compileTypedFormula(text, 'en-GB', b.wb.ctxFor(b.sheets[0]!.id));
    if (!made.ok) throw new Error(text);
    return made.formula;
  };

  it('keeps the rows where the formula, written for the first row, is true', () => {
    const b = book({
      A1: 'n',
      B1: 'm',
      A2: '1',
      B2: '2',
      A3: '5',
      B3: '1',
      A4: '9',
      B4: '9',
      A5: '3',
      B5: '4',
    });
    filterBy(b, { op: 'formula', fx: formula(b, '=A2<B2') });
    expect(hidden(b)).toEqual(['A3', 'A4', 'A6']);
  });

  it('meets the values ticked as well, and an error or text meets nothing', () => {
    const b = book({ A1: 'n', A2: '1', A3: '2', A4: '3', A5: '4' });
    filterBy(b, { op: 'formula', fx: formula(b, '=A2>1'), values: ['2', '4'] });
    expect(hidden(b)).toEqual(['A2', 'A4', 'A6']);
    filterBy(b, { op: 'formula', fx: formula(b, '=1/0') });
    expect(hidden(b)).toEqual(['A2', 'A3', 'A4', 'A5', 'A6']);
  });

  it('leaves SUBTOTAL out of the rows it hides', () => {
    const b = book({
      A1: 'n',
      A2: '1',
      A3: '2',
      A4: '4',
      A5: '8',
      A6: '16',
      D1: '=SUBTOTAL(9, A2:A6)',
    });
    filterBy(b, { op: 'formula', fx: formula(b, '=A2>2') });
    expect(b.v('D1')).toBe(28);
  });
});

describe('isFilterCondition', () => {
  const fx = { t: '@0>1', r: [{ row: 'r1', col: 'c1' }] };

  it('takes a period only on a date condition', () => {
    expect(isFilterCondition({ op: 'dateOn', d: 'pastYear' })).toBe(true);
    expect(isFilterCondition({ op: 'dateBefore', d: 'today' })).toBe(true);
    expect(isFilterCondition({ op: 'gt', d: 'today' })).toBe(false);
    expect(isFilterCondition({ op: 'dateOn', d: 'nextWeek' })).toBe(false);
    expect(isFilterCondition({ d: 'today' })).toBe(false);
  });

  it('takes Is Not Between', () => {
    expect(isFilterCondition({ op: 'notBetween', a: '1', b: '2' })).toBe(true);
  });

  it('takes a custom formula whole, its references checked, and nothing else with it', () => {
    expect(isFilterCondition({ op: 'formula', fx })).toBe(true);
    expect(isFilterCondition({ op: 'formula', fx, values: ['a'] })).toBe(true);
    expect(isFilterCondition({ op: 'formula', fx }, () => false)).toBe(false);
    expect(isFilterCondition({ op: 'formula' })).toBe(false);
    expect(isFilterCondition({ op: 'formula', fx, a: '1' })).toBe(false);
    expect(isFilterCondition({ op: 'formula', fx: { t: '@1', r: [] } })).toBe(false);
    expect(isFilterCondition({ op: 'gt', a: '1', fx })).toBe(false);
  });
});
