// Text functions beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Text"): T, UNICHAR and UNICODE at
// their edges, REGEX functions refusing numbers, REGEXEXTRACT's groups, JOIN refusing a table.
import { describe, expect, it } from 'vitest';
import { book, calc } from '../../testing/book';

describe('T, UNICHAR and UNICODE', () => {
  it.each([
    ['=T(A1)', 'x'],
    ['=T(B1)', ''],
    ['=UNICHAR(1114112)', { e: '#VALUE!' }],
    ['=UNICHAR(55296)', { e: '#VALUE!' }],
    ['=UNICHAR(57344)', '\ue000'],
    ['=UNICODE(A1)', 120],
    ['=UNICODE(TRUE)', 84],
  ])('%s', (formula, value) => {
    const got = calc(formula, { A1: 'x', B1: '5' });
    if (typeof value === 'object') expect(got).toMatchObject(value);
    else expect(got).toBe(value);
  });

  it('gives each value of an array its own T', () => {
    const b = book({ A1: 'a', A2: '2', J20: '=T(A1:A2)' });
    expect(b.wb.formulaResult(b.sheets[0]!.id, 19, 9)).toEqual({ rows: [['a'], ['']] });
  });
});

describe('the REGEX functions', () => {
  it.each(['=REGEXMATCH(A1, "1")', '=REGEXEXTRACT(A1, "1")', '=REGEXREPLACE(A1, "1", "x")'])(
    '%s refuses a number',
    (formula) => {
      expect(calc(formula, { A1: '12' })).toMatchObject({ e: '#VALUE!' });
    },
  );

  it('reads a boolean or an empty cell as text', () => {
    expect(calc('=REGEXMATCH(TRUE, "TR")')).toBe(true);
    expect(calc('=REGEXMATCH(A1, "^$")')).toBe(true);
  });

  it('gives each capture group a column, an unmatched group empty', () => {
    const b = book({ J20: '=REGEXEXTRACT("ab", "(a)(x)?(b)")' });
    expect(b.wb.formulaResult(b.sheets[0]!.id, 19, 9)).toEqual({ rows: [['a', '', 'b']] });
  });

  it('gives one capture group alone, empty when it matched nothing', () => {
    expect(calc('=REGEXEXTRACT("ab12", "[a-z]+(\\d+)")')).toBe('12');
    expect(calc('=REGEXEXTRACT("b", "(a)?b")')).toBe('');
  });
});

describe('SEARCH and TEXT', () => {
  it.each([
    ['=SEARCH("~~", "a~b")', 2],
    ['=TEXT(TRUE, "0")', 'TRUE'],
    ['=TEXT(FALSE, "0")', 'FALSE'],
    ['=TEXT(A1, "0")', ''],
  ])('%s', (formula, value) => {
    expect(calc(formula)).toBe(value);
  });
});

describe('JOIN', () => {
  it('joins a row and a column, in order', () => {
    expect(calc('=JOIN("-", A1:C1, A1:A2)', { A1: '1', B1: '2', C1: '3', A2: '4' })).toBe(
      '1-2-3-1-4',
    );
  });

  it('refuses a table', () => {
    expect(calc('=JOIN("-", A1:B2)', { A1: '1' })).toMatchObject({ e: '#VALUE!' });
  });
});
