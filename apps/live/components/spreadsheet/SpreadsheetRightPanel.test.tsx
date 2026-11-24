// @vitest-environment jsdom
// conditional-formatting.md "In a spreadsheet" (D213): Format › Conditional Formatting opens the Conditional Format
// Rules side panel, the popover's list and form in the shell's frame; its × closes it.
import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
} from '@/components/sheets/sheet-ui-test-utils';
import { OpenPanels } from '@/lib/office/office-panels';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import { SpreadsheetRightPanel } from './SpreadsheetRightPanel';

beforeAll(stubResizeObserver);

const panelsOf = (right: string | null): OfficePanelsState => ({
  open: { ...OpenPanels.none, right },
  actions: {},
  close: vi.fn(),
  reveal: vi.fn(),
  focusNonce: 0,
  width: 360,
  setWidth: vi.fn(),
  saveWidth: vi.fn(),
});

describe('SpreadsheetRightPanel', () => {
  it('holds the rule list and form for the selection, and closes by its ×', async () => {
    const h = await makeSheet({ cells: { A1: '5' } });
    const panels = panelsOf('conditional-format-rules');
    renderSheet(h, ({ actions }) => <SpreadsheetRightPanel panels={panels} actions={actions} />, {
      at: 'A1',
    });
    const panel = screen.getByRole('complementary', { name: 'Conditional Format Rules' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Another Rule' }));
    // Done writes the rule and returns to the list, the panel still open (D213).
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(h.store.sheet(SHEET_ID)!.layout.formatRules).toHaveLength(1);
    expect(panel.textContent).toContain('A1');
    expect(screen.getByRole('button', { name: 'Add Another Rule' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close Conditional Format Rules' }));
    expect(panels.close).toHaveBeenCalledWith('right');
  });

  it('holds Alternating Colours for the selection', async () => {
    const h = await makeSheet({ cells: { A1: '5' } });
    renderSheet(
      h,
      ({ actions }) => (
        <SpreadsheetRightPanel panels={panelsOf('alternating-colours')} actions={actions} />
      ),
      { at: 'A1:B3' },
    );
    expect(screen.getByRole('complementary', { name: 'Alternating Colours' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Alternating Colours' }));
    expect(h.store.sheet(SHEET_ID)!.layout.bands).toHaveLength(1);
  });

  it('draws nothing while no panel of its own is open', async () => {
    const h = await makeSheet({ cells: {} });
    renderSheet(h, ({ actions }) => (
      <SpreadsheetRightPanel panels={panelsOf(null)} actions={actions} />
    ));
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
