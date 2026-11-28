// @vitest-environment jsdom
// docs/specs/029-sheets/plan-links.md "The Sheet Chart from a spreadsheet": the chart drawn from the sheet as last
// read, and each way of not drawing it said.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSheetChart, ShapeElement } from '@livedoc/document';
import { applySheetWrite, emptySheet, NOBODY, Workbook, type Sheet } from '@livedoc/sheets';
import { DashboardContext, type DashboardContextValue } from './dashboard-context';
import type { LinkedRead } from './linked-sheets';
import { DashboardLinkedChart } from './DashboardLinkedChart';

vi.mock('./useSheetReader', () => ({ useSheetRead: () => ({ state: 'none' }) }));
vi.mock('@/hooks/sheets/useSheetsBridge', () => {
  const bridge = { scope: { ownerId: 'owner', documentId: 'plan1' } };
  return { useSheetsBridgeContext: () => bridge };
});
vi.mock('@/components/canvas/DataChartView', () => ({
  DataChartView: ({ element }: { element: ShapeElement }) => (
    <div data-testid="chart">
      {element.shape} {element.width}x{element.height} {element.chartTitle}
    </div>
  ),
}));
vi.mock('./DashboardSlotContent', async (load) => ({
  ...(await load<typeof import('./DashboardSlotContent')>()),
  useBoxSize: () => ({ width: 400, height: 260 }),
}));
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
});

function sheetWithChart(): Sheet {
  const sheet = applySheetWrite(
    emptySheet({
      id: 'sheetA',
      tabId: 'tabA',
      title: 'Costs',
      layout: { rows: ['r1', 'r2'], cols: ['c1', 'c2'] },
    }),
    {
      kind: 'cells',
      cells: [
        { r: 'r1', c: 'c1', i: { s: 'Rent' } },
        { r: 'r1', c: 'c2', i: { n: 5 } },
      ],
    },
    { now: 0, by: NOBODY },
  ).sheet;
  const chart = {
    id: 'ch1',
    kind: 'chart' as const,
    type: 'bar' as const,
    at: { r: 'r1', c: 'c1', dx: 0, dy: 0 },
    width: 300,
    height: 200,
    range: { r1: 'r1', c1: 'c1', r2: 'r2', c2: 'c2' },
    title: 'Spend',
  };
  return { ...sheet, layout: { ...sheet.layout, objects: [chart] } };
}
const ready = (sheet: Sheet | null): LinkedRead => ({
  state: 'ready',
  sheet,
  wb: new Workbook({ sheets: sheet ? [sheet] : [], locale: 'en-GB' }),
  locale: 'en-GB',
  version: 1,
  name: 'Money',
  sheets: [{ id: 'sheetA', title: 'Costs' }],
});
const content = (chartId: string): DashboardSheetChart => ({
  type: 'sheet-chart',
  documentId: 'book1',
  sheetId: 'sheetA',
  chartId,
});

function show(c: DashboardSheetChart) {
  const setSlotContent = vi.fn();
  const value = {
    tabs: [],
    elements: new Map(),
    canEdit: true,
    actions: { setSlotContent },
    tabStatus: () => 'loaded',
    loadAllTabs: vi.fn(),
  } as unknown as DashboardContextValue;
  render(
    <DashboardContext.Provider value={value}>
      <DashboardLinkedChart slotId="s1" content={c} />
    </DashboardContext.Provider>,
  );
  return setSlotContent;
}

describe('a Sheet Chart from a spreadsheet in its slot', () => {
  it('draws the spreadsheet’s chart at the slot’s size, named for its type', () => {
    reads.set('book1:sheetA', ready(sheetWithChart()));
    show(content('ch1'));
    expect(screen.getByRole('group', { name: 'Bar chart' })).toBeTruthy();
    expect(screen.getByTestId('chart').textContent).toBe('bar-chart 400x260 Spend');
  });

  it('says a deleted chart was deleted, with Clear Slot', () => {
    reads.set('book1:sheetA', ready(sheetWithChart()));
    const setSlotContent = show(content('gone'));
    expect(screen.getByText('This chart was deleted.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Slot' }));
    expect(setSlotContent).toHaveBeenCalledWith('s1', undefined);
  });

  it('says why it draws nothing: loading, failed, no access, too large, sheet gone', () => {
    show(content('ch1'));
    expect(screen.getByText('Loading the chart…')).toBeTruthy();
    cleanup();
    reads.set('book1:sheetA', { state: 'failed' });
    show(content('ch1'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledWith('book1', 'sheetA');
    expect(screen.getByText(/Couldn’t load the chart/)).toBeTruthy();
    cleanup();
    reads.set('book1:sheetA', { state: 'denied' });
    show(content('ch1'));
    expect(screen.getByText('You don’t have access to this spreadsheet.')).toBeTruthy();
    cleanup();
    reads.set('book1:sheetA', { state: 'too-large' });
    show(content('ch1'));
    expect(screen.getByText('This spreadsheet is too large to read here.')).toBeTruthy();
    cleanup();
    reads.set('book1:sheetA', ready(null));
    show(content('ch1'));
    expect(screen.getByText('This sheet was deleted.')).toBeTruthy();
  });
});
