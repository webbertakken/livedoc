// Import Function (docs/specs/029-sheets/data-tools.md "Named ranges and named functions").
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { compileTypedFormula } from './typed-input';
import { definitionText, withDefinition } from './named-function-refs';
import { callsLeftBehind, importedFunction, withImported } from './named-function-import';
import type { NamedFunction } from './named-functions';

const TWICE: NamedFunction = { name: 'TWICE', params: ['x'], body: '=x*2' };
const QUAD: NamedFunction = { name: 'QUAD', params: ['x'], body: '=TWICE(TWICE(x))' };
const MAPPED: NamedFunction = { name: 'MAPPED', params: ['r'], body: '=MAP(r, TWICE)' };
const SELF: NamedFunction = { name: 'FACT_', params: ['n'], body: '=IF(n<=1, 1, n*FACT_(n-1))' };

// A source spreadsheet whose RATED reads its Rates sheet's B2.
function source() {
  const b = book({ Main: {}, Rates: { B2: '10' } });
  const rates = b.sheets[1]!;
  const compiled = compileTypedFormula('=x*Rates!B2', 'en-GB', b.wb.ctxFor(rates.id));
  if (!compiled.ok) throw new Error('compile');
  const rated = withDefinition(
    { name: 'RATED', params: ['x'], body: '' },
    compiled.formula,
    rates.id,
  );
  const sheets = b.sheets.map((s) => ({ id: s.id, title: s.title, layout: s.layout }));
  return { functions: [rated, TWICE], sheets, rated };
}

describe('a function imported', () => {
  it('comes as it is when its definition reads no cell', () => {
    const here = book({ Sheet1: {} });
    expect(importedFunction(TWICE, source(), here.wb.ctxFor(here.sheets[0]!.id))).toBe(TWICE);
  });

  it('reads the sheet of its references’ name here', () => {
    const src = source();
    const here = book({ Sheet1: { A1: '3' }, Rates: { B2: '7' } });
    const ctx = here.wb.ctxFor(here.sheets[0]!.id);
    const fn = importedFunction(src.rated, src, ctx);
    expect(fn.refs![0]!.s).toBe(here.sheets[1]!.id);
    expect(definitionText(fn, ctx)).toBe('=x*Rates!$B$2');
    here.wb.setFunctions([fn]);
    here.set('C1', '=RATED(A1)', 'Sheet1');
    expect(here.v('C1', 'Sheet1')).toBe(21);
  });

  it('is #REF! while no sheet here has the name', () => {
    const src = source();
    const here = book({ Sheet1: {} });
    const ctx = here.wb.ctxFor(here.sheets[0]!.id);
    const fn = importedFunction(src.rated, src, ctx);
    expect(definitionText(fn, ctx)).toBe('=x*Rates!$B$2');
    here.wb.setFunctions([fn]);
    here.set('C1', '=RATED(2)', 'Sheet1');
    expect(here.v('C1', 'Sheet1')).toMatchObject({ e: '#REF!' });
  });

  it('takes its namesake’s place, the rest kept, in name order', () => {
    const here = book({ Sheet1: {} });
    const ctx = here.wb.ctxFor(here.sheets[0]!.id);
    const old: NamedFunction = { ...TWICE, body: '=x+x' };
    const list = withImported([old, QUAD], [TWICE, SELF], source(), ctx);
    expect(list).toEqual([SELF, QUAD, TWICE]);
  });
});

describe('the calls an import leaves behind', () => {
  const src = [TWICE, QUAD, MAPPED, SELF];

  it('names a function of the source neither ticked nor here', () => {
    expect(callsLeftBehind(QUAD, src, [QUAD], [])).toEqual(['TWICE']);
    expect(callsLeftBehind(MAPPED, src, [MAPPED], [])).toEqual(['TWICE']);
  });

  it('names none ticked, here, built in, itself or a placeholder', () => {
    expect(callsLeftBehind(QUAD, src, [QUAD, TWICE], [])).toEqual([]);
    expect(callsLeftBehind(QUAD, src, [QUAD], [TWICE])).toEqual([]);
    expect(callsLeftBehind(SELF, src, [SELF], [])).toEqual([]);
    const shadow: NamedFunction = { name: 'SHADOW', params: ['twice'], body: '=twice+1' };
    expect(callsLeftBehind(shadow, src, [shadow], [])).toEqual([]);
    expect(callsLeftBehind({ ...TWICE, body: '=SUM(' }, src, [], [])).toEqual([]);
  });
});
