import { describe, expect, it } from 'vitest';
import { SHEET_NAME_MAX, SheetName } from './sheet-name';

// docs/specs/029-sheets/spreadsheet.md "What a workbook holds": a sheet's name is 1 to 100 characters, unique in the
// workbook (case aside), never ' at either end, none of [ ] * ? / \ :.
describe('SheetName.check', () => {
  it('takes a name within the rules, trimmed', () => {
    expect(SheetName.check('  Q3 Budget ', [])).toEqual({ ok: true, name: 'Q3 Budget' });
  });

  it('takes a name of exactly 100 characters, and refuses 101', () => {
    expect(SheetName.check('x'.repeat(SHEET_NAME_MAX), [])).toMatchObject({ ok: true });
    expect(SheetName.check('x'.repeat(SHEET_NAME_MAX + 1), [])).toEqual({
      ok: false,
      refusal: 'sheet_name_invalid',
    });
  });

  it.each(['', '   ', "'Costs", "Costs'", 'A[1]', 'a*b', 'why?', 'a/b', 'a\\b', 'a:b'])(
    'refuses %j',
    (name) => {
      expect(SheetName.check(name, [])).toEqual({ ok: false, refusal: 'sheet_name_invalid' });
    },
  );

  it('takes an apostrophe inside a name', () => {
    expect(SheetName.check("Webber's", [])).toMatchObject({ ok: true });
  });

  it('refuses a name another sheet has, case aside', () => {
    expect(SheetName.check('sheet1', ['Sheet1'])).toEqual({
      ok: false,
      refusal: 'sheet_name_taken',
    });
  });
});

describe('SheetName.fit', () => {
  it('keeps a name that fits', () => {
    expect(SheetName.fit('Costs', [])).toBe('Costs');
  });

  it('mends what a file brings: forbidden characters become spaces, end apostrophes go, then it is cut', () => {
    expect(SheetName.fit("'Q3: Plan/Actual'", [])).toBe('Q3 Plan Actual');
    expect(SheetName.fit('y'.repeat(150), [])).toBe('y'.repeat(SHEET_NAME_MAX));
  });

  // A file's name is untrusted: mending it stays linear however it is made.
  it('never leaves an apostrophe at the end where the cut falls', () => {
    const fitted = SheetName.fit(`${'y'.repeat(99)}' tail`, []);
    expect(SheetName.check(fitted, [])).toEqual({ ok: true, name: 'y'.repeat(99) });
  });

  it('mends a name of many apostrophes quickly', () => {
    const hostile = `${'\x27'.repeat(100_000)}x${'\x27'.repeat(100_000)}`;
    const started = performance.now();
    expect(SheetName.fit(hostile, [])).toBe('x');
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('numbers a taken name, keeping it within the limit', () => {
    expect(SheetName.fit('Costs', ['costs'])).toBe('Costs 2');
    expect(SheetName.fit('Costs', ['Costs', 'Costs 2'])).toBe('Costs 3');
    const long = 'z'.repeat(SHEET_NAME_MAX);
    expect(SheetName.fit(long, [long])).toBe(`${'z'.repeat(SHEET_NAME_MAX - 2)} 2`);
  });

  it('names an empty one as Google does: the next free SheetN', () => {
    expect(SheetName.fit('  ', ['Sheet1'])).toBe('Sheet2');
  });
});

// sheet-store.md "Changing the workbook": `Sheet<n>`, n the first number from the sheets' count plus one not taken.
describe('SheetName.next', () => {
  it('numbers a new sheet after the sheets there are', () => {
    expect(SheetName.next(['Sheet1'])).toBe('Sheet2');
    expect(SheetName.next(['Costs', 'Budget'])).toBe('Sheet3');
  });

  it('passes a number a sheet has, case aside', () => {
    expect(SheetName.next(['Sheet1', 'sheet2'])).toBe('Sheet3');
    expect(SheetName.next(['Sheet2', 'Sheet3'])).toBe('Sheet4');
  });

  it('names the first sheet of none Sheet1', () => {
    expect(SheetName.next([])).toBe('Sheet1');
  });
});
