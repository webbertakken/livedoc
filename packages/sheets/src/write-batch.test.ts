import { describe, expect, it } from 'vitest';
import { emptyLayout } from './sheet';
import { SHEET_WRITE_CELLS_MAX } from './limits';
import { sheetFromJson, sheetToJson } from './sheet-json';
import { applySheetWrite } from './store';
import type { CellChange, SheetWrite } from './store';
import { coalesceWrites } from './write-batch';

// docs/specs/029-sheets/sheet-store.md "Changing a sheet" (write batching): a sheet's cell writes queued together are
// sent as one, each cell ending as the writes in turn would leave it.

const cells = (...changes: CellChange[]): SheetWrite => ({ kind: 'cells', cells: changes });

describe('coalesceWrites', () => {
  it('merges consecutive cell writes into one', () => {
    expect(
      coalesceWrites([
        cells({ r: 'r1', c: 'c1', i: { n: 1 } }),
        cells({ r: 'r2', c: 'c1', i: { n: 2 } }),
      ]),
    ).toEqual([cells({ r: 'r1', c: 'c1', i: { n: 1 } }, { r: 'r2', c: 'c1', i: { n: 2 } })]);
  });

  it('keeps a lone write as it is', () => {
    const one = cells({ r: 'r1', c: 'c1', i: { n: 1 } });
    expect(coalesceWrites([one])).toEqual([one]);
    expect(coalesceWrites([])).toEqual([]);
  });

  it("lets a later change to a cell take its input and lay its format keys over the earlier's", () => {
    expect(
      coalesceWrites([
        cells({ r: 'r1', c: 'c1', i: { n: 1 }, f: { b: true, fc: '#ff0000' } }),
        cells({ r: 'r1', c: 'c1', f: { fc: null, i: true } }),
        cells({ r: 'r1', c: 'c1', i: null }),
      ]),
    ).toEqual([cells({ r: 'r1', c: 'c1', i: null, f: { b: true, fc: null, i: true } })]);
  });

  it('lets a whole-format clear take every earlier format key', () => {
    expect(
      coalesceWrites([
        cells({ r: 'r1', c: 'c1', f: { b: true } }),
        cells({ r: 'r1', c: 'c1', f: null }),
      ]),
    ).toEqual([cells({ r: 'r1', c: 'c1', f: null })]);
  });

  it('starts a new write for format keys after a whole-format clear of the same cell', () => {
    const clear = cells({ r: 'r1', c: 'c1', f: null });
    const bold = cells({ r: 'r1', c: 'c1', f: { b: true } });
    expect(coalesceWrites([clear, bold])).toEqual([clear, bold]);
  });

  it('starts a new write when both set the same key to an object (the room merges those deep)', () => {
    const a = cells({ r: 'r1', c: 'c1', f: { bt: { w: 1, s: 'solid', c: '#000000' } } });
    const b = cells({ r: 'r1', c: 'c1', f: { bt: { w: 2, s: 'solid', c: '#000000' } } });
    expect(coalesceWrites([a, b])).toEqual([a, b]);
  });

  it('never merges across a layout or title write, keeping the order', () => {
    const a = cells({ r: 'r1', c: 'c1', i: { n: 1 } });
    const layout: SheetWrite = { kind: 'layout', changes: [{ k: 'deleteRows', ids: ['r9'] }] };
    const title: SheetWrite = { kind: 'title', title: 'Two' };
    const b = cells({ r: 'r2', c: 'c1', i: { n: 2 } });
    const c = cells({ r: 'r3', c: 'c1', i: { n: 3 } });
    expect(coalesceWrites([a, layout, title, b, c])).toEqual([
      a,
      layout,
      title,
      cells({ r: 'r2', c: 'c1', i: { n: 2 } }, { r: 'r3', c: 'c1', i: { n: 3 } }),
    ]);
  });

  it('starts a new write past the cells a write may carry', () => {
    const big = cells(
      ...Array.from({ length: SHEET_WRITE_CELLS_MAX }, (_, n) => ({
        r: `r${n}`,
        c: 'c1',
        i: { n },
      })),
    );
    const more = cells({ r: 'rx', c: 'c1', i: { n: 1 } });
    expect(coalesceWrites([big, more])).toEqual([big, more]);
  });

  it('starts a new write past the bytes a write may carry', () => {
    const long = (r: string) => cells({ r, c: 'c1', i: { s: 'x'.repeat(600_000) } });
    expect(coalesceWrites([long('r1'), long('r2')])).toHaveLength(2);
  });

  it('sends a write that cannot be one write by itself as it was', () => {
    const odd = cells({ r: 'r1', c: 'c1', f: null }, { r: 'r1', c: 'c1', f: { b: true } });
    const a = cells({ r: 'r2', c: 'c1', i: { n: 1 } });
    expect(coalesceWrites([a, odd, a])).toEqual([a, odd, a]);
  });

  it('leaves a sheet as the writes one by one would', () => {
    let seed = 7;
    const layout = emptyLayout(() => (seed = (seed * 16807) % 2147483647) / 2147483647, 3, 2);
    const [r1, r2] = layout.rows as [string, string];
    const [c1, c2] = layout.cols as [string, string];
    const sheet = sheetFromJson({
      id: 'sheetA00',
      tabId: 't1',
      title: 'A',
      layout,
      cells: [{ r: r1, c: c1, i: { n: 5 }, f: { b: true, nf: 'percent' } }],
      rev: 0,
      createdAt: 0,
      updatedAt: 0,
      updatedBy: { id: '', name: '', color: '#000000' },
    });
    const writes = [
      cells({ r: r1, c: c1, f: { b: null, i: true } }, { r: r2, c: c2, i: { s: 'x' } }),
      cells({ r: r1, c: c1, i: { n: 6 }, f: { u: true } }),
      cells({ r: r2, c: c2, i: null }, { r: r2, c: c1, f: { fc: '#ff0000' } }),
      cells({ r: r2, c: c1, f: null }),
    ];
    const ctx = { now: 1, by: sheet.updatedBy };
    const apply = (ws: SheetWrite[]) =>
      sheetToJson(ws.reduce((at, w) => applySheetWrite(at, w, ctx).sheet, sheet)).cells;
    const merged = coalesceWrites(writes);
    expect(merged).toHaveLength(1);
    expect(apply(merged)).toEqual(apply(writes));
  });

  it('leaves the writes it was given untouched', () => {
    const a = cells({ r: 'r1', c: 'c1', f: { b: true } });
    const b = cells({ r: 'r1', c: 'c1', f: { i: true } });
    coalesceWrites([a, b]);
    expect(a).toEqual(cells({ r: 'r1', c: 'c1', f: { b: true } }));
  });
});
