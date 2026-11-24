// @vitest-environment jsdom
// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar": each tab's colour and whether it is hidden, read from
// its sheet as the store holds it, kept as the store moves on (D177).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { hiddenTabIds, useSheetTabLooks } from './useSheetTabLooks';

const layouts: Record<string, Record<string, unknown>> = {};
let version = 0;
const listeners = new Set<() => void>();
vi.mock('@/components/sheets/sheet-store-client', () => ({
  sheetStoreOf: () => ({
    sheetsOn: (tabId: string) => (layouts[tabId] ? [{ layout: layouts[tabId] }] : []),
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getVersion: () => version,
  }),
}));

const tabs = [{ id: 't1' }, { id: 't2' }, { id: 'cold' }];
const bridge = {} as SheetsBridge;

describe('useSheetTabLooks', () => {
  it("reads each tab's colour and hiding, and follows the store", () => {
    layouts.t1 = { tabColour: '#1a73e8' };
    layouts.t2 = {};
    const hook = renderHook(() => useSheetTabLooks(bridge, tabs));
    expect(hook.result.current).toEqual({ t1: { colour: '#1a73e8' } });
    layouts.t2 = { hidden: true };
    act(() => {
      version++;
      for (const l of listeners) l();
    });
    expect(hook.result.current).toEqual({ t1: { colour: '#1a73e8' }, t2: { hidden: true } });
    expect([...hiddenTabIds(hook.result.current)]).toEqual(['t2']);
  });

  it('has no looks without the sheets', () => {
    expect(renderHook(() => useSheetTabLooks(null, tabs)).result.current).toEqual({});
  });
});
