// Database functions beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Functions": Database): errors in
// the field, the labels and the values, empty and numeric criteria labels, and the field left empty.
import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';

// A small database at A1:C4 whose third label is a number, and criteria from E1.
const cells: Record<string, string> = {
  A1: 'Name',
  B1: 'Kind',
  C1: '2024',
  A2: 'Apple',
  B2: 'Fruit',
  C2: '3',
  A3: 'Carrot',
  B3: 'Veg',
  C3: '4',
  A4: 'Date',
  B4: 'Fruit',
  C4: '5',
  E1: 'Kind',
  E2: 'Fruit',
  G1: '2024',
  G2: '>3',
  H2: 'ignored',
};

function check(formula: string, value: unknown, more: Record<string, string> = {}): void {
  const got = calc(formula, { ...cells, ...more });
  if (typeof value === 'object' && value !== null) expect(got).toMatchObject(value);
  else expect(got).toBe(value);
}

describe('database functions', () => {
  it.each([
    ['=DSUM(A1:C4, 3, E1:E2)', 8],
    ['=DSUM(A1:C4, "2024", G1:H2)', 9],
    ['=DSUM(A1:C4, TRUE, E1:E2)', 0],
    ['=DCOUNT(A1:C4, , G1:G2)', 2],
    ['=DCOUNTA(A1:C4, "Name", E1:E2)', 2],
    ['=DMIN(A1:C4, 3, E1:E2)', 3],
  ])('%s is %s', (formula, value) => check(formula, value));

  it.each([
    ['=DSUM(A1:C4, NA(), E1:E2)', '#N/A'],
    ['=DSUM(A1:C4, , E1:E2)', '#VALUE!'],
    ['=DGET(A1:C4, , E1:E2)', '#VALUE!'],
    ['=DSUM(A1:C4, A9, E1:E2)', '#VALUE!'],
    ['=DCOUNT(A1:C4, "Nope", E1:E2)', '#VALUE!'],
    ['=DCOUNTA(A1:C4, 9, E1:E2)', '#VALUE!'],
    ['=DGET(A1:C4, 9, E1:E2)', '#VALUE!'],
  ])('%s is %s', (formula, e) => check(formula, { e }));

  it('hands on an error in a summed value', () => {
    check('=DSUM(A1:C4, 3, E1:E2)', { e: '#N/A' }, { C2: '=NA()' });
  });

  it('passes over a label that is an error when it looks a field up', () => {
    check('=DSUM(A1:C4, "2024", E1:E2)', 8, { A1: '=NA()' });
  });
});
