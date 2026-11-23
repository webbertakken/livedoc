// @vitest-environment jsdom
// The grid at scale (docs/specs/029-sheets/grid-and-editing.md "The grid"; surface.md D134): a sheet past the scroll
// room scrolls through it in proportion, and a freeze is held to the room the grid leaves to scroll.
import { act, fireEvent } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AXIS_SIZE_MAX } from '@livedoc/sheets';
import { gridScrolls, installGridDom, mountGrid, VIEW } from './sheet-grid-test-utils';
import { ADD_ROWS_PX } from './SheetAddRows';
import { COL_HEADER_PX } from './sheet-geometry';
import { roomPerSheetPx, SCROLL_ROOM_MAX_PX } from './sheet-scroll-room';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let restore: () => void;
beforeAll(() => {
  restore = installGridDom();
});
afterAll(() => restore());
beforeEach(() => {
  gridScrolls.length = 0;
});

// 6,000 rows at the tallest a row may be: 12,000,000 px, past the room.
const ROWS = 6_000;
const tall = () => ({
  rows: ROWS,
  layout: {
    rowSize: Object.fromEntries(Array.from({ length: ROWS }, (_, i) => [`row${i}`, AXIS_SIZE_MAX])),
  },
});
const CONTENT = COL_HEADER_PX + ROWS * AXIS_SIZE_MAX + ADD_ROWS_PX;
const RATIO = (CONTENT - VIEW.height) / (SCROLL_ROOM_MAX_PX - VIEW.height);

describe('a sheet past the scroll room', () => {
  it('lays the scroller out at the room and reads its scroll in proportion', async () => {
    const h = await mountGrid(tall());
    const spacer = h.grid.firstElementChild as HTMLElement;
    expect(spacer.style.height).toBe(`${SCROLL_ROOM_MAX_PX}px`);
    expect(roomPerSheetPx(h.grid).y).toBeCloseTo(1 / RATIO, 12);
    expect(roomPerSheetPx(h.grid).x).toBe(1);
    Object.defineProperty(h.grid, 'scrollTop', {
      configurable: true,
      value: SCROLL_ROOM_MAX_PX - VIEW.height,
    });
    Object.defineProperty(h.grid, 'scrollLeft', { configurable: true, value: 0 });
    fireEvent.scroll(h.grid);
    // The room's end is the sheet's end.
    expect(h.c().scroll.top).toBeCloseTo(CONTENT - VIEW.height, 3);
  });

  it('brings the active cell into view through the room', async () => {
    const h = await mountGrid(tall());
    act(() =>
      h.c().setSelection({
        ranges: [{ r1: 5_000, c1: 0, r2: 5_000, c2: 0 }],
        active: { r: 5_000, c: 0 },
        anchor: { r: 5_000, c: 0 },
      }),
    );
    const sheetTop = 5_001 * AXIS_SIZE_MAX - (VIEW.height - COL_HEADER_PX);
    const [, to] = gridScrolls.at(-1) as [string, { top: number; left: number }];
    expect(to.top).toBeCloseTo(sheetTop / RATIO, 6);
    expect(to.left).toBe(0);
  });

  it('reads the sheet’s scroll afresh when the room changes under it', async () => {
    const h = await mountGrid(tall());
    Object.defineProperty(h.grid, 'scrollTop', { configurable: true, value: 1_000_000 });
    Object.defineProperty(h.grid, 'scrollLeft', { configurable: true, value: 0 });
    fireEvent.scroll(h.grid);
    const before = h.c().scroll.top;
    expect(before).toBeCloseTo(1_000_000 * RATIO, 3);
    // Half the rows deleted: the sheet fits the room again, and a room px is a sheet px.
    act(() =>
      h.c().setSelection({
        ranges: [{ r1: 0, c1: 0, r2: 2_999, c2: 0 }],
        active: { r: 0, c: 0 },
        anchor: { r: 0, c: 0 },
      }),
    );
    await act(async () => h.actions().remove('r'));
    expect(h.c().sheet.layout.rows.length).toBe(3_000);
    expect(h.c().scroll.top).toBe(1_000_000);
  });
});

describe('a sheet within the room', () => {
  it('scrolls one to one', async () => {
    const h = await mountGrid({ rows: 100 });
    expect(roomPerSheetPx(h.grid)).toEqual({ x: 1, y: 1 });
    expect(roomPerSheetPx(document.createElement('div'))).toEqual({ x: 1, y: 1 });
  });
});

describe('a freeze', () => {
  it('freezes no more than leave a third of the grid to scroll', async () => {
    const h = await mountGrid({ rows: 300, cols: 40 });
    // (400 - 24) × ⅔ ≈ 250 px: 10 rows of 24; (800 - 46) × ⅔ ≈ 502 px: 5 columns of 100.
    act(() => h.actions().freeze(300, 30));
    expect(h.c().sheet.layout.frozenRows).toBe(10);
    expect(h.c().sheet.layout.frozenCols).toBe(5);
    act(() => h.actions().freeze(2));
    expect(h.c().sheet.layout.frozenRows).toBe(2);
    expect(h.c().sheet.layout.frozenCols).toBe(5);
  });
});
