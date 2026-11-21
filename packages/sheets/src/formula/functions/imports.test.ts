// The import functions in the engine (docs/specs/029-sheets/imports.md): the request each formula makes, Loading…
// until the page answers, the answer typed in the locale, Allow Access, the hourly refresh, a retyped cell asking
// afresh, NOW and RAND refused, and the refusal where no editor fetches.
import { describe, expect, it } from 'vitest';
import { book, calc } from '../../testing/book';
import { IMPORT_WORDS, importKey, type ImportRequest } from '../../imports/import-request';
import { importedValue } from './imports';

const allowed = { imports: { allowed: true } };
const DATA: ImportRequest = { kind: 'data', url: 'https://example.com/a.csv' };

describe('the requests the import functions make', () => {
  it.each<[string, ImportRequest]>([
    ['=IMPORTDATA("https://example.com/a.csv")', DATA],
    ['=IMPORTDATA("example.com/a.csv")', { kind: 'data', url: 'http://example.com/a.csv' }],
    [
      '=IMPORTHTML("https://example.com", "Table", 2)',
      { kind: 'html', url: 'https://example.com/', query: 'table', index: 2 },
    ],
    [
      '=IMPORTHTML("https://example.com", "list", 1.9)',
      { kind: 'html', url: 'https://example.com/', query: 'list', index: 1 },
    ],
    [
      '=IMPORTXML("https://example.com", "//a/@href")',
      { kind: 'xml', url: 'https://example.com/', xpath: '//a/@href' },
    ],
    [
      '=IMPORTXML("https://example.com", "//p", "nl_NL")',
      { kind: 'xml', url: 'https://example.com/', xpath: '//p' },
    ],
    [
      '=IMPORTFEED("https://example.com/feed")',
      {
        kind: 'feed',
        url: 'https://example.com/feed',
        query: 'items',
        headers: false,
        items: null,
      },
    ],
    [
      '=IMPORTFEED("https://example.com/feed", "", TRUE, 3)',
      { kind: 'feed', url: 'https://example.com/feed', query: 'items', headers: true, items: 3 },
    ],
    [
      '=IMPORTFEED("https://example.com/feed", "Feed  URL",,)',
      {
        kind: 'feed',
        url: 'https://example.com/feed',
        query: 'feed url',
        headers: false,
        items: null,
      },
    ],
  ])('%s asks for its import, Loading… meanwhile', (f, request) => {
    const b = book({ A1: f }, allowed);
    expect(b.v('A1')).toMatchObject({ e: '#N/A', why: 'pending' });
    expect(b.wb.takeImportAsks()).toEqual([{ key: importKey(request), request, fresh: false }]);
  });

  it.each([
    ['=IMPORTDATA("ftp://example.com/a.csv")', '#N/A', 'Url not found: ftp://example.com/a.csv'],
    ['=IMPORTDATA("")', '#N/A', 'Url not found: '],
    ['=IMPORTDATA(1/0)', '#DIV/0!', undefined],
    ['=IMPORTHTML("https://example.com", "div", 1)', '#VALUE!', undefined],
    ['=IMPORTHTML("https://example.com", "table", 0)', '#VALUE!', undefined],
    ['=IMPORTHTML("https://example.com", 1/0, 1)', '#DIV/0!', undefined],
    ['=IMPORTHTML("https://example.com", "table", "x")', '#VALUE!', undefined],
    ['=IMPORTHTML(1/0, "table", 1)', '#DIV/0!', undefined],
    ['=IMPORTXML("https://example.com", "//a[")', '#VALUE!', undefined],
    ['=IMPORTXML("https://example.com", 1/0)', '#DIV/0!', undefined],
    ['=IMPORTXML(1/0, "//a")', '#DIV/0!', undefined],
    ['=IMPORTXML("https://example.com", "//a", "not a locale!")', '#VALUE!', undefined],
    ['=IMPORTXML("https://example.com", "//a", 1/0)', '#DIV/0!', undefined],
    ['=IMPORTFEED("https://example.com", "entries")', '#VALUE!', undefined],
    ['=IMPORTFEED("https://example.com", 1/0)', '#DIV/0!', undefined],
    ['=IMPORTFEED("https://example.com", "items", "maybe")', '#VALUE!', undefined],
    ['=IMPORTFEED("https://example.com", "items", FALSE, 0)', '#VALUE!', undefined],
    ['=IMPORTFEED("https://example.com", "items", FALSE, "x")', '#VALUE!', undefined],
    ['=IMPORTFEED(1/0)', '#DIV/0!', undefined],
  ])('%s is %s, asking nothing', (f, e, why) => {
    const b = book({ A1: f }, allowed);
    expect(b.v('A1')).toMatchObject(why === undefined ? { e } : { e, why });
    expect(b.wb.takeImportAsks()).toEqual([]);
  });
});

describe('an import answered', () => {
  it('spills the answer, typed in the locale, once it arrives', () => {
    const b = book(
      { A1: '=IMPORTDATA("https://example.com/a.csv")' },
      { ...allowed, locale: 'en-US' },
    );
    expect(b.v('A1')).toMatchObject({ why: 'pending' });
    b.wb.landImport(importKey(DATA), {
      rows: [
        ['name', '1,234.5'],
        ['TRUE', ''],
      ],
    });
    expect(b.v('A1')).toBe('name');
    expect(b.v('B1')).toBe(1234.5);
    expect(b.v('A2')).toBe(true);
    expect(b.v('B2')).toBe(null);
  });

  it('reads numbers in the locale IMPORTXML names', () => {
    const b = book({ A1: '=IMPORTXML("https://example.com", "//p", "de-DE")' }, allowed);
    b.v('A1');
    const [ask] = b.wb.takeImportAsks();
    b.wb.landImport(ask!.key, { rows: [['1.234,5']] });
    expect(b.v('A1')).toBe(1234.5);
  });

  it('shows the error the api answers', () => {
    const b = book({ A1: '=IMPORTDATA("https://example.com/a.csv")' }, allowed);
    b.v('A1');
    b.wb.landImport(importKey(DATA), { error: '#N/A', why: IMPORT_WORDS.notFetched(DATA.url) });
    expect(b.v('A1')).toEqual({ e: '#N/A', why: 'Could not fetch url: https://example.com/a.csv' });
  });

  it('asks once for one import read by many cells, and answers them all', () => {
    const f = '=IMPORTDATA("https://example.com/a.csv")';
    const b = book({ A1: f, C1: f }, allowed);
    b.v('A1');
    b.v('C1');
    expect(b.wb.takeImportAsks()).toHaveLength(1);
    b.wb.landImport(importKey(DATA), { rows: [['x']] });
    expect([b.v('A1'), b.v('C1')]).toEqual(['x', 'x']);
  });

  it('answers a cell reading two imports, and an answer no cell reads', () => {
    const b = book(
      {
        A1: '=IFERROR(IMPORTDATA("https://example.com/a.csv"), IMPORTDATA("https://example.com/b.csv"))',
      },
      allowed,
    );
    b.v('A1');
    expect(b.wb.takeImportAsks()).toHaveLength(2);
    b.wb.landImport('no such key', { rows: [['x']] });
    b.wb.landImport(importKey(DATA), { rows: [['a']] });
    expect(b.v('A1')).toBe('a');
  });

  it('works out nothing again when an answer is the same as the last', () => {
    const b = book({ A1: '=IMPORTDATA("https://example.com/a.csv")' }, allowed);
    b.v('A1');
    b.wb.landImport(importKey(DATA), { rows: [['x']] });
    b.v('A1');
    const version = b.wb.version;
    b.wb.landImport(importKey(DATA), { rows: [['x']] });
    expect(b.wb.version).toBe(version);
  });
});

describe('Allow Access', () => {
  it('is #REF! asking nothing until access is allowed, then fetches', () => {
    const b = book(
      { A1: '=IMPORTDATA("https://example.com/a.csv")' },
      { imports: { allowed: false } },
    );
    expect(b.v('A1')).toEqual({ e: '#REF!', why: IMPORT_WORDS.blocked });
    expect(b.wb.takeImportAsks()).toEqual([]);
    b.wb.refreshImports();
    b.set('A1', '=IMPORTDATA("https://example.com/a.csv")');
    expect(b.wb.takeImportAsks()).toEqual([]);
    b.wb.allowImports();
    expect(b.v('A1')).toMatchObject({ why: 'pending' });
    expect(b.wb.takeImportAsks()).toHaveLength(1);
    b.wb.allowImports();
    expect(b.wb.takeImportAsks()).toEqual([]);
  });
});

describe('refreshing', () => {
  it('asks again each hour for the imports still read, keeping the values meanwhile', () => {
    const b = book({ A1: '=IMPORTDATA("https://example.com/a.csv")' }, allowed);
    b.v('A1');
    b.wb.takeImportAsks();
    b.wb.landImport(importKey(DATA), { rows: [['old']] });
    expect(b.v('A1')).toBe('old');
    b.wb.refreshImports();
    expect(b.wb.takeImportAsks()).toEqual([{ key: importKey(DATA), request: DATA, fresh: false }]);
    expect(b.v('A1')).toBe('old');
    b.wb.landImport(importKey(DATA), { rows: [['new']] });
    expect(b.v('A1')).toBe('new');
  });

  it('lets go of an import no formula reads any more', () => {
    const b = book({ A1: '=IMPORTDATA("https://example.com/a.csv")' }, allowed);
    b.v('A1');
    b.wb.takeImportAsks();
    b.wb.landImport(importKey(DATA), { rows: [['x']] });
    b.set('A1', '1');
    b.v('A1');
    b.wb.refreshImports();
    expect(b.wb.takeImportAsks()).toEqual([]);
    b.set('A1', '=IMPORTDATA("https://example.com/a.csv")');
    expect(b.v('A1')).toMatchObject({ why: 'pending' });
  });

  it('asks afresh when a cell is typed again, past the api’s hour', () => {
    const f = '=IMPORTDATA("https://example.com/a.csv")';
    const b = book({ A1: f }, allowed);
    b.v('A1');
    b.wb.takeImportAsks();
    b.wb.landImport(importKey(DATA), { rows: [['x']] });
    b.v('A1');
    b.set('A1', f);
    expect(b.v('A1')).toBe('x');
    expect(b.wb.takeImportAsks()).toEqual([{ key: importKey(DATA), request: DATA, fresh: true }]);
    b.set('A1', f);
    b.set('A1', '2');
    expect(b.v('A1')).toBe(2);
    expect(b.wb.takeImportAsks()).toEqual([]);
  });

  it('notes readers again after the workbook starts afresh', () => {
    const b = book({ A1: '=IMPORTDATA("https://example.com/a.csv")' }, allowed);
    b.v('A1');
    b.wb.takeImportAsks();
    b.wb.landImport(importKey(DATA), { rows: [['x']] });
    b.wb.updateSheet({ ...b.sheets[0]!, title: 'Renamed' });
    b.wb.refreshImports();
    expect(b.wb.takeImportAsks()).toEqual([]);
    expect(b.v('A1')).toMatchObject({ why: 'pending' });
    b.wb.landImport(importKey(DATA), { rows: [['x']] });
    expect(b.v('A1')).toBe('x');
    b.wb.landImport(importKey(DATA), { rows: [['y']] });
    expect(b.v('A1')).toBe('y');
  });
});

describe('NOW and RAND in an import’s arguments', () => {
  it.each([
    '=IMPORTDATA("https://example.com/?t="&NOW())',
    '=IMPORTXML("https://example.com/", "//a["&RANDBETWEEN(1,2)&"]")',
    '=IMPORTHTML("https://example.com/"&A2, "table", 1)',
    '=IMPORTFEED("https://example.com/"&C1)',
  ])('%s is #ERROR!', (f) => {
    const b = book({ A1: f, A2: '=RAND()', B1: 'x', B2: '=A2*2', C1: '=B2' }, allowed);
    expect(b.v('A1')).toEqual({ e: '#ERROR!', why: IMPORT_WORDS.volatile });
  });

  it('reaches NOW through a chain of cells and a spill', () => {
    const b = book(
      {
        A1: '=IMPORTDATA("https://example.com/"&C1)',
        B1: '=NOW()',
        C1: '=B1+1',
        D1: '=SEQUENCE(2)*RAND()',
        A3: '=IMPORTDATA("https://example.com/"&D2)',
      },
      allowed,
    );
    b.v('C1');
    b.v('D2');
    expect(b.v('A1')).toMatchObject({ e: '#ERROR!' });
    expect(b.v('A3')).toMatchObject({ e: '#ERROR!' });
  });

  it('allows TODAY, and NOW elsewhere in the formula', () => {
    const b = book(
      {
        A1: '=IMPORTDATA("https://example.com/?d="&TODAY())',
        A2: '=NOW()&IMPORTDATA("https://example.com/a.csv")',
      },
      allowed,
    );
    expect(b.v('A1')).toMatchObject({ why: 'pending' });
    expect(b.v('A2')).toMatchObject({ why: 'pending' });
  });
});

describe('where no editor fetches', () => {
  it('reads the refusal, and an answer or Allow Access changes nothing', () => {
    expect(calc('=IMPORTDATA("https://example.com/a.csv")')).toEqual({
      e: '#N/A',
      why: IMPORT_WORDS.noFetcher,
    });
    const b = book({ A1: '=IMPORTDATA("https://example.com/a.csv")' });
    b.v('A1');
    const version = b.wb.version;
    b.wb.landImport(importKey(DATA), { rows: [['x']] });
    b.wb.allowImports();
    b.wb.refreshImports();
    expect(b.wb.takeImportAsks()).toEqual([]);
    expect(b.wb.version).toBe(version);
  });
});

describe('usesImports', () => {
  it('says whether any formula imports, for the Allow Access bar', () => {
    expect(book({ A1: '=IMPORTXML("https://example.com", "//a")', A2: '1' }).wb.usesImports()).toBe(
      true,
    );
    expect(book({ A1: '=SUM(1)' }).wb.usesImports()).toBe(false);
  });
});

describe('importedValue', () => {
  it.each([
    ['  ', 'en-US', null],
    ['false', 'en-US', false],
    ['3.5', 'en-US', 3.5],
    ['3,5', 'nl-NL', 3.5],
    ['2026-11-21', 'en-US', '2026-11-21'],
    ['5%', 'en-US', '5%'],
  ])('reads %j in %s as %j', (text, locale, value) => {
    expect(importedValue(text, locale)).toBe(value);
  });
});
