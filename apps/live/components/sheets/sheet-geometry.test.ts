// Where rows and columns sit on screen: offsets with hidden and filtered
// lines, the frozen panes, merges, the window in view, the cell under a point, the scroll that reveals a cell and
// how many rows a page is.
import { describe, expect, it } from 'vitest';
import type { SheetLayout } from '@livedoc/sheets';
import {
  COL_HEADER_PX,
  OUTLINE_DEPTH_PX,
  ROW_HEADER_PX,
  cellBox,
  geometryOf,
  hitTest,
  mergeAt,
  pageCols,
  pageRows,
  scrollToReveal,
  totalSize,
  visibleWindow,
  rowTop,
  rowEnd,
  drawnPieces,
  inWindow,
  GROUP_HEADER_PX,
} from './sheet-geometry';
import { DrawnOrder } from '@livedoc/sheets';

// A layout of `rows` x `cols` with ids r0.., c0.. (rows 24px and columns 100px unless sized).
function grid(rows: number, cols: number, extra: Partial<SheetLayout> = {}): SheetLayout {
  return {
    rows: Array.from({ length: rows }, (_, i) => `r${i}`),
    cols: Array.from({ length: cols }, (_, i) => `c${i}`),
    ...extra,
    // Fixed sizes (100 x 24), so the arithmetic below tests the geometry, not the engine's defaults.
    rowSize: {
      ...Object.fromEntries(Array.from({ length: rows }, (_, i) => [`r${i}`, 24])),
      ...extra.rowSize,
    },
    colSize: {
      ...Object.fromEntries(Array.from({ length: cols }, (_, i) => [`c${i}`, 100])),
      ...extra.colSize,
    },
  };
}

const at0 = { top: 0, left: 0 };
// A point in the frame from a point in the grid area (under the headers).
const pt = (gx: number, gy: number) => [ROW_HEADER_PX + gx, COL_HEADER_PX + gy] as const;

describe('geometryOf', () => {
  it('sums sizes, giving hidden rows and columns no size', () => {
    const g = geometryOf(
      grid(5, 3, {
        hiddenRows: ['r1'],
        hiddenCols: ['c2'],
        rowSize: { r3: 40 },
        colSize: { c1: 50 },
      }),
    );
    expect([...g.rows]).toEqual([0, 24, 24, 48, 88, 112]);
    expect([...g.cols]).toEqual([0, 100, 150, 150]);
    expect(totalSize(g)).toEqual({ width: 150, height: 112 });
    expect(g.hiddenRow(1)).toBe(true);
    expect(g.hiddenRow(0)).toBe(false);
    expect(g.hiddenCol(2)).toBe(true);
    expect(g.hiddenCol(0)).toBe(false);
  });

  it('draws rows the filter leaves out at no height', () => {
    const g = geometryOf(grid(3, 1), new Set(['r0']));
    expect([...g.rows]).toEqual([0, 0, 24, 48]);
    expect(g.hiddenRow(0)).toBe(true);
  });

  it('measures the frozen panes, clamped to the grid', () => {
    const g = geometryOf(grid(10, 5, { frozenRows: 2, frozenCols: 1 }));
    expect(g.frozenRows).toBe(2);
    expect(g.frozenHeight).toBe(48);
    expect(g.frozenWidth).toBe(100);
    const over = geometryOf(grid(3, 2, { frozenRows: 50, frozenCols: 9 }));
    expect(over.frozenRows).toBe(3);
    expect(over.frozenCols).toBe(2);
    expect(over.frozenHeight).toBe(72);
    expect(over.frozenWidth).toBe(200);
  });

  it('finds the merge over any covered cell and skips merges whose ids are gone', () => {
    const g = geometryOf(
      grid(5, 5, {
        merges: [
          { r1: 'r1', c1: 'c1', r2: 'r2', c2: 'c3' },
          { r1: 'gone', c1: 'c0', r2: 'r0', c2: 'c0' },
        ],
      }),
    );
    expect(g.merges.size).toBe(1);
    expect(mergeAt(g, 2, 3)).toEqual({ r1: 1, c1: 1, r2: 2, c2: 3 });
    expect(mergeAt(g, 1, 1)).toEqual({ r1: 1, c1: 1, r2: 2, c2: 3 });
    expect(mergeAt(g, 0, 0)).toBeNull();
    expect(mergeAt(g, 3, 3)).toBeNull();
  });
});

describe('visibleWindow', () => {
  it('is the scrolled rows and columns in view, plus overscan', () => {
    const g = geometryOf(grid(100, 30));
    expect(visibleWindow(g, { top: 240, left: 0 }, { width: 300, height: 240 })).toEqual({
      rows: Array.from({ length: 19 }, (_, i) => i + 6),
      c1: 0,
      c2: 7,
    });
  });

  it('starts below the frozen panes', () => {
    const g = geometryOf(grid(100, 30, { frozenRows: 2, frozenCols: 1 }));
    const w = visibleWindow(g, at0, { width: 300, height: 240 });
    expect(w.rows[0]).toBe(2);
    expect(w.rows.at(-1)).toBe(14);
    expect(w.c1).toBe(1);
    expect(w.c2).toBe(7);
  });

  it('is clamped to the grid, and empty when every line is frozen', () => {
    const g = geometryOf(grid(10, 2));
    expect(visibleWindow(g, at0, { width: 5000, height: 5000 })).toEqual({
      rows: Array.from({ length: 10 }, (_, i) => i + 0),
      c1: 0,
      c2: 1,
    });
    const frozen = geometryOf(grid(3, 2, { frozenRows: 3, frozenCols: 2 }));
    const w = visibleWindow(frozen, at0, { width: 500, height: 500 });
    expect(w.rows).toEqual([]);
    expect(w.c2).toBeLessThan(w.c1);
  });
});

describe('cellBox', () => {
  it('places frozen cells fixed and scrolling ones by the scroll, spanning a merge', () => {
    const g = geometryOf(grid(10, 5, { frozenRows: 1, frozenCols: 1 }));
    const scroll = { top: 30, left: 40 };
    expect(cellBox(g, 0, 0, scroll)).toEqual({ x: 0, y: 0, w: 100, h: 24 });
    expect(cellBox(g, 3, 2, scroll)).toEqual({ x: 160, y: 42, w: 100, h: 24 });
    expect(cellBox(g, 3, 2, scroll, { r1: 3, c1: 2, r2: 4, c2: 3 })).toEqual({
      x: 160,
      y: 42,
      w: 200,
      h: 48,
    });
  });
});

describe('hitTest', () => {
  const g = geometryOf(grid(10, 5));

  it('finds the corner, cells and nothing past the grid', () => {
    expect(hitTest(g, 10, 10, at0)).toEqual({ kind: 'corner' });
    expect(hitTest(g, ...pt(150, 30), at0)).toEqual({ kind: 'cell', r: 1, c: 1 });
    expect(hitTest(g, ...pt(600, 30), at0)).toEqual({ kind: 'none' });
    expect(hitTest(g, ...pt(30, 600), at0)).toEqual({ kind: 'none' });
  });

  it('finds column headers and the edges between them', () => {
    expect(hitTest(g, ROW_HEADER_PX + 150, 10, at0)).toEqual({ kind: 'col', c: 1, edge: false });
    expect(hitTest(g, ROW_HEADER_PX + 198, 10, at0)).toEqual({ kind: 'col', c: 1, edge: true });
    // Just right of a boundary is the left column's edge; the first column has no left edge.
    expect(hitTest(g, ROW_HEADER_PX + 102, 10, at0)).toEqual({ kind: 'col', c: 0, edge: true });
    expect(hitTest(g, ROW_HEADER_PX + 2, 10, at0)).toEqual({ kind: 'col', c: 0, edge: false });
    expect(hitTest(g, ROW_HEADER_PX + 600, 10, at0)).toEqual({ kind: 'none' });
  });

  it('finds row headers and the edges between them', () => {
    expect(hitTest(g, 10, COL_HEADER_PX + 30, at0)).toEqual({ kind: 'row', r: 1, edge: false });
    expect(hitTest(g, 10, COL_HEADER_PX + 46, at0)).toEqual({ kind: 'row', r: 1, edge: true });
    expect(hitTest(g, 10, COL_HEADER_PX + 26, at0)).toEqual({ kind: 'row', r: 0, edge: true });
    expect(hitTest(g, 10, COL_HEADER_PX + 2, at0)).toEqual({ kind: 'row', r: 0, edge: false });
    expect(hitTest(g, 10, COL_HEADER_PX + 500, at0)).toEqual({ kind: 'none' });
  });

  it('answers a merged cell with its top-left', () => {
    const merged = geometryOf(grid(5, 5, { merges: [{ r1: 'r1', c1: 'c1', r2: 'r2', c2: 'c2' }] }));
    expect(hitTest(merged, ...pt(250, 60), at0)).toEqual({ kind: 'cell', r: 1, c: 1 });
  });

  it('adds the scroll, except over the frozen panes', () => {
    expect(hitTest(g, ...pt(10, 10), { top: 48, left: 100 })).toEqual({
      kind: 'cell',
      r: 2,
      c: 1,
    });
    const f = geometryOf(grid(10, 5, { frozenRows: 1, frozenCols: 1 }));
    const scroll = { top: 48, left: 100 };
    expect(hitTest(f, ...pt(10, 10), scroll)).toEqual({ kind: 'cell', r: 0, c: 0 });
    expect(hitTest(f, ...pt(150, 30), scroll)).toEqual({ kind: 'cell', r: 3, c: 2 });
    expect(hitTest(f, ROW_HEADER_PX + 50, 10, scroll)).toEqual({ kind: 'col', c: 0, edge: false });
    expect(hitTest(f, ROW_HEADER_PX + 150, 10, scroll)).toEqual({
      kind: 'col',
      c: 2,
      edge: false,
    });
    expect(hitTest(f, 10, COL_HEADER_PX + 10, scroll)).toEqual({ kind: 'row', r: 0, edge: false });
    expect(hitTest(f, 10, COL_HEADER_PX + 30, scroll)).toEqual({ kind: 'row', r: 3, edge: false });
  });
});

describe('scrollToReveal', () => {
  const g = geometryOf(grid(100, 30));
  const view = { width: 300, height: 240 };

  it('is null when the cell is already in view', () => {
    expect(scrollToReveal(g, 5, 1, at0, view)).toBeNull();
  });

  it('scrolls down and right to the far edge, and back up and left to the near one', () => {
    expect(scrollToReveal(g, 20, 0, at0, view)).toEqual({ top: 264, left: 0 });
    expect(scrollToReveal(g, 2, 0, { top: 200, left: 0 }, view)).toEqual({ top: 48, left: 0 });
    expect(scrollToReveal(g, 0, 5, at0, view)).toEqual({ top: 0, left: 300 });
    expect(scrollToReveal(g, 0, 0, { top: 0, left: 150 }, view)).toEqual({ top: 0, left: 0 });
  });

  it('never scrolls for a frozen line, and measures from below the frozen panes', () => {
    const f = geometryOf(grid(100, 30, { frozenRows: 2, frozenCols: 1 }));
    expect(scrollToReveal(f, 1, 0, { top: 500, left: 400 }, view)).toBeNull();
    expect(scrollToReveal(f, 2, 1, { top: 100, left: 0 }, view)).toEqual({ top: 0, left: 0 });
  });
});

describe('pageRows', () => {
  it('is the rows of average height that fit below the frozen rows, at least one', () => {
    expect(pageRows(geometryOf(grid(100, 3)), 240)).toBe(10);
    expect(pageRows(geometryOf(grid(100, 3, { frozenRows: 2 })), 240)).toBe(8);
    expect(pageRows(geometryOf(grid(100, 3)), 5)).toBe(1);
  });
});

describe('pageCols', () => {
  it('is the columns of average width that fit beside the frozen columns, at least one', () => {
    expect(pageCols(geometryOf(grid(3, 50)), 1000)).toBe(10);
    expect(pageCols(geometryOf(grid(3, 50, { frozenCols: 3 })), 1000)).toBe(7);
    expect(pageCols(geometryOf(grid(3, 50)), 20)).toBe(1);
  });
});

// docs/specs/029-sheets/sheet.md "Row height": the grid places its rows by the heights they are drawn at.
describe('geometryOf with row heights', () => {
  it('places every row by the height it is given, hidden and filtered rows still at none', () => {
    const layout = grid(5, 3);
    const tall = new Map([
      [layout.rows[1]!, 62],
      [layout.rows[3]!, 500],
    ]);
    const g = geometryOf(
      { ...layout, hiddenRows: [layout.rows[3]!] },
      new Set([layout.rows[4]!]),
      (id) => tall.get(id) ?? 28,
    );
    expect([...g.rows]).toEqual([0, 28, 90, 118, 118, 118]);
    expect(cellBox(g, 1, 0, { top: 0, left: 0 }).h).toBe(62);
    // A point in the taller row is that row's; the next row starts under it.
    expect(hitTest(g, ROW_HEADER_PX + 5, COL_HEADER_PX + 80, { top: 0, left: 0 })).toEqual({
      kind: 'cell',
      r: 1,
      c: 0,
    });
    expect(hitTest(g, ROW_HEADER_PX + 5, COL_HEADER_PX + 91, { top: 0, left: 0 })).toMatchObject({
      r: 2,
    });
  });

  it('falls back to the layout’s own sizes with no heights given', () => {
    const g = geometryOf(grid(3, 3, { rowSize: { r0: 40 }, rowHeight: 24 }));
    expect([...g.rows]).toEqual([0, 40, 64, 88]);
  });
});

describe('the outline bands (D162, D165)', () => {
  it('give no room without groups', () => {
    const g = geometryOf(grid(10, 5));
    expect([g.bandW, g.bandH, g.headW, g.headH]).toEqual([0, 0, ROW_HEADER_PX, COL_HEADER_PX]);
  });

  it('are 12 px a depth and 4 more, before the headers, kept when the sheet hides its headers', () => {
    const groups = { rowDepth: { r2: 1, r3: 2 }, colDepth: { c1: 1 } };
    const g = geometryOf(grid(10, 5, groups));
    expect([g.bandW, g.bandH]).toEqual([OUTLINE_DEPTH_PX * 2 + 4, OUTLINE_DEPTH_PX + 4]);
    expect([g.headW, g.headH]).toEqual([28 + ROW_HEADER_PX, 16 + COL_HEADER_PX]);
    const bare = geometryOf(grid(10, 5, { ...groups, showHeaders: false }));
    expect([bare.headW, bare.headH]).toEqual([28, 16]);
  });

  it('are hit as bands, the corner above them still the corner', () => {
    const g = geometryOf(grid(10, 5, { rowDepth: { r2: 1 }, colDepth: { c1: 1 } }));
    expect(hitTest(g, 5, 100, at0)).toEqual({ kind: 'band', axis: 'r' });
    expect(hitTest(g, 200, 5, at0)).toEqual({ kind: 'band', axis: 'c' });
    expect(hitTest(g, 5, 5, at0)).toEqual({ kind: 'corner' });
    expect(hitTest(g, 20, 100, at0)).toEqual({ kind: 'row', r: 2, edge: false });
  });
});

// docs/specs/029-sheets/data-tools.md "The drawn order": a sorted view draws rows 1..3 as 3, 1, 2; positions stay the
// sheet's, only their places change.
describe('a drawn order', () => {
  const order = DrawnOrder.ofSort(6, 1, [3, 1, 2]);
  const layout = grid(6, 2, { rowSize: { r3: 48 } });
  const g = geometryOf(layout, new Set(), undefined, order);

  it('lays rows out in the order drawn', () => {
    expect([0, 1, 2, 3].map((r) => rowTop(g, r))).toEqual([0, 72, 96, 24]);
    expect(rowEnd(g, 3)).toBe(72);
    expect(totalSize(g).height).toBe(24 * 5 + 48);
  });

  it('answers the row under a point by its own number', () => {
    expect(hitTest(g, ROW_HEADER_PX + 10, COL_HEADER_PX + 30, at0)).toEqual({
      kind: 'cell',
      r: 3,
      c: 0,
    });
    expect(hitTest(g, ROW_HEADER_PX + 10, COL_HEADER_PX + 80, at0)).toEqual({
      kind: 'cell',
      r: 1,
      c: 0,
    });
    // The edge above row 1's number is the bottom of row 3, drawn before it.
    expect(hitTest(g, 10, COL_HEADER_PX + 73, at0)).toEqual({ kind: 'row', r: 3, edge: true });
  });

  it('lists the rows in view in the order drawn', () => {
    const w = visibleWindow(g, at0, { width: 300, height: 500 });
    expect(w.rows).toEqual([0, 3, 1, 2, 4, 5]);
    expect(inWindow(w, 3, 0)).toBe(true);
  });

  it('cuts a range into pieces drawn side by side, and boxes a cell where it is drawn', () => {
    expect(drawnPieces(g, 0, 3)).toEqual([
      { r1: 0, r2: 0 },
      { r1: 1, r2: 2 },
      { r1: 3, r2: 3 },
    ]);
    expect(cellBox(g, 1, 0, at0)).toEqual({ x: 0, y: 72, w: 100, h: 24 });
  });

  it('scrolls to where a row is drawn', () => {
    expect(scrollToReveal(g, 2, 0, at0, { width: 300, height: 60 })).toEqual({ top: 60, left: 0 });
  });
});

describe('a group by view (D497)', () => {
  // Rows 1..4 grouped: rows 3, 1 one group (from drawn 1), rows 2, 4 another (from drawn 3), row 5 in place.
  const group = (at: number, size: number, count = size) => ({
    at,
    size,
    count,
    first: count ? at : -1,
    key: String(at),
    blank: false,
  });
  const order = {
    ...DrawnOrder.ofSort(6, 1, [3, 1, 2, 4]),
    groups: [group(1, 2), group(3, 2)],
    starts: new Set([1, 3]),
  };
  const H = GROUP_HEADER_PX;
  const g = geometryOf(grid(6, 2, { frozenRows: 1 }), new Set(), undefined, order);

  it('leaves a band before each group, the rows under it', () => {
    expect(g.bands.map((b) => b.top)).toEqual([24, 24 + H + 48]);
    expect([0, 3, 1, 2, 4, 5].map((r) => rowTop(g, r))).toEqual([
      0,
      24 + H,
      48 + H,
      72 + 2 * H,
      96 + 2 * H,
      120 + 2 * H,
    ]);
    expect(rowEnd(g, 1)).toBe(72 + H);
    expect(totalSize(g).height).toBe(144 + 2 * H);
    // The frozen row ends where the first band begins: the band scrolls.
    expect(g.frozenHeight).toBe(24);
  });

  it('answers no cell, no row and no edge in a band', () => {
    expect(hitTest(g, ...pt(10, 24 + 5), at0)).toEqual({ kind: 'none' });
    expect(hitTest(g, 10, COL_HEADER_PX + 72 + H + 5, at0)).toEqual({ kind: 'none' });
    expect(hitTest(g, ...pt(10, 72 + 2 * H + 2), at0)).toEqual({ kind: 'cell', r: 2, c: 0 });
    // Just under a band, its top is no resize edge of the row above.
    expect(hitTest(g, 10, COL_HEADER_PX + 72 + 2 * H + 1, at0)).toEqual({
      kind: 'row',
      r: 2,
      edge: false,
    });
  });

  it('boxes a selection across groups in pieces, so no box covers a band', () => {
    expect(drawnPieces(g, 3, 3)).toEqual([{ r1: 3, r2: 3 }]);
    const runOrder = {
      ...DrawnOrder.ofSort(4, 0, [0, 1, 2, 3]),
      groups: [group(0, 2), group(2, 2)],
      starts: new Set([0, 2]),
    };
    const g2 = geometryOf(grid(4, 1), new Set(), undefined, runOrder);
    expect(drawnPieces(g2, 0, 3)).toEqual([
      { r1: 0, r2: 1 },
      { r1: 2, r2: 3 },
    ]);
  });

  it('draws no band for a group the view hides all of', () => {
    const hidden = { ...order, groups: [group(1, 2, 0), group(3, 2)] };
    const g3 = geometryOf(grid(6, 2), new Set(['r3', 'r1']), undefined, hidden);
    expect(g3.bands.map((b) => b.group.at)).toEqual([3]);
    expect(rowTop(g3, 2)).toBe(24 + H);
  });
});
