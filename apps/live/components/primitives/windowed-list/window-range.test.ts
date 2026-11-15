import { describe, expect, it } from 'vitest';
import {
  LIST_BLOCK_ROWS,
  LIST_OVERSCAN_PX,
  LIST_WINDOW_FROM,
  drawnRowRange,
  rowAtOffset,
  windowSegments,
} from './window-range';

const ROWS = { stride: 50, origin: 200 };

describe('drawnRowRange', () => {
  it('draws the rows in view and the overscan past each edge, in whole blocks', () => {
    // View 1000..1900 holds rows 16..34; overscan 800 px reaches rows 0..50; blocks of 10 round out to 0..50.
    expect(drawnRowRange({ rows: 1000, ...ROWS, view: { top: 1000, bottom: 1900 } })).toEqual({
      first: 0,
      last: 50,
    });
    // Far down: view 30000..30900 is rows 596..614; with overscan 580..630.
    expect(drawnRowRange({ rows: 1000, ...ROWS, view: { top: 30000, bottom: 30900 } })).toEqual({
      first: 580,
      last: 630,
    });
  });

  it('clamps to the list', () => {
    expect(drawnRowRange({ rows: 1000, ...ROWS, view: { top: 49000, bottom: 49900 } })).toEqual({
      first: 960,
      last: 1000,
    });
    expect(drawnRowRange({ rows: 7, ...ROWS, view: { top: 0, bottom: 900 } })).toEqual({
      first: 0,
      last: 7,
    });
  });

  it('keeps a block drawn when the list is entirely out of view, so there is a row to measure', () => {
    expect(drawnRowRange({ rows: 1000, ...ROWS, view: { top: -5000, bottom: -4100 } })).toEqual({
      first: 0,
      last: LIST_BLOCK_ROWS,
    });
    expect(drawnRowRange({ rows: 100, ...ROWS, view: { top: 90000, bottom: 90900 } })).toEqual({
      first: 90,
      last: 100,
    });
  });

  it('holds the same range while the view moves inside a block', () => {
    const at = (top: number) =>
      drawnRowRange({ rows: 1000, ...ROWS, view: { top, bottom: top + 900 } });
    expect(at(30010)).toEqual(at(30040));
  });

  it('has a screen of overscan by default', () => {
    expect(LIST_OVERSCAN_PX).toBe(800);
    expect(LIST_WINDOW_FROM).toBe(60);
  });
});

describe('rowAtOffset', () => {
  it('names the row under an offset of the scroller', () => {
    expect(rowAtOffset({ rows: 1000, ...ROWS }, 199)).toBe(0);
    expect(rowAtOffset({ rows: 1000, ...ROWS }, 260)).toBe(1);
    expect(rowAtOffset({ rows: 1000, ...ROWS }, 1e9)).toBe(999);
  });
});

describe('windowSegments', () => {
  const base = { stride: 50, gap: 0, lanes: 1, leading: 0, pinned: null };

  it('draws a short list whole', () => {
    expect(
      windowSegments({ ...base, count: LIST_WINDOW_FROM, range: { first: 0, last: 10 } }),
    ).toEqual([{ kind: 'items', from: 0, to: LIST_WINDOW_FROM }]);
  });

  it('leaves room of the rows not drawn on each side', () => {
    expect(windowSegments({ ...base, count: 1000, range: { first: 580, last: 630 } })).toEqual([
      { kind: 'gap', key: 'gap-0', height: 580 * 50 },
      { kind: 'items', from: 580, to: 630 },
      { kind: 'gap', key: 'gap-630', height: 370 * 50 },
    ]);
  });

  it('takes a gap between rows off the room, as the room sits between rows with gaps of its own', () => {
    expect(
      windowSegments({ ...base, gap: 6, stride: 56, count: 200, range: { first: 0, last: 50 } }),
    ).toEqual([
      { kind: 'items', from: 0, to: 50 },
      { kind: 'gap', key: 'gap-50', height: 150 * 56 - 6 },
    ]);
  });

  it('always draws the leading entries (the folders) and the pinned row', () => {
    expect(
      windowSegments({
        ...base,
        leading: 3,
        pinned: 400,
        count: 1000,
        range: { first: 580, last: 630 },
      }),
    ).toEqual([
      { kind: 'items', from: 0, to: 3 },
      { kind: 'gap', key: 'gap-3', height: 397 * 50 },
      { kind: 'items', from: 400, to: 401 },
      { kind: 'gap', key: 'gap-401', height: 179 * 50 },
      { kind: 'items', from: 580, to: 630 },
      { kind: 'gap', key: 'gap-630', height: 370 * 50 },
    ]);
  });

  it('merges a pinned row next to the range into it', () => {
    expect(
      windowSegments({ ...base, pinned: 630, count: 1000, range: { first: 580, last: 630 } }),
    ).toEqual([
      { kind: 'gap', key: 'gap-0', height: 580 * 50 },
      { kind: 'items', from: 580, to: 631 },
      { kind: 'gap', key: 'gap-631', height: 369 * 50 },
    ]);
  });

  it('draws whole grid rows of lanes, the last one short', () => {
    expect(
      windowSegments({
        ...base,
        lanes: 4,
        leading: 2,
        pinned: 9,
        count: 1001,
        range: { first: 100, last: 251 },
      }),
    ).toEqual([
      { kind: 'items', from: 0, to: 4 },
      { kind: 'gap', key: 'gap-1', height: 50 },
      { kind: 'items', from: 8, to: 12 },
      { kind: 'gap', key: 'gap-3', height: 97 * 50 },
      { kind: 'items', from: 400, to: 1001 },
    ]);
  });
});
