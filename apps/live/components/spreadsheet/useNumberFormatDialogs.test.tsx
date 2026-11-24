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
import { useNumberFormatDialogs } from './useNumberFormatDialogs';

beforeAll(stubResizeObserver);

// The menu items' presses, as buttons the test presses.
function Host({ actions }: { actions: SheetActions }) {
  const { openCustomFormat, openCustomCurrency, openCustomDateTime, dialog } =
    useNumberFormatDialogs(actions);
  return (
    <>
      <button type="button" onClick={openCustomFormat}>
        Custom Number Format
      </button>
      <button type="button" onClick={openCustomCurrency}>
        Custom Currency
      </button>
      <button type="button" onClick={openCustomDateTime}>
        Custom Date and Time
      </button>
      {dialog}
    </>
  );
}
const openDialog = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Custom Number Format' }));

describe('useNumberFormatDialogs', () => {
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

  // formatting.md "Number formats" (D195): Custom Currency's pick formats the selection as Custom.
  it('applies a currency\u2019s format from Custom Currencies', async () => {
    const h = await makeSheet({ cells: { A1: '1000.12' } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom Currency' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search currencies' }), {
      target: { value: 'EUR' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /^Euro/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^1,000\.12€/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const sheet = h.store.sheet(SHEET_ID)!;
    expect(
      sheet.cells.get(cellKey(sheet.layout.rows[0]!, sheet.layout.cols[0]!))?.format,
    ).toMatchObject({
      nf: 'custom',
      nc: '#,##0.00"€"',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // formatting.md "Number formats" (D198): a preset applied from Custom Date and Time.
  it('applies a preset from Custom Date and Time', async () => {
    const h = await makeSheet({ cells: { A1: '1' } });
    renderSheet(h, ({ actions }) => <Host actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom Date and Time' }));
    fireEvent.click(screen.getByRole('button', { name: /, mmmm yyyy$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const sheet = h.store.sheet(SHEET_ID)!;
    expect(
      sheet.cells.get(cellKey(sheet.layout.rows[0]!, sheet.layout.cols[0]!))?.format,
    ).toMatchObject({ nf: 'custom', nc: 'mmmm yyyy' });
  });
});
