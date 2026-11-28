// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbookRecord } from '@livedoc/sheets';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { UNLINK_FAILED, useSheetFormLinks } from './useSheetFormLinks';

// docs/specs/029-sheets/plan-links.md "Form responses": the sheets a form writes to, and Unlink Form after asking.

const m = vi.hoisted(() => ({
  unlink: vi.fn(),
  confirm: vi.fn(async () => true),
}));
vi.mock('@/lib/api/workbook-link', () => ({ unlinkFormFromSheet: m.unlink }));
vi.mock('@/hooks/ui/useConfirm', () => ({ useConfirm: () => m.confirm }));
vi.mock('@/components/sheets/sheet-store-client', () => ({
  sheetStoreOf: () => ({
    getVersion: () => 1,
    subscribe: () => () => {},
    sheetsOn: (tabId: string) => [{ id: `${tabId}-sheet`, title: tabId.toUpperCase() }],
  }),
}));

afterEach(() => vi.clearAllMocks());

const tabs = [{ id: 't1' }, { id: 't2' }];
const base = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const linked = { ...base, forms: [{ documentId: 'd', tabId: 'f', sheetId: 't2-sheet' }] };

function bridge(canEdit: boolean) {
  return {
    canEdit,
    scope: { ownerId: 'me', documentId: 'ss', shareCode: 'CODE', tabId: null },
    toast: vi.fn(),
  } as unknown as SheetsBridge;
}

describe('useSheetFormLinks', () => {
  it('names the tabs whose sheets a form writes to', () => {
    const { result } = renderHook(() => useSheetFormLinks(bridge(true), tabs, linked));
    expect([...result.current.takes]).toEqual(['t2']);
  });

  it('unlinks every form of a sheet once asked, and applies the record', async () => {
    const saved = { ...base };
    m.unlink.mockResolvedValueOnce({ workbook: saved, rev: 3 });
    const onWorkbook = vi.fn();
    const { result } = renderHook(() => useSheetFormLinks(bridge(true), tabs, linked, onWorkbook));
    await act(async () => result.current.unlink!('t2'));
    expect(m.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unlink Form?' }));
    expect(m.unlink).toHaveBeenCalledWith('me', 'ss', { sheetId: 't2-sheet' }, 'CODE');
    expect(onWorkbook).toHaveBeenCalledWith(saved);
  });

  it('unlinks nothing when the Editor cancels, and says when it failed', async () => {
    const b = bridge(true);
    m.confirm.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useSheetFormLinks(b, tabs, linked));
    await act(async () => result.current.unlink!('t2'));
    expect(m.unlink).not.toHaveBeenCalled();
    m.unlink.mockRejectedValueOnce(new Error('offline'));
    await act(async () => result.current.unlink!('t2'));
    expect(b.toast).toHaveBeenCalledWith(UNLINK_FAILED);
  });

  it('offers no Unlink Form to someone who may not edit', () => {
    const { result } = renderHook(() => useSheetFormLinks(bridge(false), tabs, linked));
    expect(result.current.unlink).toBeNull();
  });
});
