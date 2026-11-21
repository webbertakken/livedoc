// IMPORTRANGE in the engine (docs/specs/029-sheets/formulas.md "Other workbooks"): the request it makes, Loading…
// until the page answers, the source's values spilled, the api's refusals as they come, web access never in its way,
// a spreadsheet in This Browser, the minute's refresh apart from the web's hour, and NOW refused.
import { describe, expect, it } from 'vitest';
import { book } from '../../testing/book';
import { IMPORT_WORDS, importKey, type ImportRequest } from '../../imports/import-request';
import { RANGE_WORDS } from '../../imports/range-import';
import { compileFormula } from '../stored';

const URL = 'https://docs.nu/document/src1';
const RANGE: ImportRequest = { kind: 'range', source: 'src1', range: 'Data!A1:B2' };
const DATA: ImportRequest = { kind: 'data', url: 'https://example.com/a.csv' };
const blocked = { imports: { access: 'blocked' as const } };

describe('IMPORTRANGE', () => {
  it('asks for its range whatever the web access, Loading… meanwhile, then spills the values', () => {
    const b = book({ A1: `=IMPORTRANGE("${URL}", " Data!A1:B2 ")` }, blocked);
    expect(b.v('A1')).toMatchObject({ e: '#N/A', why: 'pending' });
    expect(b.wb.takeImportAsks()).toEqual([
      { key: importKey(RANGE), request: RANGE, fresh: false },
    ]);
    b.wb.landImport(importKey(RANGE), {
      values: [
        [1, 'two'],
        [true, { e: '#DIV/0!' }],
      ],
    });
    expect([b.v('A1'), b.v('B1'), b.v('A2'), b.v('B2')]).toEqual([
      1,
      'two',
      true,
      { e: '#DIV/0!' },
    ]);
  });

  it('reads the id alone as Google reads a key', () => {
    const b = book({ A1: '=IMPORTRANGE("src1", "A1")' }, blocked);
    b.v('A1');
    expect(b.wb.takeImportAsks()[0]!.request).toEqual({
      kind: 'range',
      source: 'src1',
      range: 'A1',
    });
  });

  it('shows the api’s refusal with its words', () => {
    const b = book({ A1: `=IMPORTRANGE("${URL}", "Data!A1:B2")` }, blocked);
    b.v('A1');
    b.wb.takeImportAsks();
    b.wb.landImport(importKey(RANGE), { error: '#REF!', why: RANGE_WORDS.connect, connect: true });
    expect(b.v('A1')).toEqual({ e: '#REF!', why: RANGE_WORDS.connect });
  });

  it.each([
    ['"https://docs.google.com/spreadsheets/d/abc"', '"A1"', RANGE_WORDS.onlyLiveDoc],
    ['""', '"A1"', RANGE_WORDS.onlyLiveDoc],
    [`"${URL}"`, '"A1+1"', RANGE_WORDS.notFound],
    [`"${URL}"`, '""', RANGE_WORDS.notFound],
  ])('IMPORTRANGE(%s, %s) is #REF! asking nothing', (url, range, why) => {
    const b = book({ A1: `=IMPORTRANGE(${url}, ${range})` }, blocked);
    expect(b.v('A1')).toEqual({ e: '#REF!', why });
    expect(b.wb.takeImportAsks()).toEqual([]);
  });

  it('passes an argument’s error on', () => {
    const b = book({ A1: '=IMPORTRANGE(1/0, "A1")', A2: `=IMPORTRANGE("${URL}", 1/0)` }, blocked);
    expect(b.v('A1')).toMatchObject({ e: '#DIV/0!' });
    expect(b.v('A2')).toMatchObject({ e: '#DIV/0!' });
  });

  it('refuses arguments reading NOW', () => {
    const b = book({ A1: `=IMPORTRANGE("${URL}", "A"&MINUTE(NOW()))` }, blocked);
    expect(b.v('A1')).toEqual({ e: '#ERROR!', why: IMPORT_WORDS.volatile });
  });

  it('waits for Sync Document in This Browser, then asks', () => {
    const b = book(
      { A1: `=IMPORTRANGE("${URL}", "Data!A1:B2")` },
      { imports: { access: 'offline' } },
    );
    expect(b.v('A1')).toEqual({ e: '#REF!', why: IMPORT_WORDS.offline });
    expect(b.wb.takeImportAsks()).toEqual([]);
    b.wb.refreshImports('ranges');
    expect(b.wb.takeImportAsks()).toEqual([]);
    b.wb.onlineImports(false);
    expect(b.v('A1')).toMatchObject({ why: 'pending' });
    expect(b.wb.takeImportAsks()).toHaveLength(1);
  });

  it('is #N/A where no editor asks', () => {
    const b = book({ A1: `=IMPORTRANGE("${URL}", "A1")` });
    expect(b.v('A1')).toEqual({ e: '#N/A', why: IMPORT_WORDS.noFetcher });
  });
});

describe('refreshing by family', () => {
  it('asks ranges again each minute and the web each hour, never the one for the other', () => {
    const b = book(
      {
        A1: `=IMPORTRANGE("${URL}", "Data!A1:B2")`,
        A3: '=IMPORTDATA("https://example.com/a.csv")',
      },
      { imports: { access: 'allowed' as const } },
    );
    b.v('A1');
    b.v('A3');
    b.wb.takeImportAsks();
    b.wb.landImport(importKey(RANGE), { values: [[1]] });
    b.wb.landImport(importKey(DATA), { rows: [['x']] });
    b.wb.refreshImports('ranges');
    expect(b.wb.takeImportAsks().map((a) => a.request)).toEqual([RANGE]);
    b.wb.refreshImports('web');
    expect(b.wb.takeImportAsks().map((a) => a.request)).toEqual([DATA]);
  });
});

describe('reading a source where nothing fetches the web (the api)', () => {
  const source = { imports: { access: 'allowed' as const, web: false as const } };

  it('asks only for ranges: web imports and pictures read as with no book', () => {
    const b = book(
      {
        A1: '=IMPORTDATA("https://example.com/a.csv")',
        A2: '=IMAGE("https://example.com/a.png")',
        A3: `=IMPORTRANGE("${URL}", "A1")`,
      },
      source,
    );
    expect(b.v('A1')).toEqual({ e: '#N/A', why: IMPORT_WORDS.noFetcher });
    expect(b.v('A2')).toBe('');
    expect(b.v('A3')).toMatchObject({ why: 'pending' });
    expect(b.wb.takeImportAsks().map((a) => a.request.kind)).toEqual(['range']);
    expect(b.wb.usesRangeImports()).toBe(true);
  });
});

describe('Workbook.rangeOf', () => {
  const b = book({ Sheet1: { A1: '1', A2: '2', B5: '=1/0' }, Data: { C3: 'x' } });
  const first = b.sheets[0]!.id;
  const rangeOf = (text: string) => {
    const compiled = compileFormula(text, b.wb.ctxFor(first));
    return compiled.ok ? b.wb.rangeOf(first, compiled.formula) : 'no';
  };

  it('is the rectangle a reference names, whole columns to the filled extent', () => {
    expect(rangeOf('=A1:B2')).toEqual({ sheetId: first, r1: 0, c1: 0, r2: 1, c2: 1 });
    expect(rangeOf('=A:A')).toEqual({ sheetId: first, r1: 0, c1: 0, r2: 4, c2: 0 });
    expect(rangeOf('=Data!C3')).toEqual({ sheetId: b.sheets[1]!.id, r1: 2, c1: 2, r2: 2, c2: 2 });
  });

  it('is null for a formula that names no cells', () => {
    expect(rangeOf('=1+1')).toBeNull();
    expect(rangeOf('=Nope!A1')).toBeNull();
    expect(b.wb.rangeOf(first, { t: '(', r: [] })).toBeNull();
  });

  it('knows no IMPORTRANGE in a book without one', () => {
    expect(b.wb.usesRangeImports()).toBe(false);
  });
});
