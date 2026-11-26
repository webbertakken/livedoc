// @vitest-environment jsdom
// conditional-formatting.md "In a spreadsheet" (D213): Format › Conditional Formatting opens the Conditional Format
// Rules side panel, the popover's list and form in the shell's frame; its × closes it.
import { act, fireEvent, screen } from '@testing-library/react';
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

  // data-validation.md "In a spreadsheet": the Data Validation Rules panel.
  it('lists the sheet’s validation rules, adds one over the selection, edits and deletes it', async () => {
    const h = await makeSheet({ cells: { A1: 'To Do', A2: 'Done' } });
    renderSheet(
      h,
      ({ actions }) => (
        <SpreadsheetRightPanel panels={panelsOf('data-validation-rules')} actions={actions} />
      ),
      { at: 'B1:B4' },
    );
    expect(screen.getByRole('complementary', { name: 'Data Validation Rules' })).toBeTruthy();
    expect(screen.getByText('No validation rules on this sheet yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Criteria' }), {
      target: { value: 'check' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const rules = () => h.store.sheet(SHEET_ID)!.layout.rules ?? [];
    expect(rules()).toMatchObject([{ is: 'check' }]);
    const list = screen.getByRole('list', { name: 'Validation rules' });
    expect(list.textContent).toContain('Checkbox');
    expect(list.textContent).toContain('B1:B4');
    fireEvent.click(screen.getByRole('button', { name: /^Checkbox/ }));
    expect(screen.getByRole('button', { name: 'Remove Rule' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Rule' }));
    expect(rules()).toEqual([]);
  });

  it('opens on the active cell’s rule, or a new dropdown when asked', async () => {
    const h = await makeSheet({ cells: { A1: 'To Do', A2: 'Done' } });
    let add: (g: { r1: number; c1: number; r2: number; c2: number }) => void = () => {};
    const view = renderSheet(
      h,
      ({ actions }) => {
        add = actions.addCheckbox;
        return null;
      },
      { at: 'C2' },
    );
    act(() => add({ r1: 0, c1: 2, r2: 3, c2: 2 }));
    view.unmount();
    renderSheet(
      h,
      ({ actions }) => (
        <SpreadsheetRightPanel panels={panelsOf('data-validation-rules')} actions={actions} />
      ),
      { at: 'C2' },
    );
    expect(screen.getByRole('button', { name: 'Remove Rule' })).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Criteria' }).value).toBe(
      'check',
    );
  });

  it('starts a new dropdown from the values in the selection', async () => {
    const h = await makeSheet({ cells: { A1: 'To Do', A2: 'Done' } });
    // Opened once the selection is made, as Insert › Dropdown opens it.
    let right: string | null = null;
    renderSheet(
      h,
      ({ actions }) => (
        <SpreadsheetRightPanel
          panels={panelsOf(right)}
          actions={actions}
          validation={{ nonce: 1, startNew: true }}
        />
      ),
      { at: 'A1:A2' },
    );
    right = 'data-validation-rules';
    act(() => h.select('A1:B2'));
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Criteria' }).value).toBe(
      'list',
    );
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Option 1' }).value).toBe('To Do');
  });
});
