// @vitest-environment jsdom
// docs/specs/029-sheets/plan-links.md "The `CARD` functions": while a formula reads cards, the spreadsheet reads the
// document its settings name, or says none is chosen; nothing is asked while no formula reads them.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARDS_UNSET, WorkbookRecord } from '@livedoc/sheets';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { useSpreadsheetCards } from './useSpreadsheetCards';

const m = vi.hoisted(() => ({
  usesCards: vi.fn(() => true),
  setCards: vi.fn(),
  stop: vi.fn(),
  watch: vi.fn(),
}));
vi.mock('@/components/sheets/sheet-store-client', () => {
  const store = {
    getVersion: () => 1,
    subscribe: () => () => {},
    usesCards: m.usesCards,
    setCards: m.setCards,
  };
  return { sheetStoreOf: () => store };
});
vi.mock('./spreadsheet-cards', () => ({ watchSpreadsheetCards: m.watch }));

afterEach(() => vi.clearAllMocks());

const base = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const named = { ...base, settings: { ...base.settings, cardsDocument: 'plan' } };
const bridge = {
  scope: { ownerId: 'me', documentId: 'ss', shareCode: 'CODE', tabId: null },
} as unknown as SheetsBridge;

describe('useSpreadsheetCards', () => {
  it('says no cards’ document is chosen when the settings name none', () => {
    renderHook(() => useSpreadsheetCards(bridge, base));
    expect(m.setCards).toHaveBeenCalledWith({ unavailable: CARDS_UNSET });
    expect(m.watch).not.toHaveBeenCalled();
  });

  it('watches the named document with the reader’s own id, loading until it answers, until unmounted', () => {
    m.watch.mockReturnValueOnce(m.stop);
    const { unmount } = renderHook(() => useSpreadsheetCards(bridge, named));
    expect(m.setCards).toHaveBeenCalledWith(null);
    expect(m.watch).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'me', documentId: 'plan' }),
    );
    const { land } = m.watch.mock.calls[0]![0] as { land: (h: unknown) => void };
    land({ unavailable: 'x' });
    expect(m.setCards).toHaveBeenLastCalledWith({ unavailable: 'x' });
    unmount();
    expect(m.stop).toHaveBeenCalled();
  });

  it('asks nothing while no formula reads cards', () => {
    m.usesCards.mockReturnValue(false);
    renderHook(() => useSpreadsheetCards(bridge, named));
    expect(m.setCards).not.toHaveBeenCalled();
    expect(m.watch).not.toHaveBeenCalled();
    m.usesCards.mockReturnValue(true);
  });
});
