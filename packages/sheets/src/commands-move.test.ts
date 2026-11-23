// Moving cells by their border (docs/specs/029-sheets/grid-and-editing.md "Fill and move"; D145, D146).
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { applySheetWrite, type SheetWrite } from './store';
import { idRangeOf } from './layout';
import { landingOf, moveCells } from './commands-move';
import { MERGE_CELLS_MOVE_REFUSAL } from './merge-guards';
import type { GridRange } from './address';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };
type Book = ReturnType<typeof book>;
function apply(b: Book, sheetId: string, w: SheetWrite) {
  const i = b.sheets.findIndex((s) => s.id === sheetId);
  const r = applySheetWrite(b.sheets[i]!, w, ctx);
  b.sheets[i] = r.sheet;
  b.wb.updateSheet(r.sheet, w.kind === 'cells' ? r.touched : undefined);
}
const box = (r1: number, c1: number, r2 = r1, c2 = c1): GridRange => ({ r1, c1, r2, c2 });
const run = (b: Book, source: GridRange, at: { r: number; c: number }, copy = false) => {
  const res = moveCells(b.wb, b.sheets[0]!.id, source, at, copy);
  if (res && !('refused' in res)) for (const e of res.edits) apply(b, e.sheetId, e.write);
  return res;
};
const merge = (b: Book, g: GridRange) => {
  const s = b.sheets[0]!;
  apply(b, s.id, {
    kind: 'layout',
    changes: [
      {
        k: 'merges',
        merges: [...(s.layout.merges ?? []), idRangeOf(s.layout, g.r1, g.c1, g.r2, g.c2)!],
      },
    ],
  });
};
const merges = (b: Book) => {
  const s = b.sheets[0]!;
  const pos = (id: string, ids: string[]) => ids.indexOf(id);
  return (s.layout.merges ?? []).map((m) => [
    pos(m.r1, s.layout.rows),
    pos(m.c1, s.layout.cols),
    pos(m.r2, s.layout.rows),
    pos(m.c2, s.layout.cols),
  ]);
};

describe('landingOf', () => {
  it('puts the block at the drop, kept inside the grid', () => {
    expect(landingOf(box(0, 0, 1, 1), { r: 5, c: 3 }, 30, 12)).toEqual(box(5, 3, 6, 4));
    expect(landingOf(box(0, 0, 1, 1), { r: 29, c: 11 }, 30, 12)).toEqual(box(28, 10, 29, 11));
    expect(landingOf(box(0, 0, 1, 1), { r: -3, c: -1 }, 30, 12)).toEqual(box(0, 0, 1, 1));
  });
});

describe('moving cells', () => {
  it('moves the cells, clears their old place, and formulas reading them follow', () => {
    const b = book({ A1: '1', A2: '2', B1: '=SUM(A1:A2)', C1: '=A2' });
    const res = run(b, box(0, 0, 1, 0), { r: 4, c: 3 });
    expect(res && !('refused' in res) && res.range).toEqual(box(4, 3, 5, 3));
    expect([b.v('A1'), b.v('A2'), b.v('D5'), b.v('D6')]).toEqual([null, null, 1, 2]);
    expect([b.v('B1'), b.v('C1')]).toEqual([3, 2]);
  });

  it('copies with copy set: the source stays and formulas shift as a paste shifts them', () => {
    const b = book({ A1: '1', B1: '=A1*2' });
    run(b, box(0, 0, 0, 1), { r: 2, c: 0 }, true);
    expect([b.v('A1'), b.v('B1'), b.v('A3'), b.v('B3')]).toEqual([1, 2, 1, 2]);
    b.set('A3', '5');
    expect(b.v('B3')).toBe(10);
  });

  it('replaces what it lands on, overlapping its own old place too', () => {
    const b = book({ A1: 'a', A2: 'b', A3: 'c' });
    run(b, box(0, 0, 1, 0), { r: 1, c: 0 });
    expect([b.v('A1'), b.v('A2'), b.v('A3')]).toEqual([null, 'a', 'b']);
  });

  it('keeps the block inside the grid, and does nothing dropped where it was', () => {
    const b = book({ A1: 'x' }, { rows: 5, cols: 3 });
    const res = run(b, box(0, 0), { r: 9, c: 9 });
    expect(res && !('refused' in res) && res.range).toEqual(box(4, 2));
    expect(b.v('C5')).toBe('x');
    expect(run(b, box(4, 2), { r: 4, c: 2 })).toBeNull();
    expect(run(b, box(4, 2), { r: 4, c: 2 }, true)).toBeNull();
    expect(moveCells(b.wb, 'nope', box(0, 0), { r: 1, c: 1 }, false)).toBeNull();
  });
});

describe('merges in a moved block', () => {
  it('a merge wholly inside moves with the block', () => {
    const b = book({ A1: 'm' });
    merge(b, box(0, 0, 0, 1));
    run(b, box(0, 0, 1, 1), { r: 3, c: 2 });
    expect(merges(b)).toEqual([[3, 2, 3, 3]]);
    expect(b.v('C4')).toBe('m');
  });

  it('a copy leaves the merge and adds one where the block lands', () => {
    const b = book({ A1: 'm' });
    merge(b, box(0, 0, 0, 1));
    run(b, box(0, 0, 0, 1), { r: 2, c: 0 }, true);
    expect(merges(b)).toEqual([
      [0, 0, 0, 1],
      [2, 0, 2, 1],
    ]);
  });

  it('a merge wholly under the landing goes', () => {
    const b = book({ A1: 'a', D4: 'under' });
    merge(b, box(3, 3, 3, 4));
    run(b, box(0, 0, 1, 1), { r: 3, c: 3 });
    expect(merges(b)).toEqual([]);
    expect(b.v('D4')).toBe('a');
  });

  it('refuses a move that would split a merge, at the source or the landing', () => {
    const b = book({ A1: 'a' });
    merge(b, box(0, 0, 0, 1));
    merge(b, box(5, 5, 6, 5));
    expect(run(b, box(0, 0), { r: 3, c: 3 })).toEqual({ refused: MERGE_CELLS_MOVE_REFUSAL });
    expect(run(b, box(2, 2, 2, 3), { r: 6, c: 4 })).toEqual({ refused: MERGE_CELLS_MOVE_REFUSAL });
    // A copy's source merge stays where it is, so a landing across it refuses too.
    expect(run(b, box(0, 0, 0, 1), { r: 0, c: 1 }, true)).toEqual({
      refused: MERGE_CELLS_MOVE_REFUSAL,
    });
  });

  it('a moved merge may land across its own old place', () => {
    const b = book({ A1: 'a' });
    merge(b, box(0, 0, 0, 1));
    run(b, box(0, 0, 0, 1), { r: 0, c: 1 });
    expect(merges(b)).toEqual([[0, 1, 0, 2]]);
    expect([b.v('A1'), b.v('B1')]).toEqual([null, 'a']);
  });

  it('keeps a merge whose lines are gone, and other sheets still follow', () => {
    const b = book({ 'Sheet 1': { A1: 'a' }, Other: { A1: "='Sheet 1'!A1" } });
    merge(b, box(0, 0, 0, 1));
    const s = b.sheets[0]!;
    const stale = { r1: 'gone', c1: 'gone', r2: 'gone', c2: 'gone' };
    const held = { ...s, layout: { ...s.layout, merges: [stale, ...s.layout.merges!] } };
    b.wb.updateSheet(held);
    const res = moveCells(b.wb, s.id, box(0, 0, 0, 1), { r: 2, c: 0 }, false);
    const own = res && !('refused' in res) ? res.edits.find((e) => e.sheetId === s.id) : null;
    const write = own?.write.kind === 'layout' ? own.write.changes[0] : null;
    expect(write).toEqual({
      k: 'merges',
      merges: [stale, { r1: 's0r2', c1: 's0c0', r2: 's0r2', c2: 's0c1' }],
    });
    expect(res && !('refused' in res) && res.edits.length).toBe(2);
  });
});
