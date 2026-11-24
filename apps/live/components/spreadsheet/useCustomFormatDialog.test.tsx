// @vitest-environment jsdom
// formatting.md "Number formats": Custom Number Format over the open sheet: it reads the active cell, Apply formats
// the selection with the code in one step, and either way the grid has the keys again.
import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
} from '@/components/sheets/sheet-ui-test-utils';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { cellKey } from '@livedoc/sheets';
import { useCustomFormatDialog } from './useCustomFormatDialog';

beforeAll(stubResizeObserver);

// The menu item's press, as a button the test presses.
function Host({ actions }: { actions: SheetActions }) {
  const { open, dialog } = useCustomFormatDialog(actions);
  return (
    <>
      <button type="button" onClick={open}>
        Custom Number Format
      </button>
      {dialog}
    </>
  );
}
const openDialog = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Custom Number Format' }));

describe('useCustomFormatDialog', () => {
  it('opens on the active cell, applies the code to the selection, and closes', async () => {
    const h = await makeSheet({ cells: { A1: '-3', A2: '4' } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />, { at: 'A1:A2' });
    expect(screen.queryByRole('dialog')).toBeNull();
    openDialog();
    expect(screen.getByRole('status').textContent).toBe('Preview: -3.00');
    fireEvent.change(screen.getByRole('textbox', { name: 'Format Code' }), {
      target: { value: '0;[Red](0)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const sheet = h.store.sheet(SHEET_ID)!;
    const format = (r: number) =>
      sheet.cells.get(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[0]!))?.format;
    expect(format(0)).toMatchObject({ nf: 'custom', nc: '0;[Red](0)' });
    expect(format(1)).toMatchObject({ nf: 'custom', nc: '0;[Red](0)' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Cancel, changing nothing', async () => {
    const h = await makeSheet({ cells: { A1: '1' } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const sheet = h.store.sheet(SHEET_ID)!;
    expect(
      sheet.cells.get(cellKey(sheet.layout.rows[0]!, sheet.layout.cols[0]!))?.format,
    ).toBeUndefined();
  });
});
