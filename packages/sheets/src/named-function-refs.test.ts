// A named function's own references (docs/specs/029-sheets/formulas.md "Named functions", D301).
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { compileTypedFormula } from './typed-input';
import { applySheetWrite, inverseSheetWrite } from './store';
import type { LayoutChange } from './store-layout';
import type { Sheet } from './sheet';
import {
  definitionOf,
  definitionText,
  restoreShrunkFunctions,
  shrinkNamedFunctions,
  shrunkFunctions,
  withDefinition,
  withTypedDefinition,
} from './named-function-refs';
import { namedFunctionProblem, readNamedFunctions, type NamedFunction } from './named-functions';

const DATA = {
  Sheet1: { A1: '1', A2: '2', A3: '3', A4: '4', A5: '5' },
  Rates: { B2: '10', B3: '20' },
};

// A workbook, and `name` defined as `typed` while `on` is open.
function defined(name: string, params: string[], typed: string, on = 'Sheet1') {
  const b = book(DATA);
  const sheet = b.sheets.find((s) => s.title === on)!;
  const compiled = compileTypedFormula(typed, 'en-GB', b.wb.ctxFor(sheet.id));
  if (!compiled.ok) throw new Error(typed);
  const fn = withDefinition({ name, params, body: '' }, compiled.formula, sheet.id);
  b.wb.setFunctions([fn]);
  b.set('J20', `=${name}(${params.map(() => '1').join(',')})`);
  return { ...b, fn };
}

const by = (b: ReturnType<typeof book>, title: string) => b.sheets.find((s) => s.title === title)!;

const at = { now: 1, by: { id: '', name: '', color: '#000000' } };

function relayout(b: ReturnType<typeof book>, sheet: Sheet, changes: LayoutChange[]): Sheet {
  const { sheet: next } = applySheetWrite(
    sheet,
    { kind: 'layout', changes },
    { now: 1, by: { id: '', name: '', color: '#000000' } },
  );
  b.sheets[b.sheets.indexOf(sheet)] = next;
  b.wb.updateSheet(next);
  return next;
}

describe('a reference in a named function', () => {
  it('is saved naming its sheet, absolute, and shown so', () => {
    const { fn, wb, sheets } = defined('MYBASE', [], '=A1+Rates!B2');
    expect(fn.refs).toHaveLength(2);
    expect(fn.refs!.every((r) => r.a === 15 && r.s !== undefined)).toBe(true);
    expect(definitionText(fn, wb.ctxFor(sheets[1]!.id))).toBe('=Sheet1!$A$1+Rates!$B$2');
    expect(namedFunctionProblem(fn, [])).toBeNull();
  });

  it('is read as typed in the locale, and shown so', () => {
    const b = book(DATA, { locale: 'de-DE' });
    const ctx = b.wb.ctxFor(b.sheets[0]!.id);
    const base = { name: 'MYPICK', params: ['x'], body: '' };
    const fn = withTypedDefinition(base, ' IF(x;A1;2,5)', ctx, 'de-DE');
    expect(fn.body).toBe('=IF(x,@0,2.5)');
    expect(definitionText(fn, ctx, 'de-DE')).toBe('=IF(x;Sheet1!$A$1;2,5)');
    expect(withTypedDefinition(base, '=IF(', ctx, 'de-DE').body).toBe('=IF(');
    expect(definitionText({ name: 'ONE', params: [], body: '=1' }, ctx)).toBe('=1');
  });

  it('reads the same cells whichever sheet calls it', () => {
    const b = defined('MYBASE', [], '=A1+Rates!B2');
    expect(b.v('J20')).toBe(11);
    b.set('C1', '=MYBASE()', 'Rates');
    expect(b.v('C1', 'Rates')).toBe(11);
  });

  it('works out again when a cell it reads changes', () => {
    const b = defined('MYBASE', [], '=A1*2');
    b.set('A1', '7');
    expect(b.v('J20')).toBe(14);
  });

  it('follows its sheet renamed', () => {
    const b = defined('MYRATE', [], '=Rates!B2');
    const rates = by(b, 'Rates');
    const renamed = { ...rates, title: 'Tariffs' };
    b.sheets[b.sheets.indexOf(rates)] = renamed;
    b.wb.updateSheet(renamed);
    expect(definitionText(b.fn, b.wb.ctxFor(renamed.id))).toBe('=Tariffs!$B$2');
    expect(b.v('J20')).toBe(10);
  });

  it('follows rows inserted above its cells', () => {
    const b = defined('MYRATE', [], '=Rates!B2');
    const rates = by(b, 'Rates');
    relayout(b, rates, [{ k: 'insertRows', after: null, ids: ['new1'] }]);
    expect(definitionText(b.fn, b.wb.ctxFor(rates.id))).toBe('=Rates!$B$3');
    expect(b.v('J20')).toBe(10);
  });

  it('is #REF! once its cell is deleted, or its sheet', () => {
    const b = defined('MYRATE', [], '=Rates!B2');
    const rates = by(b, 'Rates');
    relayout(b, rates, [{ k: 'deleteRows', ids: [rates.layout.rows[1]!] }]);
    expect(definitionText(b.fn, b.wb.ctxFor(rates.id))).toBe('=#REF!');
    expect(b.v('J20')).toMatchObject({ e: '#REF!' });

    const c = defined('MYRATE', [], '=Rates!B2');
    const gone = by(c, 'Rates');
    c.wb.removeSheet(gone.id);
    expect(definitionText(c.fn, c.wb.ctxFor(c.sheets[0]!.id))).toBe('=#REF!');
    expect(c.v('J20')).toMatchObject({ e: '#REF!' });
  });
});

describe('rows deleted inside a definition’s range', () => {
  it('shrink it, as another sheet’s formula’s range shrinks', () => {
    const b = defined('MYTOTAL', [], '=SUM(A1:A5)');
    const sheet = by(b, 'Sheet1');
    const changes: LayoutChange[] = [{ k: 'deleteRows', ids: [sheet.layout.rows[4]!] }];
    const shrunk = shrinkNamedFunctions(sheet.id, sheet.layout, changes, [b.fn])!;
    const deleted = applySheetWrite(sheet, { kind: 'layout', changes }, at);
    const next = relayout(b, sheet, changes);
    expect(definitionText(shrunk[0]!, b.wb.ctxFor(next.id))).toBe('=SUM(Sheet1!$A$1:$A$4)');
    b.wb.setFunctions(shrunk);
    // J20 is J19 now.
    expect(b.v('J19')).toBe(10);
    // Undo: the row comes back with its id, the definition as it was; the result is as before.
    const back = applySheetWrite(next, inverseSheetWrite(sheet, deleted), at).sheet;
    b.sheets[b.sheets.indexOf(next)] = back;
    b.wb.updateSheet(back);
    expect(back.layout.rows).toEqual(sheet.layout.rows);
    b.wb.setFunctions(restoreShrunkFunctions(shrunk, shrunkFunctions([b.fn], shrunk))!);
    expect(definitionText(b.wb.functionList()[0]!, b.wb.ctxFor(next.id))).toBe(
      '=SUM(Sheet1!$A$1:$A$5)',
    );
    expect(b.v('J20')).toBe(15);
  });

  it('leave the list alone when no definition reads the sheet', () => {
    const b = defined('MYTOTAL', [], '=SUM(A1:A5)');
    const rates = by(b, 'Rates');
    const plain: NamedFunction = { name: 'TWICE', params: ['x'], body: '=x*2' };
    const changes: LayoutChange[] = [{ k: 'deleteRows', ids: [rates.layout.rows[0]!] }];
    expect(shrinkNamedFunctions(rates.id, rates.layout, changes, [b.fn, plain])).toBeNull();
  });
});

describe('a definition as stored', () => {
  it('is its template and its references', () => {
    const { fn } = defined('MYBASE', [], '=A1+1');
    expect(definitionOf(fn)).toEqual({ t: '@0+1', r: fn.refs });
    expect(definitionOf({ name: 'ONE', params: [], body: '=1' })).toEqual({ t: '1', r: [] });
  });

  it('is read back from the wire, and refused when its references are not well made', () => {
    const { fn } = defined('MYBASE', [], '=A1+1');
    expect(readNamedFunctions(JSON.parse(JSON.stringify([fn])))).toEqual([fn]);
    expect(readNamedFunctions([{ ...fn, refs: [{ zz: 1 }] }])).toBeNull();
    expect(readNamedFunctions([{ ...fn, refs: [] }])).toBeNull();
    expect(readNamedFunctions([{ ...fn, refs: 'A1' }])).toBeNull();
  });

  it('refuses a template naming a reference it lacks, or an A1 reference not stored', () => {
    const unreadable = { field: 'definition', message: "That formula can't be read" };
    expect(namedFunctionProblem({ name: 'X', params: [], body: '=@1' }, [])).toEqual(unreadable);
    expect(namedFunctionProblem({ name: 'X', params: [], body: '=A1+1' }, [])).toEqual(unreadable);
  });
});

describe('the undo of a deletion’s shrink', () => {
  const ref = { s: 'sheet0xx', r1: 'r1', c1: 'c1', r2: 'r3', c2: 'c1', a: 15 };
  const was: NamedFunction = { name: 'PICKED', params: [], body: '=SUM(@0)', refs: [ref] };
  const left: NamedFunction = { ...was, refs: [{ ...ref, r1: 'r2' }] };
  const other: NamedFunction = { name: 'TWICE', params: ['x'], body: '=x*2' };

  it('knows each function the deletion shrank', () => {
    expect(shrunkFunctions([was, other], [left, other])).toEqual([{ was, left }]);
  });

  it('puts back a function as the deletion left it, in its place', () => {
    expect(restoreShrunkFunctions([left, other], [{ was, left }])).toEqual([was, other]);
    // Read afresh from the wire: the same by what it holds.
    const read = JSON.parse(JSON.stringify(left)) as NamedFunction;
    expect(restoreShrunkFunctions([read], [{ was, left }])).toEqual([was]);
  });

  it('leaves someone’s later edit or removal, as the undo of cells does', () => {
    const edited = { ...left, description: 'Theirs' };
    expect(restoreShrunkFunctions([edited, other], [{ was, left }])).toBeNull();
    expect(restoreShrunkFunctions([other], [{ was, left }])).toBeNull();
  });
});
