// @vitest-environment jsdom
// docs/specs/029-sheets/plan-links.md "Dashboards" (D505): a figure's source picker lists the person's own spreadsheets
// as Copy To does, then the sheets of the one picked, each "<Sheet> · <Spreadsheet>", with All Spreadsheets back.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '@livedoc/api-schema';
import { Workbook } from '@livedoc/sheets';
import { apiListDocuments } from '@/lib/api/documents';
import type { LinkedRead } from './linked-sheets';
import { SpreadsheetSheetSource } from './SpreadsheetSheetSource';

vi.mock('@/lib/api/documents', () => ({ apiListDocuments: vi.fn() }));
let bridge: { scope: { ownerId: string; documentId: string } } | null = {
  scope: { ownerId: 'owner', documentId: 'plan1' },
};
vi.mock('@/hooks/sheets/useSheetsBridge', () => ({ useSheetsBridgeContext: () => bridge }));
const reads = new Map<string, LinkedRead>();
// One object, as the store answers a snapshot that has not changed.
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
});

const doc = (id: string, name: string, spreadsheet: boolean) =>
  ({ id, name, ...(spreadsheet ? { spreadsheet: true } : {}) }) as DocumentSummary;
const ready = (sheets: { id: string; title: string }[]): LinkedRead => ({
  state: 'ready',
  sheet: null,
  wb: new Workbook({ sheets: [], locale: 'en-GB' }),
  locale: 'en-GB',
  version: 1,
  name: 'Money',
  sheets,
});

describe('a figure’s spreadsheets', () => {
  it('lists the person’s other spreadsheets, then the sheets of the one picked, and picks a sheet', async () => {
    vi.mocked(apiListDocuments).mockResolvedValue([
      doc('plan1', 'This plan', true),
      doc('book1', 'Money', true),
      doc('d1', 'A diagram', false),
    ]);
    reads.set(
      'book1:',
      ready([
        { id: 'sheetA', title: 'Costs' },
        { id: 'sheetB', title: 'Income' },
      ]),
    );
    const onPick = vi.fn();
    render(<SpreadsheetSheetSource documentId="" sheetId="" onPick={onPick} />);
    expect(screen.getByRole('heading', { name: 'Spreadsheets' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Money' }));
    expect(screen.queryByRole('button', { name: 'A diagram' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Income · Money' }));
    expect(onPick).toHaveBeenCalledWith({ documentId: 'book1', sheetId: 'sheetB' });
    fireEvent.click(screen.getByRole('button', { name: 'All Spreadsheets' }));
    expect(await screen.findByRole('button', { name: 'Money' })).toBeTruthy();
  });

  it('opens on the spreadsheet chosen, its sheet pressed', () => {
    reads.set('book1:', ready([{ id: 'sheetA', title: 'Costs' }]));
    render(<SpreadsheetSheetSource documentId="book1" sheetId="sheetA" onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Costs · Money' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('says while the sheets load, when there are none, and when the spreadsheet cannot be read', () => {
    const at = (read: LinkedRead | null) => {
      cleanup();
      if (read) reads.set('book1:', read);
      render(<SpreadsheetSheetSource documentId="book1" sheetId="" onPick={vi.fn()} />);
    };
    at(null);
    expect(screen.getByText('Finding this spreadsheet’s sheets…')).toBeTruthy();
    at(ready([]));
    expect(screen.getByText('This spreadsheet has no sheets to show.')).toBeTruthy();
    at({ state: 'denied' });
    expect(screen.getByText('You don’t have access to this spreadsheet.')).toBeTruthy();
    at({ state: 'too-large' });
    expect(screen.getByText('This spreadsheet is too large to read here.')).toBeTruthy();
    at({ state: 'failed' });
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(retry).toHaveBeenCalledWith('book1', '');
  });

  it('offers nothing outside the editor', () => {
    bridge = null;
    const { container } = render(
      <SpreadsheetSheetSource documentId="" sheetId="" onPick={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
    bridge = { scope: { ownerId: 'owner', documentId: 'plan1' } };
  });
});
