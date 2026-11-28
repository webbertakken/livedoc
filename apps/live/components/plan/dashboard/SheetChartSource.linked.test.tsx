// @vitest-environment jsdom
// docs/specs/029-sheets/plan-links.md "The Sheet Chart from a spreadsheet" (D508): Choose a Chart on a spreadsheet's
// sheet lists its charts and makes a new one over a range; either hands the slot the spreadsheet's chart.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySheetWrite, emptySheet, NOBODY, Workbook, type Sheet } from '@livedoc/sheets';
import { DashboardContext, type DashboardContextValue } from './dashboard-context';
import type { LinkedRead } from './linked-sheets';
import { SheetChartSource } from './SheetChartSource';

vi.mock('@/lib/api/documents', () => ({ apiListDocuments: vi.fn(async () => []) }));
vi.mock('./useSheetReader', async (actual) => ({
  ...(await actual<typeof import('./useSheetReader')>()),
  useSheetRead: () => ({ state: 'none' }),
  useSheetStore: () => ({ store: null, version: 0, locale: 'en-GB' }),
}));
vi.mock('@/hooks/sheets/useSheetsBridge', () => {
  const bridge = { scope: { ownerId: 'owner', documentId: 'plan1' } };
  return { useSheetsBridgeContext: () => bridge };
});
const reads = new Map<string, LinkedRead>();
const LOADING: LinkedRead = { state: 'loading' };
vi.mock('./linked-sheets', () => ({
  subscribeLinkedRead: () => () => {},
  linkedRead: (documentId: string, sheetId: string) =>
    reads.get(`${documentId}:${sheetId}`) ?? LOADING,
  retryLinkedRead: vi.fn(),
}));
afterEach(() => {
  cleanup();
  reads.clear();
});

function sheet(): Sheet {
  const s = applySheetWrite(
    emptySheet({
      id: 'sheetA',
      tabId: 'tabA',
      title: 'Costs',
      layout: { rows: ['r1', 'r2', 'r3'], cols: ['c1', 'c2'] },
    }),
    { kind: 'cells', cells: [{ r: 'r1', c: 'c1', i: { s: 'Rent' } }] },
    { now: 0, by: NOBODY },
  ).sheet;
  const chart = {
    id: 'ch1',
    kind: 'chart' as const,
    type: 'pie' as const,
    at: { r: 'r1', c: 'c1', dx: 0, dy: 0 },
    width: 300,
    height: 200,
    range: { r1: 'r1', c1: 'c1', r2: 'r3', c2: 'c2' },
  };
  return { ...s, layout: { ...s.layout, objects: [chart] } };
}
function ready(sh: Sheet): LinkedRead {
  return {
    state: 'ready',
    sheet: sh,
    wb: new Workbook({ sheets: [sh], locale: 'en-GB' }),
    locale: 'en-GB',
    version: 1,
    name: 'Money',
    sheets: [{ id: 'sheetA', title: 'Costs' }],
  };
}

function show() {
  const value = {
    tabs: [],
    elements: new Map(),
    canEdit: true,
    actions: {} as DashboardContextValue['actions'],
    openTab: vi.fn(),
    tabStatus: () => 'loaded',
    retryTab: vi.fn(),
    loadAllTabs: vi.fn(),
  } satisfies DashboardContextValue;
  const onChoose = vi.fn();
  const onChooseLinked = vi.fn();
  const onClose = vi.fn();
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  render(
    <DashboardContext.Provider value={value}>
      <SheetChartSource
        anchor={anchor}
        initialDocumentId="book1"
        initialSheetId="sheetA"
        onChoose={onChoose}
        onChooseLinked={onChooseLinked}
        onClose={onClose}
      />
    </DashboardContext.Provider>,
  );
  return { onChoose, onChooseLinked, onClose };
}

describe('Choose a Chart on a spreadsheet’s sheet', () => {
  it('lists its charts, and one picked fills the slot by its id', () => {
    reads.set('book1:', ready(sheet()));
    reads.set('book1:sheetA', ready(sheet()));
    const { onChoose, onChooseLinked, onClose } = show();
    expect(screen.getByRole('button', { name: 'Costs · Money', pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pie Chart · A1:B3' }));
    expect(onChooseLinked).toHaveBeenCalledWith({
      type: 'sheet-chart',
      documentId: 'book1',
      sheetId: 'sheetA',
      chartId: 'ch1',
    });
    expect(onChoose).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('makes a new chart over a range of the sheet, refusing one that is not', () => {
    reads.set('book1:sheetA', ready(sheet()));
    const { onChooseLinked } = show();
    const range = screen.getByRole('textbox', { name: 'Range' });
    fireEvent.change(range, { target: { value: 'A1:Z9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Chart' }));
    expect(screen.getByRole('alert').textContent).toBe('Not a range on this sheet');
    fireEvent.change(range, { target: { value: 'a1:b2' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Line' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Chart' }));
    expect(onChooseLinked).toHaveBeenCalledWith({
      type: 'sheet-chart',
      documentId: 'book1',
      sheetId: 'sheetA',
      range: { r1: 'r1', c1: 'c1', r2: 'r2', c2: 'c2' },
      chartType: 'line',
    });
  });

  it('says when the spreadsheet cannot be read', () => {
    reads.set('book1:sheetA', { state: 'denied' });
    show();
    expect(
      screen.getAllByText('You don’t have access to this spreadsheet.').length,
    ).toBeGreaterThan(0);
  });
});
