// @vitest-environment jsdom
// docs/specs/026-plan/plan-tabs.md "Sheet Chart": an Editor changes a slot's Sheet Chart from Change Chart in the slot's
// cog; anyone else gets no Change Chart.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSlot, ShapeElement } from '@livedoc/document';
import { DashboardContext, type DashboardContextValue } from './dashboard-context';
import { SlotSection } from './SlotSection';

vi.mock('./SheetChartSource', () => ({
  SheetChartSource: ({
    initialSheetId,
    initialDocumentId,
    onChoose,
    onChooseLinked,
  }: {
    initialSheetId: string;
    initialDocumentId: string;
    onChoose: (c: { id: string }) => void;
    onChooseLinked: (c: unknown) => void;
  }) =>
    initialDocumentId ? (
      <button
        type="button"
        onClick={() => onChooseLinked({ type: 'sheet-chart', chartId: 'other' })}
      >
        Picker on {initialDocumentId} {initialSheetId}
      </button>
    ) : (
      <button type="button" onClick={() => onChoose({ id: 'new' })}>
        Picker on {initialSheetId}
      </button>
    ),
}));

afterEach(cleanup);

const chart = {
  id: 'c',
  type: 'shape',
  shape: 'bar-chart',
  chartSource: { sheetId: 'sheetAAAA' },
} as unknown as ShapeElement;
const slot = { id: 's1', span: 6, content: { type: 'element', elementId: 'c' } } as DashboardSlot;

function show(canEdit: boolean, shown: DashboardSlot = slot) {
  const placeItem = vi.fn();
  const onClose = vi.fn();
  const value = {
    tabs: [],
    elements: new Map([['c', chart]]),
    canEdit,
    actions: { placeItem, setSlotContent: vi.fn(), removeSlot: vi.fn(), changeDashboard: vi.fn() },
    openTab: vi.fn(),
    tabStatus: () => 'loaded',
    retryTab: vi.fn(),
  } as unknown as DashboardContextValue;
  render(
    <DashboardContext.Provider value={value}>
      <SlotSection
        rowId="r"
        slot={shown}
        at={{ slot: 0, row: 0, slots: 2 }}
        open
        onToggle={vi.fn()}
        onClose={onClose}
      />
    </DashboardContext.Provider>,
  );
  return { placeItem, onClose };
}

describe('Change Chart in a Sheet Chart slot’s cog', () => {
  it('replaces the slot’s chart with the one chosen, and closes the cog', () => {
    const { placeItem, onClose } = show(true);
    fireEvent.click(screen.getByRole('button', { name: 'Change Chart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Picker on sheetAAAA' }));
    expect(placeItem).toHaveBeenCalledWith(
      { kind: 'sheet-chart', chart: { id: 'new' } },
      { kind: 'slot', slotId: 's1' },
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('is not offered to a Participant or a Viewer', () => {
    show(false);
    expect(screen.queryByRole('button', { name: 'Change Chart' })).toBeNull();
  });
});

// docs/specs/029-sheets/plan-links.md "The Sheet Chart from a spreadsheet".
describe('Change Chart on a spreadsheet’s chart', () => {
  it('opens Choose a Chart on its spreadsheet’s sheet, and a choice replaces the slot’s chart', () => {
    const linked = {
      id: 's1',
      span: 6,
      content: { type: 'sheet-chart', documentId: 'book1', sheetId: 'sheetA', chartId: 'ch1' },
    } as DashboardSlot;
    const { placeItem, onClose } = show(true, linked);
    fireEvent.click(screen.getByRole('button', { name: 'Change Chart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Picker on book1 sheetA' }));
    expect(placeItem).toHaveBeenCalledWith(
      { kind: 'sheet-chart', linked: { type: 'sheet-chart', chartId: 'other' } },
      { kind: 'slot', slotId: 's1' },
    );
    expect(onClose).toHaveBeenCalled();
  });
});
