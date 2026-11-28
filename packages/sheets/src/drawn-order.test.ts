import { describe, expect, it } from 'vitest';
import { makeSheets } from './testing/book';
import { Workbook } from './engine/workbook';
import { fillFromEdge, fillRange, mergeRange } from './commands';
import { pasteClip, pasteExternal } from './commands-paste';
import { clipFromRows } from './clipboard';
import { applySheetWrite, type SheetWrite } from './store';
import { DrawnOrder, viewDrawnOrder, viewSortFor, viewSortRefusal } from './drawn-order';
import { MERGE_SORT_REFUSAL } from './merge-guards';
import { idRangeOf } from './layout';
import type { SheetFilterView } from './filter-views';
import type { Sheet } from './sheet';

// docs/specs/029-sheets/data-tools.md "The drawn order" (D491-D495): a view's sort draws rows in an order of its
// own through one mapping between stored and drawn rows; cells never move.
const ctx = { now: 1, by: { id: 'p', name: 'P', color: '#000000' } };
const apply = (s: Sheet, w: SheetWrite) => applySheetWrite(s, w, ctx).sheet;
const wbOf = (s: Sheet) => new Workbook({ sheets: [s], locale: 'en-GB' });
const list = (a: Int32Array) => [...a];

function sheet(): Sheet {
  return makeSheets(
    {
      'Sheet 1': {
        A1: 'Name',
        B1: 'Score',
        A2: 'Cy',
        B2: '3',
        A3: 'Al',
        B3: '',
        A4: 'Bo',
        B4: '1',
        A5: 'Di',
        B5: '3',
      },
    },
    { rows: 7, cols: 3 },
  )[0]!;
}

function viewOf(s: Sheet, r2 = 4, sort?: SheetFilterView['sort']): SheetFilterView {
  return {
    id: 'v1',
    title: 'Filter 1',
    conds: {},
    ...idRangeOf(s.layout, 0, 0, r2, 1)!,
    ...(sort ? { sort } : {}),
  };
}

describe('DrawnOrder', () => {
  it('keeps rows before and after the sorted run in place', () => {
    const o = DrawnOrder.ofSort(6, 1, [3, 1, 2]);
    expect(list(o.storedAt)).toEqual([0, 3, 1, 2, 4, 5]);
    expect(list(o.drawnOf)).toEqual([0, 2, 3, 1, 4, 5]);
  });

  it('cuts drawn rows into runs side by side in the sheet as well', () => {
    const o = DrawnOrder.ofSort(6, 1, [3, 1, 2]);
    expect(DrawnOrder.runs(o, 1, 3)).toEqual([
      { r1: 3, r2: 3 },
      { r1: 1, r2: 2 },
    ]);
    expect(DrawnOrder.runs(o, 3, 1)).toEqual(DrawnOrder.runs(o, 1, 3));
    expect(DrawnOrder.runs(o, 3, 5)).toEqual([
      { r1: 2, r2: 2 },
      { r1: 4, r2: 5 },
    ]);
  });

  it('cuts a stored range into pieces drawn side by side', () => {
    const o = DrawnOrder.ofSort(6, 1, [3, 1, 2]);
    expect(DrawnOrder.pieces(o, 0, 3)).toEqual([
      { r1: 0, r2: 0 },
      { r1: 1, r2: 2 },
      { r1: 3, r2: 3 },
    ]);
    expect(DrawnOrder.pieces(o, 4, 5)).toEqual([{ r1: 4, r2: 5 }]);
  });

  it('steps by drawn rows, staying put at the ends', () => {
    const o = DrawnOrder.ofSort(6, 1, [3, 1, 2]);
    expect(DrawnOrder.step(o, 0, 1)).toBe(3);
    expect(DrawnOrder.step(o, 3, 1)).toBe(1);
    expect(DrawnOrder.step(o, 1, -1)).toBe(3);
    expect(DrawnOrder.step(o, 5, 1)).toBe(5);
  });
});

describe('viewDrawnOrder', () => {
  it('draws nothing of its own without a sort', () => {
    const s = sheet();
    expect(viewDrawnOrder(wbOf(s), s.id, viewOf(s))).toBeNull();
    expect(viewDrawnOrder(wbOf(s), s.id, null)).toBeNull();
  });

  it('orders the rows under the header by its key, blanks last, ties in the sheet order', () => {
    const s = sheet();
    const o = viewDrawnOrder(wbOf(s), s.id, viewOf(s, 4, [{ c: s.layout.cols[1]! }]))!;
    expect(list(o.storedAt)).toEqual([0, 3, 1, 4, 2, 5, 6]);
    const z = viewDrawnOrder(wbOf(s), s.id, viewOf(s, 4, [{ c: s.layout.cols[1]!, desc: true }]))!;
    expect(list(z.storedAt)).toEqual([0, 1, 4, 3, 2, 5, 6]);
  });

  it('leaves frozen rows in place', () => {
    const s = apply(sheet(), { kind: 'layout', changes: [{ k: 'freeze', rows: 2 }] });
    const o = viewDrawnOrder(wbOf(s), s.id, viewOf(s, 4, [{ c: s.layout.cols[0]! }]))!;
    // Rows 3 to 5 (Al, Bo, Di) are already in order: the view draws the sheet's.
    expect(list(o.storedAt)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('draws the sheet order over a merge across its rows or a column gone', () => {
    const s = sheet();
    const merged = apply(s, mergeRange(s, { r1: 2, c1: 2, r2: 3, c2: 2 }, 'all')!.write);
    expect(viewDrawnOrder(wbOf(merged), s.id, viewOf(s, 4, [{ c: s.layout.cols[1]! }]))).toBeNull();
    expect(viewSortRefusal(merged.layout, viewOf(s))).toBe(MERGE_SORT_REFUSAL);
    expect(viewSortRefusal(s.layout, viewOf(s))).toBeNull();
    expect(viewDrawnOrder(wbOf(s), s.id, viewOf(s, 4, [{ c: 'gone' }]))).toBeNull();
  });

  it('makes the column the one key of the view', () => {
    const s = sheet();
    const v = viewOf(s, 4, [{ c: s.layout.cols[0]! }]);
    expect(viewSortFor(v, s.layout.cols[1]!, false).sort).toEqual([
      { c: s.layout.cols[1]!, desc: true },
    ]);
    expect(viewSortFor(v, s.layout.cols[1]!, true).sort).toEqual([{ c: s.layout.cols[1]! }]);
  });
});

// Copying, pasting and filling in a drawn order land on the stored rows drawn there (D494): rows 1..3 drawn 3, 1, 2.
describe('editing in a drawn order', () => {
  const order = DrawnOrder.ofSort(6, 1, [3, 1, 2]);
  function book(): Sheet {
    return makeSheets(
      { 'Sheet 1': { A1: 'h', A2: '2', A3: '3', A4: '1', B4: '=A4*10', C1: 'x' } },
      { rows: 6, cols: 3 },
    )[0]!;
  }
  const read = (s: Sheet, w: SheetWrite | null, cells: string[]) => {
    const after = wbOf(apply(s, w!));
    return cells.map((a1) => {
      const r = Number(a1.slice(1)) - 1;
      const c = a1.charCodeAt(0) - 65;
      return after.value(s.id, r, c);
    });
  };

  it('copies rows in the order drawn, each keeping where it came from', () => {
    const s = book();
    const clip = clipFromRows(wbOf(s), s.id, [3, 1], { c1: 0, c2: 1 })!;
    expect(clip.values).toEqual([
      ['1', '10'],
      ['2', ''],
    ]);
    expect(clip.fromRows).toEqual([3, 1]);
    expect(clip.rules).toBeUndefined();
  });

  it('pastes each row on the stored row drawn there, a formula shifted from its own row', () => {
    const s = book();
    const clip = clipFromRows(wbOf(s), s.id, [3], { c1: 1, c2: 1 })!;
    // Drawn row 2 is stored row 1 (A2): the formula reads A2, two rows up from where it came from.
    const pasted = pasteClip(
      wbOf(s),
      s.id,
      { r1: 2, c1: 1, r2: 2, c2: 1 },
      clip,
      'all',
      Math.random,
      order,
    )!;
    expect(read(s, pasted.edits[0]!.write, ['B2'])).toEqual([20]);
  });

  it('pastes text from elsewhere down the rows drawn', () => {
    const s = book();
    const pasted = pasteExternal(
      wbOf(s),
      s.id,
      { r1: 1, c1: 2, r2: 1, c2: 2 },
      [['a'], ['b']],
      'all',
      {
        drawn: order,
      },
    )!;
    // Drawn rows 1 and 2 are stored rows 3 and 1: C4 and C2.
    expect(read(s, pasted.edits[0]!.write, ['C4', 'C2'])).toEqual(['a', 'b']);
  });

  it('fills a series down the rows drawn', () => {
    const s = book();
    // Drawn rows 1..2 (A4 = 1, A2 = 2) fill on to drawn rows 3..4 (A3, A5): 3 and 4.
    const w = fillRange(
      wbOf(s),
      s.id,
      { r1: 1, c1: 0, r2: 2, c2: 0 },
      { r1: 1, c1: 0, r2: 4, c2: 0 },
      false,
      false,
      order,
    );
    expect(read(s, w, ['A4', 'A2', 'A3', 'A5'])).toEqual([1, 2, 3, 4]);
  });

  it('copies the first drawn row down with Ctrl + D, formulas shifted in the sheet', () => {
    const s = book();
    const w = fillFromEdge(wbOf(s), s.id, { r1: 1, c1: 1, r2: 2, c2: 1 }, 'down', order);
    // B4's =A4*10 lands on B2 (drawn next) as =A2*10.
    expect(read(s, w, ['B2'])).toEqual([20]);
  });
});
