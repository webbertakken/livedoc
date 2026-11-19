import { describe, expect, it } from 'vitest';
import { interactiveMs, OPEN_QUIET_MS, tabArrivedAt } from './interactive';

// Opening counts every long frame (docs/specs/008-canvas/canvas-performance.md "Measuring", D68).
describe('interactiveMs', () => {
  it('is zero when nothing long runs after the response', () => {
    expect(interactiveMs(1000, [{ start: 100, end: 900 }])).toBe(0);
  });

  it('ends at the first gap of the quiet length', () => {
    const busy = [
      { start: 1000, end: 1800 },
      { start: 2000, end: 2100 },
      { start: 2100 + OPEN_QUIET_MS, end: 3000 },
    ];
    expect(interactiveMs(1000, busy)).toBe(1100);
  });

  it('keeps going through a gap shorter than the quiet length', () => {
    const busy = [
      { start: 1000, end: 1500 },
      { start: 1500 + OPEN_QUIET_MS - 1, end: 2200 },
    ];
    expect(interactiveMs(1000, busy)).toBe(1200);
  });

  it('counts a render-only long frame that no long task covers', () => {
    const tasks = [{ start: 1000, end: 1400 }];
    const frames = [{ start: 1700, end: 2300 }];
    expect(interactiveMs(1000, [...tasks, ...frames])).toBe(1300);
  });

  it('merges overlapping tasks and frames in any order', () => {
    const busy = [
      { start: 1300, end: 1600 },
      { start: 1000, end: 1500 },
      { start: 1100, end: 1200 },
    ];
    expect(interactiveMs(1000, busy)).toBe(600);
  });

  it('counts only the part of a task that runs after the response', () => {
    expect(interactiveMs(1000, [{ start: 500, end: 1250 }])).toBe(250);
  });
});

// Where opening starts: the first response that carried the tab (D68). The editor's open read of the
// document carries its first tab (docs/specs/016-platform/web-performance.md "The open is one read");
// a tab's own GET carries it where the open read does not.
describe('tabArrivedAt', () => {
  const doc = 'd1';
  const at = (path: string, responseEnd: number) => ({
    url: `http://localhost:3000/api${path}`,
    responseEnd,
  });

  it("reads the document's open read, which carries the tab", () => {
    expect(tabArrivedAt([at('/documents/d1', 420), at('/participants/me', 300)], doc)).toBe(420);
  });

  it("reads the tab's own GET where it came first", () => {
    expect(tabArrivedAt([at('/documents/d1/tabs/t1', 500), at('/documents/d1', 700)], doc)).toBe(
      500,
    );
  });

  it('ignores a query string on the read', () => {
    expect(tabArrivedAt([at('/documents/d1?x=1', 410)], doc)).toBe(410);
  });

  it("ignores another document's reads and the document's other routes", () => {
    const entries = [
      at('/documents/d2', 100),
      at('/documents/d1/comments', 150),
      at('/documents/d1/tabs/t1/items', 160),
    ];
    expect(tabArrivedAt(entries, doc)).toBeNull();
  });

  it('is null when nothing carrying the tab has arrived', () => {
    expect(tabArrivedAt([], doc)).toBeNull();
  });
});
