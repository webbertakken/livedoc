// @vitest-environment jsdom
// docs/specs/029-sheets/plan-links.md "The Spreadsheet slot": a spreadsheet's first sheet, read-only, with Open; an
// Editor chooses the spreadsheet, anyone else waits for it; each way of not showing it says why.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@livedoc/api-schema';
import { applySheetWrite, emptySheet, NOBODY, Workbook, type Sheet } from '@livedoc/sheets';
import { apiListDocuments } from '@/lib/api/documents';
import { DashboardContext, type DashboardContextValue } from './dashboard-context';
import type { LinkedRead } from './linked-sheets';
import { DashboardSpreadsheet } from './DashboardSpreadsheet';

vi.mock('@/lib/api/documents', () => ({ apiListDocuments: vi.fn() }));
vi.mock('@/hooks/sheets/useSheetsBridge', () => {
  const bridge = { scope: { ownerId: 'owner', documentId: 'plan1' } };
  return { useSheetsBridgeContext: () => bridge };
});
const reads = new Map<string, LinkedRead>();
const LOADING: LinkedRead = { state: 'loading' };
const retry = vi.hoisted(() => vi.fn());
vi.mock('./linked-sheets', () => ({
  subscribeLinkedRead: () => () => {},
  linkedRead: (documentId: string, sheetId: string) =>
    reads.get(`${documentId}:${sheetId}`) ?? LOADING,
  retryLinkedRead: retry,
}));
afterEach(() => {
  cleanup();
  reads.clear();
  retry.mockClear();
});

function book(): { wb: Workbook; sheet: Sheet } {
  let sheet: Sheet = emptySheet({
    id: 'sheetA',
    tabId: 'tabA',
    title: 'Costs',
    layout: { rows: ['r1'], cols: ['c1'] },
  });
  sheet = applySheetWrite(
    sheet,
    { kind: 'cells', cells: [{ r: 'r1', c: 'c1', i: { s: 'Rent' } }] },
    { now: 0, by: NOBODY },
  ).sheet;
  return { wb: new Workbook({ sheets: [sheet], locale: 'en-GB' }), sheet };
}
const SHEETS = [
  { id: 'sheetA', title: 'Costs' },
  { id: 'sheetB', title: 'Income' },
];
const ready = (over: Partial<Extract<LinkedRead, { state: 'ready' }>> = {}): LinkedRead => ({
  state: 'ready',
  sheet: null,
  wb: new Workbook({ sheets: [], locale: 'en-GB' }),
  locale: 'en-GB',
  version: 1,
  name: 'Money',
  sheets: SHEETS,
  ...over,
});

function show(documentId: string, canEdit = true) {
  const setSlotContent = vi.fn();
  const value = {
    tabs: [],
    elements: new Map(),
    canEdit,
    actions: { setSlotContent },
  } as unknown as DashboardContextValue;
  render(
    <DashboardContext.Provider value={value}>
      <DashboardSpreadsheet slotId="s1" documentId={documentId} />
    </DashboardContext.Provider>,
  );
  return setSlotContent;
}

describe('a Spreadsheet slot', () => {
  it('shows the first sheet as a picture under its name, and Open opens the spreadsheet', () => {
    const { wb, sheet } = book();
    reads.set('book1:', ready());
    reads.set('book1:sheetA', ready({ sheet, wb, version: 2 }));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    show('book1');
    expect(screen.getByRole('heading', { name: 'Costs · Money' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Costs · Money' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Costs · Money' })).toBeTruthy();
    // Read-only: nothing in it to type into.
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith('/document/book1', '_blank', 'noopener');
    open.mockRestore();
  });

  it('offers an Editor Choose a Spreadsheet, whose pick fills the slot', async () => {
    vi.mocked(apiListDocuments).mockResolvedValue([
      { id: 'plan1', name: 'This plan', spreadsheet: true } as DocumentSummary,
      { id: 'book1', name: 'Money', spreadsheet: true } as DocumentSummary,
    ]);
    const setSlotContent = show('');
    expect(screen.getByRole('heading', { name: 'Spreadsheet' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a Spreadsheet' }));
    fireEvent.click(await screen.findByRole('button', { name: /Money/ }));
    expect(setSlotContent).toHaveBeenCalledWith('s1', { type: 'spreadsheet', documentId: 'book1' });
    await waitFor(() => expect(screen.queryByText('Search spreadsheets')).toBeNull());
  });

  it('has anyone else wait for its spreadsheet', () => {
    show('', false);
    expect(screen.getByText('Waiting for its spreadsheet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose a Spreadsheet' })).toBeNull();
  });

  it('says it is loading, then why it shows nothing, keeping Choose a Spreadsheet', () => {
    show('book1');
    expect(screen.getByText('Loading the sheet…')).toBeTruthy();
    cleanup();
    reads.set('book1:', { state: 'denied' });
    show('book1');
    expect(screen.getByText('You don’t have access to this spreadsheet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose a Spreadsheet' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    cleanup();
    reads.set('book1:', { state: 'too-large' });
    show('book1');
    expect(screen.getByText('This spreadsheet is too large to read here.')).toBeTruthy();
    cleanup();
    reads.set('book1:', ready({ sheets: [] }));
    show('book1', false);
    expect(screen.getByText('This spreadsheet has no sheets to show.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
  });

  it('retries both reads when the first failed', () => {
    reads.set('book1:', ready());
    reads.set('book1:sheetA', { state: 'failed' });
    show('book1');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledWith('book1', '');
    expect(retry).toHaveBeenCalledWith('book1', 'sheetA');
  });
});
