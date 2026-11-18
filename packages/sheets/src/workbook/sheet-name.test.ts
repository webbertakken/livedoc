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
