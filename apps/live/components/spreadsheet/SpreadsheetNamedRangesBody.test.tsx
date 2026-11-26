// @vitest-environment jsdom
// data-tools.md "Named ranges and named functions": Data › Named Ranges' panel lists the workbook's names, goes to
// each (opening its sheet), and lets an Editor add, edit (rename, move) and remove one; others read it.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import { SheetNavigationContext } from '@/components/sheets/sheet-navigation';
import { OpenPanels } from '@/lib/office/office-panels';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import { SpreadsheetRightPanel } from './SpreadsheetRightPanel';
import { RANGE_UNREAD } from './NamedRangeForm';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
const { debugLog } = await import('@/lib/debug-log');

beforeAll(stubResizeObserver);

const OTHER = 'other0000';
const panels: OfficePanelsState = {
  open: { ...OpenPanels.none, right: 'named-ranges' },
  actions: {},
  close: vi.fn(),
  reveal: vi.fn(),
  focusNonce: 0,
  width: 360,
  setWidth: vi.fn(),
  saveWidth: vi.fn(),
};

function nameOn(h: SheetHarness, sheetId: string, name: string, r = 0) {
  const { rows, cols } = h.store.sheet(sheetId)!.layout;
  h.store.write(sheetId, {
    kind: 'layout',
    changes: [
      { k: 'name', name, range: { r1: rows[r]!, c1: cols[0]!, r2: rows[r]!, c2: cols[0]! } },
    ],
  });
}

function show(
  h: SheetHarness,
  opts: { canShape?: boolean; startAdding?: boolean; at?: string } = {},
) {
  const open = vi.fn();
  renderSheet(
    h,
    ({ actions }) => (
      <SheetNavigationContext.Provider value={open}>
        <SpreadsheetRightPanel
          panels={panels}
          actions={actions}
          named={{ nonce: 0, startAdding: opts.startAdding ?? false }}
        />
      </SheetNavigationContext.Provider>
    ),
    { canShape: opts.canShape ?? true, at: opts.at ?? 'B2:B4' },
  );
  return { open };
}

const field = (name: 'Name' | 'Range') => screen.getByLabelText<HTMLInputElement>(name);
const type = (name: 'Name' | 'Range', value: string) =>
  fireEvent.change(field(name), { target: { value } });
const done = () => fireEvent.click(screen.getByRole('button', { name: 'Done' }));
const namesOf = (h: SheetHarness, id: string) => h.store.sheet(id)!.layout.names;

describe('the Named Ranges panel', () => {
  it('opens on Add a Range over the selection for an Editor while there are none, and names it', async () => {
    const h = await makeSheet({ otherTitles: ['Rates'] });
    show(h);
    expect(screen.getByRole('complementary', { name: 'Named Ranges' })).toBeTruthy();
    expect(field('Range').value).toBe('B2:B4');
    expect(document.activeElement).toBe(field('Name'));
    type('Name', ' Amounts ');
    done();
    expect(namesOf(h, SHEET_ID)).toMatchObject([{ name: 'Amounts' }]);
    const list = screen.getByRole('list', { name: 'Named ranges' });
    expect(within(list).getByRole('button', { name: 'Go To Amounts' }).textContent).toContain(
      'B2:B4',
    );
  });

  it('lists every sheet’s names in name order and goes to each, opening another sheet', async () => {
    const h = await makeSheet({ otherTitles: ['Rates'] });
    nameOn(h, SHEET_ID, 'zeta', 3);
    nameOn(h, OTHER, 'Alpha', 1);
    const { open } = show(h);
    const rows = within(screen.getByRole('list', { name: 'Named ranges' })).getAllByRole('button', {
      name: /^Go To/,
    });
    expect(rows.map((b) => b.textContent)).toEqual(['AlphaRates!A2', 'zetaA4']);
    fireEvent.click(rows[0]!);
    expect(open).toHaveBeenCalledWith(OTHER, { r1: 1, c1: 0, r2: 1, c2: 0 });
    fireEvent.click(rows[1]!);
    expect(h.ctl().selection.ranges).toEqual([{ r1: 3, c1: 0, r2: 3, c2: 0 }]);
  });

  it('renames a name and moves it to another sheet, each one change', async () => {
    const h = await makeSheet({ otherTitles: ['Rates'] });
    nameOn(h, SHEET_ID, 'Rate');
    show(h);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Rate' }));
    expect([field('Name').value, field('Range').value]).toEqual(['Rate', 'A1']);
    type('Name', 'TaxRate');
    done();
    expect(namesOf(h, SHEET_ID)).toMatchObject([{ name: 'TaxRate' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit TaxRate' }));
    type('Range', 'Rates!A2:B2');
    done();
    expect(namesOf(h, SHEET_ID)).toBeUndefined();
    const { rows, cols } = h.store.sheet(OTHER)!.layout;
    expect(namesOf(h, OTHER)).toEqual([
      { name: 'TaxRate', r1: rows[1], c1: cols[0], r2: rows[1], c2: cols[1] },
    ]);
    expect(debugLog).toHaveBeenCalledWith('[workbook] named range moved', {});
  });

  it('says why under the field when a name is taken in the workbook or a range cannot be read', async () => {
    const h = await makeSheet({ otherTitles: ['Rates'] });
    nameOn(h, OTHER, 'Rate');
    show(h, { startAdding: true });
    type('Name', 'rate');
    done();
    expect(screen.getByRole('alert').textContent).toBe('Another named range is called that');
    expect(debugLog).toHaveBeenCalledWith('[workbook] named range refused', { reason: 'name' });
    type('Name', 'Tax');
    expect(screen.queryByRole('alert')).toBeNull();
    type('Range', 'Nowhere!A1');
    done();
    expect(screen.getByRole('alert').textContent).toBe(RANGE_UNREAD);
    type('Range', 'Z99');
    done();
    expect(screen.getByRole('alert').textContent).toBe(RANGE_UNREAD);
    expect(namesOf(h, SHEET_ID)).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Go To Rate' })).toBeTruthy();
  });

  // D297: a name on two sheets is listed twice; editing one checks it against the other.
  it('lists a name two sheets hold with each sheet, and editing one asks for another name', async () => {
    const h = await makeSheet({ otherTitles: ['Rates'] });
    nameOn(h, SHEET_ID, 'Rate');
    nameOn(h, OTHER, 'Rate');
    show(h);
    expect(screen.getAllByRole('button', { name: 'Go To Rate' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Rate' })[0]!);
    done();
    expect(screen.getByRole('alert').textContent).toBe('Another named range is called that');
  });

  it('removes a name as one change', async () => {
    const h = await makeSheet({ otherTitles: ['Rates'] });
    nameOn(h, OTHER, 'Rate');
    show(h);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Rate' }));
    expect(namesOf(h, OTHER)).toBeUndefined();
    expect(screen.getByText('No named ranges yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a Range' }));
    expect(field('Name')).toBeTruthy();
  });

  it('opens on Add a Range when asked (Define Named Range), whatever the list holds', async () => {
    const h = await makeSheet();
    nameOn(h, SHEET_ID, 'Rate');
    show(h, { startAdding: true, at: 'C3' });
    expect(field('Range').value).toBe('C3');
    // Cells picked while the form is open fill the range, until it is typed over.
    act(() => h.select('D1:D2'));
    expect(field('Range').value).toBe('D1:D2');
    type('Range', 'A1');
    act(() => h.select('E5'));
    expect(field('Range').value).toBe('A1');
  });

  it('is read only for a Participant or Viewer, who still goes to each name', async () => {
    const empty = await makeSheet();
    show(empty, { canShape: false, startAdding: true });
    expect(screen.getByText('No named ranges.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a Range' })).toBeNull();
  });

  it('shows a Participant the names with Go To alone', async () => {
    const h = await makeSheet();
    nameOn(h, SHEET_ID, 'Rate', 2);
    show(h, { canShape: false });
    expect(screen.queryByRole('button', { name: 'Edit Rate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Rate' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Go To Rate' }));
    expect(h.ctl().selection.active).toEqual({ r: 2, c: 0 });
  });
});
