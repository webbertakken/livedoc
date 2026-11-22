// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { createOfficeBindingsChannel, OfficeBindingsContext } from './office-bindings-channel';
import { useGridMenuBindings } from './useGridMenuBindings';

const clip = {
  copyNow: vi.fn(),
  pasteNow: vi.fn(async () => {}),
  pasteSpecial: vi.fn(async () => {}),
};
vi.mock('@/components/sheets/useSheetClipboard', () => ({ useSheetClipboard: () => clip }));

const layout = (over: object = {}) => ({ rows: ['r1', 'r2', 'r3'], cols: ['c1', 'c2'], ...over });
let controller: object = {};
vi.mock('@/components/sheets/sheet-controller', () => ({ useSheetController: () => controller }));

const actions = { activeFormat: () => ({ b: true }), toggle: vi.fn() } as unknown as SheetActions;

function bound(sheetLayout: object, roles = { canEdit: true, canShape: true }) {
  controller = {
    ...roles,
    selection: {
      ranges: [
        { r1: 0, c1: 0, r2: 0, c2: 0 },
        { r1: 1, c1: 1, r2: 2, c2: 1 },
      ],
      active: { r: 1, c: 1 },
    },
    sheet: { layout: sheetLayout },
  };
  const channel = createOfficeBindingsChannel();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <OfficeBindingsContext.Provider value={channel}>{children}</OfficeBindingsContext.Provider>
  );
  renderHook(() => useGridMenuBindings(actions), { wrapper });
  return channel.get();
}

// docs/specs/029-sheets/surface.md "Menu bar": the open sheet's items, from its selection and the active cell.
describe('useGridMenuBindings', () => {
  it('publishes the grid’s items from the last range selected and the active cell’s look', () => {
    const b = bound(layout());
    expect(b.bold!.checked).toBe(true);
    expect(b['insert-rows-above']!.label).toBe('Insert 2 Rows Above');
    expect(b['move-row-down']!.disabled).toBe(true);
    expect(b['show-gridlines']!.checked).toBe(true);
    expect(b['freeze-no-rows']!.checked).toBe(true);
    expect(b['create-a-filter']!.label).toBeUndefined();
    b.bold!.run();
    expect(actions.toggle).toHaveBeenCalledWith('b');
  });

  it('reads the frozen lines, hidden gridlines and a filter from the layout', () => {
    const b = bound(layout({ frozenRows: 1, frozenCols: 2, showGrid: false, filter: {} }));
    expect(b['freeze-1-row']!.checked).toBe(true);
    expect(b['freeze-2-columns']!.checked).toBe(true);
    expect(b['show-gridlines']!.checked).toBe(false);
    expect(b['create-a-filter']!.label).toBe('Remove Filter');
  });

  it('runs the clipboard’s own copy, cut and pastes', () => {
    const b = bound(layout());
    b.cut!.run();
    b.copy!.run();
    b.paste!.run();
    b['paste-values-only']!.run();
    expect(clip.copyNow.mock.calls).toEqual([[true], [false]]);
    expect(clip.pasteNow).toHaveBeenCalled();
    expect(clip.pasteSpecial).toHaveBeenCalledWith('values');
  });

  it('binds Copy alone for a Viewer', () => {
    expect(Object.keys(bound(layout(), { canEdit: false, canShape: false }))).toEqual(['copy']);
  });
});
