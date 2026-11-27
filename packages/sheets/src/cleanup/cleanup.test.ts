// Remove Duplicates, Trim Whitespace and Randomise Range against Google's answers (data-tools.md D460;
// plans/assets/0020/research/google-cleanup-probe.out.txt).
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { applySheetWrite, type SheetWrite } from '../store';
import { cellKey } from '../sheet';
import { MERGE_SORT_REFUSAL } from '../merge-guards';
import { removeDuplicates, duplicateKey } from './remove-duplicates';
import { trimmedText, trimWhitespace } from './trim-whitespace';
import { randomiseRange, shuffledOrder } from './randomise-range';
import { renderFormula } from '../formula/stored';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };
const box = (r1: number, c1: number, r2: number, c2: number) => ({ r1, c1, r2, c2 });

function apply(b: ReturnType<typeof book>, w: SheetWrite | null) {
  if (!w) throw new Error('no write');
  const r = applySheetWrite(b.sheets[0]!, w, ctx);
  b.sheets[0] = r.sheet;
  b.wb.updateSheet(r.sheet, w.kind === 'cells' ? r.touched : undefined);
}
const rows = (b: ReturnType<typeof book>, n: number, cols: string) =>
  Array.from({ length: n }, (_, r) => [...cols].map((c) => b.v(`${c}${r + 1}`)));
const edit = (b: ReturnType<typeof book>, a1: string) => {
  const s = b.sheets[0]!;
  const input = s.cells.get(
    cellKey(s.layout.rows[Number(a1.slice(1)) - 1]!, s.layout.cols[a1.charCodeAt(0) - 65]!),
  )?.input;
  return input && 'f' in input ? renderFormula(input.f, b.wb.ctxFor(s.id)) : input;
};

describe('removeDuplicates', () => {
  const dupes = () =>
    book({
      A1: 'a',
      B1: '1',
      A2: 'A',
      B2: '1',
      A3: 'a ',
      B3: '1',
      A4: 'a',
      B4: '1',
      A5: 'a',
      B5: '=0+1',
      A8: 'a',
      B8: '1',
      A9: 'b',
      B9: '2',
      C1: 'beside',
    });

  it('compares case aside, numbers by value, spaces counting, blank rows as rows, as Google', () => {
    const b = dupes();
    const done = removeDuplicates(b.wb, b.sheets[0]!.id, box(0, 0, 8, 1), [0, 1], false);
    if (!done || 'refused' in done) throw new Error('refused');
    expect([done.compared, done.removed, done.kept]).toEqual([9, 5, 4]);
    apply(b, done.write);
    expect(rows(b, 9, 'AB')).toEqual([
      ['a', 1],
      ['a ', 1],
      [null, null],
      ['b', 2],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
    ]);
    expect(b.v('C1')).toBe('beside');
  });

  it('compares only the chosen columns and keeps a header row in place', () => {
    const b = book({ A1: 'Name', B1: 'n', A2: 'x', B2: '1', A3: 'x', B3: '2', A4: 'y', B4: '3' });
    const done = removeDuplicates(b.wb, b.sheets[0]!.id, box(0, 0, 3, 1), [0], true);
    if (!done || 'refused' in done) throw new Error('refused');
    expect([done.compared, done.removed]).toEqual([3, 1]);
    apply(b, done.write);
    expect(rows(b, 4, 'AB')).toEqual([
      ['Name', 'n'],
      ['x', 1],
      ['y', 3],
      [null, null],
    ]);
  });

  it('shifts a moved formula with its row', () => {
    const b = book({ A1: '1', A2: '1', A3: '2', B3: '=A3*2' });
    const done = removeDuplicates(b.wb, b.sheets[0]!.id, box(0, 0, 2, 1), [0], false);
    if (!done || 'refused' in done) throw new Error('refused');
    apply(b, done.write);
    expect(edit(b, 'B2')).toBe('=A2*2');
    expect(b.v('B2')).toBe(4);
  });

  it('writes nothing with no duplicates, no columns or no sheet', () => {
    const b = book({ A1: 'a', A2: 'b' });
    const id = b.sheets[0]!.id;
    expect(removeDuplicates(b.wb, id, box(0, 0, 1, 0), [0], false)).toEqual({
      write: null,
      compared: 2,
      removed: 0,
      kept: 2,
    });
    expect(removeDuplicates(b.wb, id, box(0, 0, 1, 0), [], false)).toBeNull();
    expect(removeDuplicates(b.wb, 'nope', box(0, 0, 1, 0), [0], false)).toBeNull();
  });

  it('refuses across a merge spanning its rows', () => {
    const b = book({ A1: 'a', A2: 'a' });
    const s = b.sheets[0]!;
    s.layout.merges = [
      {
        r1: s.layout.rows[0]!,
        c1: s.layout.cols[0]!,
        r2: s.layout.rows[1]!,
        c2: s.layout.cols[0]!,
      },
    ];
    expect(removeDuplicates(b.wb, s.id, box(0, 0, 1, 0), [0], false)).toEqual({
      refused: MERGE_SORT_REFUSAL,
    });
  });

  it('keys booleans, errors and empties apart', () => {
    expect(duplicateKey(true)).toBe('btrue');
    expect(duplicateKey({ e: '#N/A' } as never)).toBe('x#N/A');
    expect(duplicateKey('')).toBe(duplicateKey(null));
  });
});

describe('trimWhitespace', () => {
  it('trims as Google: ends, inner runs, em spaces; keeps no-break spaces, tabs, line breaks, formulas', () => {
    expect(trimmedText('  a  b  ')).toBe('a b');
    expect(trimmedText('\u00a0x\u00a0')).toBe('\u00a0x\u00a0');
    expect(trimmedText('tab\there')).toBe('tab\there');
    expect(trimmedText('line\nbreak ')).toBe('line\nbreak');
    expect(trimmedText('\u2003em\u2003')).toBe('em');
  });

  it('counts the cells it changes, leaves formulas and keeps text text', () => {
    const b = book({
      A1: '  a  b  ',
      A2: '\u00a0x\u00a0',
      A3: '=" y "',
      A4: "' 7 ",
      A5: 'tab\there',
      A6: 'line\nbreak ',
      A7: '\u2003em\u2003',
      A8: '12',
    });
    const done = trimWhitespace(b.wb, b.sheets[0]!.id, box(0, 0, 7, 0));
    expect(done.trimmed).toBe(4);
    apply(b, done.write);
    expect(rows(b, 8, 'A').flat()).toEqual([
      'a b',
      '\u00a0x\u00a0',
      ' y ',
      '7',
      'tab\there',
      'line\nbreak',
      'em',
      12,
    ]);
    expect(edit(b, 'A4')).toMatchObject({ s: '7' });
  });

  it('clears a cell of spaces only, and writes nothing when nothing changes', () => {
    const b = book({ A1: "'   ", A2: 'ok' });
    const done = trimWhitespace(b.wb, b.sheets[0]!.id, box(0, 0, 1, 0));
    expect(done.trimmed).toBe(1);
    apply(b, done.write);
    expect(b.v('A1')).toBeNull();
    expect(trimWhitespace(b.wb, b.sheets[0]!.id, box(0, 0, 1, 0))).toEqual({
      write: null,
      trimmed: 0,
    });
    expect(trimWhitespace(b.wb, 'nope', box(0, 0, 1, 0))).toEqual({ write: null, trimmed: 0 });
  });
});

describe('randomiseRange', () => {
  it('shuffles every offset once (Fisher-Yates)', () => {
    expect(shuffledOrder(4, () => 0)).toEqual([1, 2, 3, 0]);
    expect(shuffledOrder(4, () => 0.999).sort()).toEqual([0, 1, 2, 3]);
  });

  it("moves rows whole inside the range only, as Google's", () => {
    const b = book({
      A1: '1',
      B1: 'a',
      A2: '2',
      B2: 'b',
      A3: '3',
      B3: 'c',
      C1: 'stay',
      A4: 'below',
    });
    apply(b, randomiseRange(b.wb, b.sheets[0]!.id, box(0, 0, 2, 1), () => 0) as SheetWrite);
    expect(rows(b, 4, 'ABC')).toEqual([
      [2, 'b', 'stay'],
      [3, 'c', null],
      [1, 'a', null],
      ['below', null, null],
    ]);
  });

  it('shuffles one column alone', () => {
    const b = book({ A1: '1', B1: 'a', A2: '2', B2: 'b' });
    apply(b, randomiseRange(b.wb, b.sheets[0]!.id, box(0, 0, 1, 0), () => 0) as SheetWrite);
    expect(rows(b, 2, 'AB')).toEqual([
      [2, 'a'],
      [1, 'b'],
    ]);
  });

  it('changes nothing under two rows, refuses across a merge', () => {
    const b = book({ A1: '1', A2: '2' });
    const s = b.sheets[0]!;
    expect(randomiseRange(b.wb, s.id, box(0, 0, 0, 1), () => 0)).toBeNull();
    s.layout.merges = [
      {
        r1: s.layout.rows[0]!,
        c1: s.layout.cols[0]!,
        r2: s.layout.rows[1]!,
        c2: s.layout.cols[0]!,
      },
    ];
    expect(randomiseRange(b.wb, s.id, box(0, 0, 1, 0), () => 0)).toEqual({
      refused: MERGE_SORT_REFUSAL,
    });
  });
});
