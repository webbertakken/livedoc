// The oracle's parts (docs/specs/029-sheets/formulas.md "The oracle"): reading cases and answers, laying the workbook
// out, reading a source's copy back, comparing, and the engine's own answers.
import { describe, expect, it } from 'vitest';
import {
  complexText,
  googleLacks,
  heldAnswer,
  sameBlock,
  sameValue,
  showBlock,
  staleDifferences,
  unnamedDifferences,
} from './compare';
import { OracleCorpus, OracleLayout, type OracleCase, type OracleCategory } from './corpus';
import { engineAnswers } from './oracle-engine';
import { answersOf, oracleFile } from './oracle-file';

const category: OracleCategory = {
  category: 'Test',
  locale: 'en-US',
  data: [[1, 'a', true, null]],
  cases: [
    { id: 'SUM.1', f: '=SUM(Data!A1, 2)', rows: 1, cols: 1, authority: 'google' },
    { id: 'SEQUENCE.1', f: '=SEQUENCE(2, 2)', rows: 2, cols: 2, authority: 'google' },
  ],
};

const one = (x: Partial<OracleCase>): OracleCase => ({
  id: 'X.1',
  f: '=1',
  rows: 1,
  cols: 1,
  authority: 'google',
  ...x,
});

describe('OracleCorpus.readCategory', () => {
  it('fills a block of one cell and Google as the authority', () => {
    const read = OracleCorpus.readCategory({
      category: 'C',
      cases: [{ id: 'ABS.1', f: '=ABS(-1)' }],
    });
    expect(read).toEqual({
      ok: true,
      category: {
        category: 'C',
        locale: 'en-US',
        data: [],
        cases: [{ id: 'ABS.1', f: '=ABS(-1)', rows: 1, cols: 1, authority: 'google' }],
      },
    });
  });

  it('names every problem', () => {
    expect(OracleCorpus.readCategory(null)).toEqual({
      ok: false,
      problems: ['a category has a name and cases'],
    });
    const read = OracleCorpus.readCategory({
      category: 'C',
      locale: 'german',
      data: [[{ e: '#WHAT' }]],
      cases: [
        { id: 'bad id', f: 'SUM(1)', rows: 0, authority: 'excel', tol: 0.1 },
        { id: 'A.1', f: '=1', expect: [[1]] },
        { id: 'A.1', f: '=1', cite: 'somewhere', expect: 'x', tol: 1e-7 },
        null,
      ],
    });
    expect(read.ok).toBe(false);
    expect(!read.ok && read.problems).toEqual([
      'data must be rows of values',
      'bad id: id must read NAME.n',
      'bad id: f must be a formula',
      'bad id: rows must be a whole number from 1',
      'bad id: authority must be google or openformula',
      'bad id: tol must loosen the tolerance, at most to 0.000001',
      'bad id: a loosened tol says why in note',
      'A.1: an answer written in the case cites where it is documented',
      'A.1: a loosened tol says why in note',
      'A.1: expect must be rows of values',
      'A.1: id used twice',
      'case 4: id must read NAME.n',
      'case 4: f must be a formula',
      'locale must be a language and a region, as de-DE',
    ]);
  });

  // formulas.md, the file's meaning: a case's answers in the files' meanings.
  it("reads a case's answers in the files' meanings, and names what is wrong with them", () => {
    const cases = [
      { id: 'M.1', f: '=1', meaning: { openformula: 'libreoffice' } },
      { id: 'M.2', f: '=1', meaning: { ooxml: [[1]], cite: 'Microsoft' } },
      { id: 'M.3', f: '=1', meaning: 'ooxml' },
      { id: 'M.4', f: '=1', meaning: { cite: 'x', excel: [[1]] } },
      { id: 'M.5', f: '=1', meaning: { ooxml: 'x', openformula: 'excel' } },
      { id: 'M.6', f: '=1', meaning: { openformula: [[1]] } },
      { id: 'M.7', f: '=1', meaning: null },
    ];
    const read = OracleCorpus.readCategory({ category: 'C', cases });
    expect(!read.ok && read.problems).toEqual([
      'M.3: meaning must name answers',
      'M.4: meaning holds ooxml, openformula and cite',
      'M.4: meaning names an answer in ooxml or openformula',
      'M.5: meaning.ooxml must be rows of values',
      'M.5: meaning.openformula must be rows of values or libreoffice',
      'M.5: a written meaning cites where',
      'M.6: a written meaning cites where',
      'M.7: meaning must name answers',
    ]);
    const good = OracleCorpus.readCategory({ category: 'C', cases: cases.slice(0, 2) });
    expect(good.ok && good.category.cases.map((x) => x.meaning)).toEqual([
      { openformula: 'libreoffice' },
      { ooxml: [[1]], cite: 'Microsoft' },
    ]);
  });
});

describe('OracleCorpus.readAnswers', () => {
  const good = {
    source: 'libreoffice',
    category: 'C',
    by: 'LO',
    made: 'today',
    answers: { 'A.1': [[1]] },
  };
  it('reads an answer file, and nothing else', () => {
    expect(OracleCorpus.readAnswers(good)).toEqual(good);
    expect(OracleCorpus.readAnswers(null)).toBeNull();
    expect(OracleCorpus.readAnswers({ ...good, source: 'excel' })).toBeNull();
    expect(OracleCorpus.readAnswers({ ...good, by: 1 })).toBeNull();
    expect(OracleCorpus.readAnswers({ ...good, answers: null })).toBeNull();
    expect(OracleCorpus.readAnswers({ ...good, answers: { 'A.1': 1 } })).toBeNull();
  });
});

describe('OracleLayout', () => {
  it('puts each block a blank row after the last, its formula in column B', () => {
    expect(OracleLayout.blocks(category)).toEqual([
      { id: 'SUM.1', r: 0, c: 1, rows: 1, cols: 1 },
      { id: 'SEQUENCE.1', r: 2, c: 1, rows: 2, cols: 2 },
    ]);
    expect(OracleLayout.size(category)).toEqual({ rows: 5, cols: 4 });
    expect(OracleLayout.size({ ...category, cases: [] })).toEqual({ rows: 1, cols: 3 });
  });
});

describe('oracleFile and answersOf', () => {
  it('writes the fixture and the cases, an array case over its block', () => {
    const file = oracleFile(category);
    expect(file.sheets[0]).toMatchObject({ name: 'Data', rows: 100, cols: 26 });
    expect(file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 'n', v: 1 } },
      { r: 0, c: 1, value: { k: 's', v: 'a' } },
      { r: 0, c: 2, value: { k: 'b', v: true } },
    ]);
    expect(file.sheets[1]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 's', v: 'SUM.1' } },
      { r: 0, c: 1, formula: '=SUM(Data!A1, 2)' },
      { r: 2, c: 0, value: { k: 's', v: 'SEQUENCE.1' } },
      { r: 2, c: 1, formula: '=SEQUENCE(2, 2)', spans: { rows: 2, cols: 2 } },
    ]);
  });

  // An ARRAYFORMULA is written as the array formula of what it wraps, so both suites read one array context.
  it('writes an ARRAYFORMULA as an array formula over its block', () => {
    const file = oracleFile({
      ...category,
      cases: [
        { id: 'A.1', f: '=ARRAYFORMULA( A1:A2*2 )', rows: 2, cols: 1, authority: 'google' },
        { id: 'A.2', f: '=ARRAYFORMULA(SUM(A1:A2*2))', rows: 1, cols: 1, authority: 'google' },
        { id: 'A.3', f: '=ARRAYFORMULA(1, 2)', rows: 1, cols: 1, authority: 'google' },
        { id: 'A.4', f: '=SUM(', rows: 1, cols: 1, authority: 'google' },
      ],
    });
    expect(file.sheets[1]!.cells.filter((c) => c.formula)).toEqual([
      { r: 0, c: 1, formula: '=A1:A2*2', spans: { rows: 2, cols: 1 } },
      { r: 3, c: 1, formula: '=SUM(A1:A2*2)', spans: { rows: 1, cols: 1 } },
      { r: 5, c: 1, formula: '=ARRAYFORMULA(1, 2)' },
      { r: 7, c: 1, formula: '=SUM(' },
    ]);
  });

  // Files hold the stored syntax (formulas.md "Locale"); a formula the locale cannot read stays as typed.
  it('writes a category typed in another locale in the stored syntax', () => {
    const file = oracleFile({
      ...category,
      locale: 'de-DE',
      cases: [
        { id: 'A.1', f: '=ROUND(1,5;0)', rows: 1, cols: 1, authority: 'google' },
        { id: 'A.2', f: '=SUM(1,2,3)', rows: 1, cols: 1, authority: 'google' },
      ],
    });
    expect(file.sheets[1]!.cells.filter((c) => c.formula)).toEqual([
      { r: 0, c: 1, formula: '=ROUND(1.5,0)' },
      { r: 2, c: 1, formula: '=SUM(1,2,3)' },
    ]);
  });

  it('reads each block back, errors from their text', () => {
    const file = oracleFile(category);
    const cases = file.sheets[1]!;
    cases.cells = [
      { r: 0, c: 0, value: { k: 's', v: 'SUM.1' } },
      { r: 0, c: 1, formula: '=1/0', value: { k: 'e', v: '#DIV/0!' } },
      { r: 2, c: 0, value: { k: 's', v: 'SEQUENCE.1' } },
      { r: 2, c: 1, value: { k: 'n', v: 1 } },
      { r: 2, c: 2, value: { k: 's', v: 'Err:502' } },
      { r: 3, c: 1, value: { k: 's', v: '#N/A' } },
      { r: 3, c: 2, value: { k: 'b', v: false } },
    ];
    expect(answersOf(category, file)).toEqual({
      answers: {
        'SUM.1': [[{ e: '#DIV/0!' }]],
        'SEQUENCE.1': [
          [1, { e: 'Err:502' }],
          [{ e: '#N/A' }, false],
        ],
      },
      problems: [],
    });
  });

  it('names a block that is missing or runs past its size', () => {
    const file = oracleFile(category);
    file.sheets[1]!.cells = [
      { r: 2, c: 0, value: { k: 's', v: 'SEQUENCE.1' } },
      { r: 4, c: 1, value: { k: 'n', v: 5 } },
    ];
    expect(answersOf(category, file).problems).toEqual([
      'SUM.1: not found at row 1',
      'SEQUENCE.1: the answer runs past its 2 × 2 block',
    ]);
    expect(answersOf(category, { sheets: [] }).problems).toEqual(['no Cases sheet']);
  });
});

describe('comparing', () => {
  it('holds numbers to the tolerance, empty to empty, errors by code', () => {
    expect(sameValue(1, 1 + 1e-12)).toBe(true);
    expect(sameValue(1, 1.001)).toBe(false);
    expect(sameValue(1, 1.0000001, 1e-6)).toBe(true);
    expect(sameValue(1.2e-16, 0)).toBe(true);
    expect(sameValue(null, '')).toBe(true);
    expect(sameValue(null, 0)).toBe(false);
    expect(sameValue({ e: '#N/A' }, { e: '#N/A' })).toBe(true);
    expect(sameValue({ e: '#N/A' }, { e: '#REF!' })).toBe(false);
    expect(sameValue({ e: 'Err:502' }, { e: '#NUM!' })).toBe(true);
    expect(sameValue('a', 'A')).toBe(false);
    expect(sameValue(true, 1)).toBe(false);
  });

  // formulas.md "The oracle": complex numbers written as text agree by their parts.
  it('compares complex numbers written as text by their parts', () => {
    expect(
      sameValue('0.303931001628426-0.621518017170428i', '0.303931001628426-0.621518017170429i'),
    ).toBe(true);
    expect(sameValue('-4', '-4+4.89858719658941E-16i')).toBe(true);
    expect(sameValue('2i', '1.22464679914735E-16+2i')).toBe(true);
    expect(sameValue('1+i', '1+j')).toBe(false);
    expect(sameValue('1+2i', '1+3i')).toBe(false);
    expect(sameValue('5', '5.0')).toBe(false);
    expect(sameValue('a', 'b')).toBe(false);
    expect(complexText('-i')).toEqual({ re: 0, im: -1, unit: 'i' });
    expect(complexText('3+j')).toEqual({ re: 3, im: 1, unit: 'j' });
    expect(complexText('1e-3-2.5E+2i')).toEqual({ re: 0.001, im: -250, unit: 'i' });
    expect(complexText('x+2i')).toBeNull();
    expect(complexText('1+xi')).toBeNull();
    expect(complexText('abc')).toBeNull();
  });

  it('compares blocks', () => {
    expect(sameBlock([[1]], [[1], [2]])).toBe(false);
    expect(sameBlock([[1, 2]], [[1]])).toBe(false);
    expect(showBlock([[1]])).toBe('1');
    expect(showBlock([[1, 2]])).toBe('[[1,2]]');
  });

  it("holds a case to a cited answer, its authority's, then LibreOffice's", () => {
    expect(heldAnswer(one({ expect: [[1]], cite: 'x' }), { google: [[2]] })).toEqual({
      source: 'cited',
      answer: [[1]],
      provisional: false,
    });
    expect(heldAnswer(one({}), { google: [[2]], libreoffice: [[3]] })?.source).toBe('google');
    expect(heldAnswer(one({}), { libreoffice: [[3]] })).toEqual({
      source: 'libreoffice',
      answer: [[3]],
      provisional: true,
    });
    expect(heldAnswer(one({ authority: 'openformula' }), { libreoffice: [[3]] })?.provisional).toBe(
      false,
    );
    expect(heldAnswer(one({ differs: { libreoffice: 'why' } }), { libreoffice: [[3]] })).toBeNull();
    expect(heldAnswer(one({}), {})).toBeNull();
  });

  it('finds differences between sources no case names', () => {
    expect(
      unnamedDifferences(one({ expect: [[1]], cite: 'x' }), { google: [[1]], libreoffice: [[2]] }),
    ).toEqual(['X.1: cited=1 libreoffice=2', 'X.1: google=1 libreoffice=2']);
    expect(unnamedDifferences(one({}), { google: [[1]] })).toEqual([]);
    expect(
      unnamedDifferences(one({ differs: { libreoffice: 'why' } }), {
        google: [[1]],
        libreoffice: [[2]],
      }),
    ).toEqual([]);
  });

  // formulas.md "The oracle": a difference a case names is there.
  it('finds a named difference that is no longer there', () => {
    const named = one({ differs: { libreoffice: 'why', google: 'why' } });
    expect(staleDifferences(named, { google: [[1]], libreoffice: [[2]] })).toEqual([
      'X.1: google answers as the case holds (google); drop its differs',
    ]);
    const cited = one({ expect: [[1]], cite: 'x', differs: { libreoffice: 'why', cited: 'why' } });
    expect(staleDifferences(cited, { libreoffice: [[1]] })).toEqual([
      'X.1: cited answers as the case holds (cited); drop its differs',
      'X.1: libreoffice answers as the case holds (cited); drop its differs',
    ]);
    expect(staleDifferences(one({ differs: { google: 'why' } }), {})).toEqual([]);
    expect(staleDifferences(one({ differs: { libreoffice: 'why' } }), { google: [[1]] })).toEqual(
      [],
    );
    expect(staleDifferences(one({}), { google: [[1]], libreoffice: [[1]] })).toEqual([]);
  });

  it('names no difference where Google lacks an OpenFormula function, and only there', () => {
    const name = { e: '#NAME?' };
    const openFormula = one({ authority: 'openformula' });
    expect(googleLacks(openFormula, [[name], [null]])).toBe(true);
    expect(googleLacks(openFormula, [[name], [2]])).toBe(false);
    expect(googleLacks(openFormula, [[{ e: '#N/A' }]])).toBe(false);
    expect(googleLacks(openFormula, [[1]])).toBe(false);
    expect(googleLacks(openFormula, [])).toBe(false);
    expect(googleLacks(one({}), [[name]])).toBe(false);
    expect(unnamedDifferences(openFormula, { google: [[name]], libreoffice: [[2]] })).toEqual([]);
    expect(unnamedDifferences(one({}), { google: [[name]], libreoffice: [[2]] })).toEqual([
      'X.1: google={"e":"#NAME?"} libreoffice=2',
    ]);
  });
});

describe('engineAnswers', () => {
  it('works out each block, and says why it has no answer', () => {
    const answers = engineAnswers({
      ...category,
      cases: [
        ...category.cases,
        one({ id: 'BAD.1', f: '=SUM(' }),
        one({ id: 'SHAPE.1', f: '=SEQUENCE(1, 3)' }),
        one({ id: 'SHAPE.2', f: '=SEQUENCE(1, 2)', rows: 2, cols: 2 }),
      ],
    });
    expect(Object.fromEntries(answers)).toEqual({
      'SUM.1': { ok: true, answer: [[3]] },
      'SEQUENCE.1': {
        ok: true,
        answer: [
          [1, 2],
          [3, 4],
        ],
      },
      'BAD.1': { ok: false, why: 'parse:unexpected_token' },
      'SHAPE.1': { ok: false, why: 'shape:1x3' },
      'SHAPE.2': { ok: false, why: 'shape:1x2' },
    });
  });

  it('refuses a fixture that holds an error', () => {
    expect(() => engineAnswers({ ...category, data: [[{ e: '#N/A' }]] })).toThrow(
      'Test: a fixture holds values, never errors',
    );
  });
});
