// IMAGE in a sheet (docs/specs/029-sheets/imports.md "IMAGE"): empty text with its picture beside it, drawn through
// IF and in its place of a spill, followed through a reference and a lookup, #REF! until access is allowed, NOW and
// RAND refused, and drawn without a fetcher too (the page's copy draws; the value stays empty text).
import { describe, expect, it } from 'vitest';
import { book } from '../../testing/book';
import { IMPORT_WORDS } from '../../imports/import-request';
import { IMAGE_FOLLOW_MAX } from '../../engine/image-of';

const allowed = { imports: { access: 'allowed' as const } };
const A = 'https://example.com/a.png';
const B = 'https://example.com/b.png';
const pic = (url: string, mode = 1) => ({ url, mode, height: null, width: null });

function picAt(b: ReturnType<typeof book>, a1: string) {
  const sheet = b.sheets[0]!;
  return b.wb.imageOf(sheet.id, Number(a1.slice(1)) - 1, a1.charCodeAt(0) - 65);
}

describe('IMAGE in a sheet', () => {
  it('is empty text with its picture beside it', () => {
    const b = book({ A1: `=image("${A}", 2)` }, allowed);
    expect(b.v('A1')).toBe('');
    expect(picAt(b, 'A1')).toEqual(pic(A, 2));
    expect(b.wb.takeImportAsks()).toEqual([]);
  });

  it('draws through IF only where IF takes it, and follows a change', () => {
    const b = book(
      { A1: '1', B1: `=IF(A1>0, IMAGE("${A}"), "")`, B2: `=IF(A1>5, IMAGE("${A}"), "")` },
      allowed,
    );
    expect(picAt(b, 'B1')).toEqual(pic(A));
    expect(picAt(b, 'B2')).toBeNull();
    b.set('A1', '9');
    expect(picAt(b, 'B2')).toEqual(pic(A));
  });

  it('draws each picture in its place of a spill', () => {
    const b = book(
      { A1: A, A2: B, A3: 'ftp://x', C1: '=ARRAYFORMULA(IMAGE(A1:A3))' },
      { ...allowed, arrays: 'google' },
    );
    expect(b.v('C2')).toBe('');
    expect(picAt(b, 'C1')).toEqual(pic(A));
    expect(picAt(b, 'C2')).toEqual(pic(B));
    expect(b.v('C3')).toMatchObject({ e: '#N/A' });
    expect(picAt(b, 'C3')).toBeNull();
  });

  it('shows the picture of the one cell its answer is, or a lookup found', () => {
    const b = book(
      {
        A1: 'cat',
        B1: `=IMAGE("${A}")`,
        A2: 'dog',
        B2: `=IMAGE("${B}")`,
        D1: '=B1',
        D2: '=INDEX(B1:B2, 2)',
        D3: '=VLOOKUP("dog", A1:B2, 2, FALSE)',
        D4: '=HLOOKUP("cat", A1:B2, 1, FALSE)',
        D5: '=XLOOKUP("dog", A1:A2, B1:B2)',
        D6: '=XLOOKUP("cat", A1:B1, A1:B1)',
        D7: '=D3',
        D8: '=""',
        D9: '=B1:B2',
      },
      allowed,
    );
    expect(picAt(b, 'D1')).toEqual(pic(A));
    expect(picAt(b, 'D2')).toEqual(pic(B));
    expect(picAt(b, 'D3')).toEqual(pic(B));
    expect(picAt(b, 'D5')).toEqual(pic(B));
    expect(picAt(b, 'D7')).toEqual(pic(B));
    // A lookup answering a cell that is not a picture's, and a formula drawing nothing.
    expect(b.v('D4')).toBe('cat');
    expect(picAt(b, 'D4')).toBeNull();
    expect(picAt(b, 'D6')).toBeNull();
    expect(picAt(b, 'D8')).toBeNull();
    expect(picAt(b, 'A1')).toBeNull();
    expect(picAt(b, 'E1')).toBeNull();
  });

  it(`follows at most ${IMAGE_FOLLOW_MAX} cells`, () => {
    const cells: Record<string, string> = { A1: `=IMAGE("${A}")` };
    for (let i = 2; i <= IMAGE_FOLLOW_MAX + 2; i++) cells[`A${i}`] = `=A${i - 1}`;
    const b = book(cells, allowed);
    expect(picAt(b, `A${IMAGE_FOLLOW_MAX + 1}`)).toEqual(pic(A));
    expect(picAt(b, `A${IMAGE_FOLLOW_MAX + 2}`)).toBeNull();
  });

  it('is #REF! until access is allowed, then draws; the bar is asked for', () => {
    const b = book({ A1: `=IMAGE("${A}")` }, { imports: { access: 'blocked' as const } });
    expect(b.wb.usesImports()).toBe(true);
    expect(b.v('A1')).toEqual({ e: '#REF!', why: IMPORT_WORDS.blocked });
    expect(picAt(b, 'A1')).toBeNull();
    b.wb.allowImports();
    expect(b.v('A1')).toBe('');
    expect(picAt(b, 'A1')).toEqual(pic(A));
  });

  it('refuses an address reading NOW or RAND (#ERROR!), and a bad mode (#VALUE!)', () => {
    const b = book(
      {
        A1: `=IMAGE("${A}?" & NOW())`,
        A2: '=RAND()',
        A3: `=IMAGE("${A}" & A2)`,
        A4: `=IMAGE("${A}", 7)`,
        A5: `=IMAGE("${A}" & TODAY())`,
      },
      allowed,
    );
    expect(b.v('A1')).toEqual({ e: '#ERROR!', why: IMPORT_WORDS.volatile });
    expect(b.v('A3')).toEqual({ e: '#ERROR!', why: IMPORT_WORDS.volatile });
    expect(b.v('A4')).toMatchObject({ e: '#VALUE!' });
    expect(b.v('A5')).toBe('');
    expect(picAt(b, 'A4')).toBeNull();
  });

  it('is empty text where no editor fetches, and still names its picture', () => {
    const b = book({ A1: `=IMAGE("${A}", 4, 10, 20)` });
    expect(b.v('A1')).toBe('');
    expect(picAt(b, 'A1')).toEqual({ url: A, mode: 4, height: 10, width: 20 });
  });

  it('asks nothing of a workbook without an IMAGE', () => {
    const b = book({ A1: '=""' }, allowed);
    expect(picAt(b, 'A1')).toBeNull();
    expect(b.wb.usesImports()).toBe(false);
  });
});

describe('IMAGE at the edges', () => {
  it('reads an empty argument as left out, and draws nothing in a spill’s place IMAGE did not fill', () => {
    const b = book(
      {
        A1: 'x',
        A2: 'y',
        B1: `=IMAGE("${A}",)`,
        C1: `=ARRAYFORMULA(IF(A1:A2="x", IMAGE("${A}"), ""))`,
      },
      { ...allowed, arrays: 'google' },
    );
    expect(picAt(b, 'B1')).toEqual(pic(A));
    expect(picAt(b, 'C1')).toEqual(pic(A));
    expect(b.v('C2')).toBe('');
    expect(picAt(b, 'C2')).toBeNull();
  });

  it('has none for empty text typed into a cell', () => {
    const b = book({ A1: `=IMAGE("${A}")`, B1: "'" }, allowed);
    expect(b.v('B1')).toBe('');
    expect(picAt(b, 'B1')).toBeNull();
  });
});

describe('IMAGE in This Browser', () => {
  it('is #REF! naming the reason until the spreadsheet is synced, then waits for access', () => {
    const b = book(
      { A1: `=IMAGE("${A}")`, A2: '=IMPORTDATA("https://example.com/a.csv")' },
      { imports: { access: 'offline' } },
    );
    expect(b.v('A1')).toEqual({ e: '#REF!', why: IMPORT_WORDS.offline });
    expect(b.v('A2')).toEqual({ e: '#REF!', why: IMPORT_WORDS.offline });
    expect(b.wb.takeImportAsks()).toEqual([]);
    b.wb.refreshImports();
    expect(b.wb.takeImportAsks()).toEqual([]);
    b.wb.onlineImports(false);
    expect(b.v('A1')).toEqual({ e: '#REF!', why: IMPORT_WORDS.blocked });
    b.wb.onlineImports(true);
    expect(b.v('A1')).toEqual({ e: '#REF!', why: IMPORT_WORDS.blocked });
    b.wb.allowImports();
    expect(b.v('A1')).toBe('');
    expect(b.v('A2')).toMatchObject({ why: 'pending' });
  });

  it('fetches at once when synced already allowed', () => {
    const b = book(
      { A2: '=IMPORTDATA("https://example.com/a.csv")' },
      { imports: { access: 'offline' } },
    );
    b.v('A2');
    b.wb.onlineImports(true);
    expect(b.v('A2')).toMatchObject({ why: 'pending' });
    expect(b.wb.takeImportAsks()).toHaveLength(1);
  });
});
