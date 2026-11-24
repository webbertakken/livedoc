// @vitest-environment jsdom
// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar": Copy To from the open spreadsheet (D183-D186).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbookRecord } from '@livedoc/sheets';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { copySheetTo } from '@/lib/spreadsheet/copy-sheet-to';
import { useSheetCopyTo } from './useSheetCopyTo';

const loading = vi.fn(() => false);
const ctxFor = vi.fn(() => ({ own: 'ctx' }));
vi.mock('@/components/sheets/sheet-store-client', () => ({
  sheetStoreOf: () => ({
    sheetsOn: (tabId: string) =>
      tabId === 'cold' ? [] : [{ id: `sheet${tabId}`, title: 'Costs' }],
    loading,
    workbook: () => ({ ctxFor }),
  }),
}));
vi.mock('@/lib/spreadsheet/copy-sheet-to', () => ({ copySheetTo: vi.fn() }));
const confirm = vi.fn(async () => true);
vi.mock('@/hooks/ui/useConfirm', () => ({ useConfirm: () => confirm }));

const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const bridge = () =>
  ({
    scope: { ownerId: 'o', documentId: 'here', shareCode: null, tabId: null },
    toast: vi.fn(),
    notify: vi.fn(),
  }) as unknown as SheetsBridge;
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

afterEach(() => vi.clearAllMocks());

describe('useSheetCopyTo', () => {
  it('is nothing without the sheets, and holds which tab is being picked for', () => {
    expect(renderHook(() => useSheetCopyTo(null, record)).result.current).toBeNull();
    const hook = renderHook(() => useSheetCopyTo(bridge(), record));
    expect(hook.result.current).toMatchObject({ ownerId: 'o', documentId: 'here', picking: null });
    act(() => hook.result.current!.pick('t1'));
    expect(hook.result.current!.picking).toBe('t1');
  });

  it('copies, then offers to open where it went', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.mocked(copySheetTo).mockImplementation(async (_o, _s, _t, progress) => {
      progress(1);
      return { ok: true, documentId: 'new 1', name: 'Plans' };
    });
    const b = bridge();
    const hook = renderHook(() => useSheetCopyTo(b, record));
    act(() => hook.result.current!.copy('t1', { kind: 'new' }));
    await settle();
    expect(b.notify).toHaveBeenCalledWith('Copying Costs…');
    expect(vi.mocked(copySheetTo).mock.calls[0]!.slice(0, 3)).toEqual([
      'o',
      { sheet: { id: 'sheett1', title: 'Costs' }, ctx: { own: 'ctx' }, record },
      { kind: 'new' },
    ]);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '“Copy of Costs” is in “Plans”.',
        confirmLabel: 'Open Spreadsheet',
      }),
    );
    expect(open).toHaveBeenCalledWith('/document/new%201', '_blank', 'noopener');
    confirm.mockResolvedValueOnce(false);
    act(() => hook.result.current!.copy('t1', { kind: 'new' }));
    await settle();
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it('says a refused copy, and a sheet not loaded or still paging in', async () => {
    vi.mocked(copySheetTo).mockResolvedValue({ ok: false, message: 'No room' });
    const b = bridge();
    const hook = renderHook(() => useSheetCopyTo(b, record));
    act(() => hook.result.current!.copy('t1', { kind: 'new' }));
    await settle();
    expect(b.toast).toHaveBeenCalledWith('No room');
    act(() => hook.result.current!.copy('cold', { kind: 'new' }));
    loading.mockReturnValueOnce(true);
    act(() => hook.result.current!.copy('t1', { kind: 'new' }));
    expect(b.toast).toHaveBeenLastCalledWith('This sheet is still loading');
    expect(copySheetTo).toHaveBeenCalledTimes(1);
  });
});
