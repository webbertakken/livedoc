// @vitest-environment jsdom
// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar": the sheet bar's changes on the open spreadsheet, an
// Editor's alone (D174), landing on LiveDoc or in This Browser, a new sheet opened once its tab is listed.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { isOfflineIdSync } from '@/lib/offline/offline-store';
import { cloudSheetBar, offlineSheetBar } from './sheet-bar-backend';
import { useSheetBarActions } from './useSheetBarActions';

const put = vi.fn(async () => {});
const orderSheets = vi.fn();
const write = vi.fn(() => null);
const move = vi.fn(async () => {});
vi.mock('./sheet-bar-backend', () => ({
  cloudSheetBar: vi.fn(() => ({ put, take: vi.fn(), move })),
  offlineSheetBar: vi.fn(() => ({ put, take: vi.fn() })),
}));
vi.mock('@/components/sheets/sheet-store-client', () => ({
  sheetStoreOf: vi.fn(() => ({
    sheetsOn: (tabId: string) => [{ id: `sheet${tabId}`, layout: {} }],
    write,
    settle: async () => {},
    orderSheets,
  })),
}));
vi.mock('@/lib/offline/offline-store', () => ({ isOfflineIdSync: vi.fn(() => false) }));
vi.mock('@/hooks/ui/useConfirm', () => ({ useConfirm: () => async () => true }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const scope = { documentId: 'd1', ownerId: 'o', shareCode: null };
const bridge = (canShape = true) =>
  ({ canEdit: true, canShape, pushUndo: vi.fn(), toast: vi.fn() }) as unknown as SheetsBridge;
const one = [{ id: 't1', name: 'Sheet1' }];

function mount(b: SheetsBridge | null, onSelectTab = vi.fn()) {
  return renderHook(
    ({ tabs }) =>
      useSheetBarActions({ bridge: b, scope, tabs, tabId: 't1', onSelectTab, editTabs: vi.fn() }),
    { initialProps: { tabs: one } },
  );
}

afterEach(() => vi.clearAllMocks());

describe('useSheetBarActions', () => {
  it('is an Editor’s alone (D174)', () => {
    expect(mount(bridge()).result.current.canChange).toBe(true);
    expect(mount(bridge(false)).result.current.canChange).toBe(false);
    expect(mount(null).result.current.canChange).toBe(false);
  });

  it('opens a new sheet once the tab list holds it, on LiveDoc', async () => {
    const onSelectTab = vi.fn();
    const hook = mount(bridge(), onSelectTab);
    await act(async () => hook.result.current.add('end'));
    expect(cloudSheetBar).toHaveBeenCalledWith(scope, expect.any(Function));
    // Its settle waits for the store's writes, and for nothing without a bridge.
    await vi.mocked(cloudSheetBar).mock.calls[0]![1]();
    expect(onSelectTab).not.toHaveBeenCalled();
    const added = (put.mock.calls[0] as unknown as [{ tabId: string }])[0].tabId;
    hook.rerender({ tabs: [...one, { id: added, name: 'Sheet2' }] });
    expect(onSelectTab).toHaveBeenCalledWith(added);
    hook.rerender({ tabs: [...one] });
    expect(onSelectTab).toHaveBeenCalledTimes(1);
  });

  it('lands in the editor for a spreadsheet in This Browser', async () => {
    vi.mocked(isOfflineIdSync).mockReturnValueOnce(true);
    const hook = mount(bridge());
    await act(async () => hook.result.current.add('end'));
    expect(offlineSheetBar).toHaveBeenCalled();
  });

  it('renames the open sheet by Alt+1 for an Editor, and holds which tab is renamed', () => {
    const hook = mount(bridge());
    act(() => hook.result.current.renameOpen());
    expect(hook.result.current.renaming).toBe('t1');
    act(() => hook.result.current.startRename(null));
    expect(hook.result.current.renaming).toBeNull();
    const viewer = mount(bridge(false));
    act(() => viewer.result.current.renameOpen());
    expect(viewer.result.current.renaming).toBeNull();
  });

  it('opens a sheet already listed at once, and pushes its undo step', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('aaaa-bbbb-cccc-dddd-eeee');
    const onSelectTab = vi.fn();
    const b = bridge();
    const hook = mount(b, onSelectTab);
    put.mockImplementationOnce(async () => {
      hook.rerender({ tabs: [...one, { id: 'aaaa-bbbb-cccc-dddd-eeee', name: 'Sheet2' }] });
    });
    await act(async () => hook.result.current.add('end'));
    expect(onSelectTab).toHaveBeenCalledWith('aaaa-bbbb-cccc-dddd-eeee');
    expect(b.pushUndo).toHaveBeenCalledTimes(1);
  });

  it('renames and deletes through the store and the question, opening the next sheet', async () => {
    const onSelectTab = vi.fn();
    const hook = renderHook(() =>
      useSheetBarActions({
        bridge: bridge(),
        scope,
        tabs: [...one, { id: 't2', name: 'Costs' }],
        tabId: 't1',
        onSelectTab,
        editTabs: vi.fn(),
      }),
    );
    expect(hook.result.current.rename('t1', 'Data')).toBe(true);
    await act(async () => hook.result.current.remove('t1'));
    expect(onSelectTab).toHaveBeenCalledWith('t2');
  });

  it('keeps the engine’s sheets in the tabs’ order, and moves a sheet', async () => {
    const hook = mount(bridge());
    expect(orderSheets).toHaveBeenLastCalledWith(['t1']);
    hook.rerender({ tabs: [{ id: 't2', name: 'Costs' }, ...one] });
    expect(orderSheets).toHaveBeenLastCalledWith(['t2', 't1']);
    await act(async () => hook.result.current.moveBy('t2', 1));
    await act(async () => hook.result.current.move('t1', null));
    expect(
      move.mock.calls.map((c) => (c as unknown as [{ after: string | null }])[0].after),
    ).toEqual(['t1', null]);
  });

  it('colours, hides and shows through the store, and counts the hidden sheets', () => {
    const onSelectTab = vi.fn();
    const hook = renderHook(() =>
      useSheetBarActions({
        bridge: bridge(),
        scope,
        tabs: [...one, { id: 't2', name: 'Costs' }],
        tabId: 't1',
        onSelectTab,
        editTabs: vi.fn(),
        hiddenCount: 2,
      }),
    );
    act(() => hook.result.current.colour('t2', '#1a73e8'));
    act(() => hook.result.current.hide('t2'));
    act(() => hook.result.current.show('t2'));
    expect(write).toHaveBeenCalledTimes(2);
    expect(onSelectTab).toHaveBeenCalledWith('t2');
    expect(hook.result.current.hiddenCount).toBe(2);
    expect(mount(bridge()).result.current.hiddenCount).toBe(0);
  });

  it('opens and closes All Sheets (D180)', () => {
    const hook = mount(bridge());
    expect(hook.result.current.listing).toBe(false);
    act(() => hook.result.current.listSheets(true));
    expect(hook.result.current.listing).toBe(true);
    act(() => hook.result.current.listSheets(false));
    expect(hook.result.current.listing).toBe(false);
  });

  it('says a refusal through the bridge, and nothing without one', async () => {
    const b = bridge();
    put.mockRejectedValueOnce({ code: 'sheets_full' });
    const hook = mount(b);
    await act(async () => hook.result.current.add('end'));
    expect(b.toast).toHaveBeenCalledWith('A spreadsheet holds up to 200 sheets');
    const none = mount(null);
    act(() => none.result.current.duplicate('t1'));
    expect(put).toHaveBeenCalledTimes(1);
    // Landed without a bridge: no timeline to push to, no writes to wait for.
    await act(async () => none.result.current.add('end'));
    expect(put).toHaveBeenCalledTimes(2);
    await vi.mocked(cloudSheetBar).mock.lastCall![1]();
  });
});
