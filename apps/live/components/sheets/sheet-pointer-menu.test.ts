// The grid's menus by pointer (sheet.md "Cell menu"): when a right-click opens one, waits for one, or opens none.
import { describe, expect, it, vi } from 'vitest';
import type { SheetController } from './sheet-controller';
import type { SheetPan } from './useSheetPan';
import { sheetPointerMenu } from './sheet-pointer-menu';

function setup(o: { interactive?: boolean; swallow?: boolean; pending?: boolean } = {}) {
  const menus: unknown[] = [];
  const held: (() => void)[] = [];
  const c = {
    interactive: o.interactive ?? true,
    selectionNow: () => ({
      ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }],
      active: { r: 0, c: 0 },
      anchor: { r: 0, c: 0 },
    }),
    setSelection: vi.fn(),
    setMenu: (m: unknown) => menus.push(m),
    grid: { rows: 10, cols: 10 },
  } as unknown as SheetController;
  const pan = {
    swallowContextMenu: () => o.swallow ?? false,
    rightPending: () => o.pending ?? false,
    afterRightClick: (open: () => void) => held.push(open),
  } as unknown as SheetPan;
  const m = sheetPointerMenu({
    controller: { current: c },
    local: (x, y) => ({ x, y }),
    hitAt: () => ({ kind: 'cell', r: 0, c: 0 }),
    pan,
  });
  const event = (pointerType = 'mouse') =>
    ({
      clientX: 5,
      clientY: 6,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      nativeEvent: { pointerType },
    }) as unknown as React.MouseEvent<HTMLDivElement>;
  return { m, menus, held, event };
}

describe('sheetPointerMenu.onContextMenu', () => {
  it('opens the cell menu where the mouse is', () => {
    const t = setup();
    t.m.onContextMenu(t.event());
    expect(t.menus).toEqual([{ kind: 'cell', x: 5, y: 6 }]);
  });

  it('opens nothing outside Plan mode, for a finger, or after a pan', () => {
    for (const t of [setup({ interactive: false }), setup({ swallow: true })]) {
      t.m.onContextMenu(t.event());
      expect(t.menus).toEqual([]);
    }
    const finger = setup();
    finger.m.onContextMenu(finger.event('touch'));
    expect(finger.menus).toEqual([]);
  });

  it('waits for a right press still deciding, then opens on its release', () => {
    const t = setup({ pending: true });
    t.m.onContextMenu(t.event());
    expect(t.menus).toEqual([]);
    t.held[0]!();
    expect(t.menus).toEqual([{ kind: 'cell', x: 5, y: 6 }]);
  });
});
