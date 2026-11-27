// Split Text to Columns against Google's answers (data-tools.md D460, D462;
// plans/assets/0020/research/google-cleanup-probe.out.txt).
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { SHEET_COLS_MAX } from '../limits';
import { applySheetWrite, type SheetWrite } from '../store';
import { splitOrigin, splitPieces, splitTextToColumns, type SplitSeparator } from './split-text';

// A seeded source, so new column ids differ.
const seeded = () => {
  let x = 3;
  return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
};
const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };
const col = (r1: number, r2: number, c = 0) => ({ r1, c1: c, r2, c2: c });

function run(
  b: ReturnType<typeof book>,
  range: ReturnType<typeof col>,
  sep: SplitSeparator,
  origin?: ReturnType<typeof splitOrigin>,
) {
  const done = splitTextToColumns(b.wb, b.sheets[0]!.id, range, sep, seeded(), origin ?? undefined);
  if (!done || 'refused' in done) throw new Error('refused');
  if (done.write) {
    const r = applySheetWrite(b.sheets[0]!, done.write as SheetWrite, ctx);
    b.sheets[0] = r.sheet;
    b.wb.updateSheet(r.sheet, done.write.kind === 'cells' ? r.touched : undefined);
  }
  return done;
}
const rows = (b: ReturnType<typeof book>, n: number, cols: string) =>
  Array.from({ length: n }, (_, r) => [...cols].map((c) => b.v(`${c}${r + 1}`)));

describe('splitPieces', () => {
  it('splits at the separator, keeping a quoted piece whole', () => {
    expect(splitPieces('1,2024-01-05,"x,y"', ',')).toEqual(['1', '2024-01-05', 'x,y']);
    expect(splitPieces('a::b::c', '::')).toEqual(['a', 'b', 'c']);
    expect(splitPieces('"say ""hi""",b', ',')).toEqual(['say "hi"', 'b']);
    expect(splitPieces('a  b c', ' ')).toEqual(['a', '', 'b', 'c']);
    expect(splitPieces('abc', '')).toEqual(['abc']);
  });
});

describe('splitTextToColumns', () => {
  it('splits by comma, types the pieces and clears a shorter row’s block, as Google', () => {
    const b = book({
      A1: 'a,b,c',
      B1: 'right',
      A2: '1,2024-01-05,"x,y"',
      B2: 'right',
      A3: 'one',
      B3: 'right',
    });
    const done = run(b, col(0, 2), { kind: 'comma' });
    expect([done.rows, done.width, done.overwrites]).toEqual([2, 3, true]);
    expect(rows(b, 3, 'ABC')).toEqual([
      ['a', 'b', 'c'],
      [1, 45296, 'x,y'],
      ['one', null, null],
    ]);
  });

  it('detects commas only, taking a space after one with it', () => {
    const b = book({ A1: 'a, b', A2: 'c;d', A3: 'e f' });
    run(b, col(0, 2), { kind: 'detect' });
    expect(rows(b, 3, 'AB')).toEqual([
      ['a', 'b'],
      ['c;d', null],
      ['e f', null],
    ]);
    const c = book({ A1: 'a;b;c', A2: 'd;e' });
    expect(run(c, col(0, 1), { kind: 'detect' })).toEqual({
      write: null,
      rows: 0,
      width: 1,
      overwrites: false,
    });
  });

  it('splits at each space, at a period and at a custom separator', () => {
    const b = book({ A1: 'a  b c', A2: "' lead" });
    run(b, col(0, 1), { kind: 'space' });
    expect(rows(b, 2, 'ABCD')).toEqual([
      ['a', null, 'b', 'c'],
      [null, 'lead', null, null],
    ]);
    const p = book({ A1: "'1.5.x", A2: 'a.b' });
    run(p, col(0, 1), { kind: 'period' });
    expect(rows(p, 2, 'ABC')).toEqual([
      [1, 5, 'x'],
      ['a', 'b', null],
    ]);
    const x = book({ A1: 'a::b::c' });
    run(x, col(0, 0), { kind: 'custom', text: '::' });
    expect(rows(x, 1, 'ABC')).toEqual([['a', 'b', 'c']]);
  });

  it('splits a formula by its value and leaves a number', () => {
    const b = book({ A1: '=CONCAT("p",",q")', A2: '12' });
    const done = run(b, col(0, 1), { kind: 'comma' });
    expect(done.overwrites).toBe(false);
    expect(rows(b, 2, 'AB')).toEqual([
      ['p', 'q'],
      [12, null],
    ]);
  });

  it('refuses more than one column, in Google’s words’ reason', () => {
    const b = book({ A1: 'a,b', B1: 'c,d' });
    expect(
      splitTextToColumns(b.wb, b.sheets[0]!.id, { r1: 0, c1: 0, r2: 0, c2: 1 }, { kind: 'comma' }),
    ).toEqual({
      refused: 'columns',
    });
    expect(splitTextToColumns(b.wb, 'nope', col(0, 0), { kind: 'comma' })).toBeNull();
  });

  it('adds columns past the sheet’s last, and refuses past its limits', () => {
    const b = book({ L1: 'a,b,c' }, { cols: 12 });
    const done = run(b, col(0, 0, 11), { kind: 'comma' });
    expect(done.write?.kind).toBe('layout');
    expect(b.sheets[0]!.layout.cols).toHaveLength(14);
    const full = book({ A1: 'x' }, { cols: SHEET_COLS_MAX });
    const last = SHEET_COLS_MAX - 1;
    const sheet = full.sheets[0]!;
    sheet.cells.set(`${sheet.layout.rows[0]}:${sheet.layout.cols[last]}`, { input: { s: 'a,b' } });
    full.wb.updateSheet(sheet);
    expect(
      splitTextToColumns(full.wb, sheet.id, col(0, 0, last), { kind: 'comma' }, seeded()),
    ).toEqual({
      refused: 'full',
    });
  });

  it('splits the original text again from its origin, putting back rows left whole and clearing the old block', () => {
    const b = book({ A1: 'a,b;c', A2: 'x,y,z', A3: 'p;q' });
    const range = col(0, 2);
    const origin = splitOrigin(b.wb, b.sheets[0]!.id, range)!;
    const first = run(b, range, { kind: 'comma' });
    expect(rows(b, 3, 'ABC')).toEqual([
      ['a', 'b;c', null],
      ['x', 'y', 'z'],
      ['p;q', null, null],
    ]);
    run(b, range, { kind: 'semicolon' }, { ...origin, width: first.width });
    expect(rows(b, 3, 'ABC')).toEqual([
      ['a,b', 'c', null],
      ['x,y,z', null, null],
      ['p', 'q', null],
    ]);
    expect(splitOrigin(b.wb, 'nope', range)).toBeNull();
  });
});
