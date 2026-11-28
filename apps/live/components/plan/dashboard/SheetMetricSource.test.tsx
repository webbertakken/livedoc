// @vitest-environment jsdom
// docs/specs/029-sheets/plan-links.md "Dashboards": a figure's source is a Sheet of the document or a sheet of one of
// the person's spreadsheets; picking another sheet, of either, starts its cells afresh.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SheetMetricContent, Tab } from '@livedoc/document';
import { DashboardContext, type DashboardContextValue } from './dashboard-context';
import { SheetMetricSource } from './SheetMetricSource';

vi.mock('@/hooks/sheets/useSheetsBridge', () => ({ useSheetsBridgeContext: () => null }));
vi.mock('./SpreadsheetSheetSource', () => ({
  SpreadsheetSheetSource: ({
    onPick,
  }: {
    onPick: (link: { documentId: string; sheetId: string }) => void;
  }) => (
    <button type="button" onClick={() => onPick({ documentId: 'book1', sheetId: 'sheetB' })}>
      Income · Money
    </button>
  ),
}));
afterEach(cleanup);

const planSheetTab = {
  id: 't1',
  name: 'Budget',
  kind: 'sheet',
  elements: [{ id: 'e', type: 'shape', shape: 'plan-sheet', planSheet: { sheetId: 'ownSheet' } }],
} as unknown as Tab;

function open(content: SheetMetricContent) {
  const onChange = vi.fn();
  const value = {
    tabs: [planSheetTab],
    elements: new Map(),
    canEdit: true,
    actions: {} as DashboardContextValue['actions'],
    openTab: vi.fn(),
    tabStatus: () => 'loaded' as const,
    retryTab: vi.fn(),
  } satisfies DashboardContextValue;
  render(
    <DashboardContext.Provider value={value}>
      <SheetMetricSource
        anchor={document.body}
        content={content}
        onChange={onChange}
        onClose={vi.fn()}
      />
    </DashboardContext.Provider>,
  );
  return onChange;
}

describe('a figure’s source', () => {
  it('picks a sheet of a spreadsheet, its cells starting afresh', () => {
    const onChange = open({
      type: 'sheet-metric',
      metric: 'figure',
      sheetId: 'ownSheet',
      cell: { r: 'row1', c: 'col1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Income · Money' }));
    expect(onChange).toHaveBeenCalledWith({
      type: 'sheet-metric',
      metric: 'figure',
      documentId: 'book1',
      sheetId: 'sheetB',
    });
  });

  it('picks a Sheet of the document again, leaving the spreadsheet', () => {
    const onChange = open({
      type: 'sheet-metric',
      metric: 'trend',
      documentId: 'book1',
      sheetId: 'sheetB',
      col: 'col1',
    });
    // The document's own Sheet is not the one chosen.
    const own = screen.getByRole('button', { name: /Budget/ });
    expect(own.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(own);
    expect(onChange).toHaveBeenCalledWith({
      type: 'sheet-metric',
      metric: 'trend',
      sheetId: 'ownSheet',
    });
  });

  it('changes nothing when the sheet chosen is picked again', () => {
    const onChange = open({
      type: 'sheet-metric',
      metric: 'figure',
      documentId: 'book1',
      sheetId: 'sheetB',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Income · Money' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
