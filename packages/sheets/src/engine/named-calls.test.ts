// Named functions as formulas call them (docs/specs/029-sheets/formulas.md "Named functions").
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { compileNamedFunctions, type NamedFunction } from '../named-functions';
import { parseFormula } from '../formula/parse';
import { evaluate, NAMED_FUNCTION_TOO_DEEP } from './evaluate';
import type { Frame } from './frame';

const fn = (name: string, params: string[], body: string): NamedFunction => ({
  name,
  params,
  body,
});
const CONTAINS = fn(
  'CONTAINS',
  ['search_query', 'search_range'],
  '=NOT(ISERROR(MATCH(search_query, search_range, 0)))',
);
const TWICE = fn('TWICE', ['x'], '=x*2');
const FUNCTIONS = [
  CONTAINS,
  TWICE,
  fn('ROWCOUNT', ['r'], '=ROWS(r)'),
  fn('QUAD', ['x'], '=TWICE(TWICE(x))'),
  fn('FACT_', ['n'], '=IF(n<=1, 1, n*FACT_(n-1))'),
  fn('FOREVER', ['n'], '=FOREVER(n+1)'),
  fn('TOTAL', [], '=SUM(totals)'),
  fn('SEEN', ['totals'], '=totals'),
  fn('CALLER', [], '=hidden'),
];
const DATA = { A1: '1', A2: '2', A3: '3', B1: '10' };
const v = (formula: string, functions = FUNCTIONS) =>
  book({ ...DATA, J20: formula }, { functions }).v('J20');
const why = (formula: string) => (v(formula) as { why?: string }).why;

describe('a named function called', () => {
  it('works its definition out with the values given', () => {
    expect(v('=CONTAINS(2, A1:A3)')).toBe(true);
    expect(v('=CONTAINS(9, A1:A3)')).toBe(false);
    expect(v('=twice(B1)')).toBe(20);
  });

  it('takes a range as a range', () => {
    expect(v('=ROWCOUNT(A1:A3)')).toBe(3);
  });

  it('counts its values as Google words it', () => {
    expect(v('=CONTAINS(1)')).toMatchObject({ e: '#N/A' });
    expect(why('=CONTAINS(1)')).toBe(
      'Wrong number of arguments to CONTAINS. Expected exactly 2 arguments, but got 1 argument.',
    );
    expect(why('=TWICE(1, 2)')).toBe(
      'Wrong number of arguments to TWICE. Expected exactly 1 argument, but got 2 arguments.',
    );
  });

  it('calls other named functions and itself', () => {
    expect(v('=QUAD(3)')).toBe(12);
    expect(v('=FACT_(5)')).toBe(120);
  });

  it('stops a call nested too deep with #NUM!', () => {
    expect(v('=FOREVER(1)')).toMatchObject({ e: '#NUM!', why: NAMED_FUNCTION_TOO_DEEP });
  });

  it('is applied as a LAMBDA when a helper is handed its name', () => {
    expect(v('=MAP(A1:A3, TWICE)')).toBe(2);
    expect(book({ ...DATA, J20: '=MAP(A1:A3, TWICE)' }, { functions: FUNCTIONS }).v('J22')).toBe(6);
    expect(v('=REDUCE(0, A1:A3, LAMBDA(acc, x, acc + TWICE(x)))')).toBe(12);
    expect(v('=LET(f, TWICE, f(4))')).toBe(8);
  });

  it('reads named ranges, a placeholder hiding one of its name', () => {
    const b = book({ ...DATA, J20: '=TOTAL()', J21: '=SEEN(5)' }, { functions: FUNCTIONS });
    const sheet = b.sheets[0]!;
    const totals = { name: 'totals', r1: 's0r0', c1: 's0c0', r2: 's0r2', c2: 's0c0' };
    b.wb.updateSheet({ ...sheet, layout: { ...sheet.layout, names: [totals] } });
    expect(b.v('J20')).toBe(6);
    expect(b.v('J21')).toBe(5);
  });

  it('never sees the caller’s LET names', () => {
    expect(v('=LET(hidden, 5, CALLER())')).toMatchObject({ e: '#NAME?' });
  });

  it('is #NAME? once removed, and every formula is worked out again as the list changes', () => {
    const b = book({ ...DATA, J20: '=TWICE(A3)' }, { functions: FUNCTIONS });
    expect(b.v('J20')).toBe(6);
    b.wb.setFunctions([fn('TWICE', ['x'], '=x*3')]);
    expect(b.v('J20')).toBe(9);
    b.wb.setFunctions([]);
    expect(b.v('J20')).toMatchObject({ e: '#NAME?', why: 'Unknown function TWICE' });
    expect(b.wb.functionList()).toEqual([]);
  });

  it('leaves out a definition that cannot be read', () => {
    expect(compileNamedFunctions([fn('BAD', [], '=SUM(')]).size).toBe(0);
  });

  it('spends one call from the budget each time', () => {
    const defs = compileNamedFunctions([TWICE]);
    const ast = parseFormula('=TWICE(1)');
    if (!ast.ok) throw new Error('parse');
    const frame = { ctx: { fn: (n: string) => defs.get(n) ?? null }, spend: () => false };
    expect(evaluate(ast.ast, [], frame as unknown as Frame)).toMatchObject({ e: '#NUM!' });
  });
});

describe('the workbook’s use of named functions', () => {
  it('sees an import through a named function', () => {
    const fetching = [fn('WEB', ['u'], '=IMPORTDATA(u)'), fn('WEB2', ['u'], '=WEB(u)')];
    expect(book({ A1: '=WEB2("https://x.test")' }, { functions: fetching }).wb.usesImports()).toBe(
      true,
    );
    expect(book({ A1: '=TWICE(1)' }, { functions: fetching }).wb.usesImports()).toBe(false);
  });
});
