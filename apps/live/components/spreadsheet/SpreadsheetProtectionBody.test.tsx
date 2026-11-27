// @vitest-environment jsdom
// data-tools.md "Protected ranges": Protect Sheets and Ranges lists the workbook's protections and goes to each; an
// Editor adds a range or a sheet (with exceptions), edits and removes one that admits them; others read it.
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Protection } from '@livedoc/sheets';
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
import { PROTECTED_RANGE_UNREAD, type ProtectionStart } from './ProtectionForm';
import { NOTHING_PROTECTED, NOTHING_PROTECTED_YET } from './SpreadsheetProtectionBody';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

beforeAll(stubResizeObserver);

const OTHER = 'other0000';
const panels: OfficePanelsState = {
  open: { ...OpenPanels.none, right: 'protected-ranges' },
  actions: {},
  close: vi.fn(),
  reveal: vi.fn(),
  focusNonce: 0,
  width: 360,
  setWidth: vi.fn(),
  saveWidth: vi.fn(),
};

function protect(h: SheetHarness, sheetId: string, p: Protection) {
  h.store.write(sheetId, {
    kind: 'layout',
    changes: [{ k: 'protection', id: p.id, protection: p }],
  });
}

function show(
  h: SheetHarness,
  opts: { canShape?: boolean; start?: ProtectionStart | null; at?: string } = {},
) {
  const open = vi.fn();
  renderSheet(
    h,
    ({ actions }) => (
      <SheetNavigationContext.Provider value={open}>
        <SpreadsheetRightPanel
          panels={panels}
          actions={actions}
          protection={{ nonce: 0, start: opts.start ?? null }}
        />
      </SheetNavigationContext.Provider>
    ),
    { canShape: opts.canShape ?? true, at: opts.at ?? 'B2:C3' },
  );
  return { open };
}

const done = () => fireEvent.click(screen.getByRole('button', { name: 'Done' }));
const protectionsOf = (h: SheetHarness, id = SHEET_ID) => h.store.sheet(id)!.layout.protections;

describe('the Protected Sheets and Ranges panel', () => {
  it('opens on a new range over the selection for an Editor while nothing is protected, Editors Only chosen', async () => {
    const h = await makeSheet();
    show(h);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Range' }).value).toBe('B2:C3');
    expect(screen.getByRole('radio', { name: 'Editors Only' })).toHaveProperty('checked', true);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Totals' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Only the Owner' }));
    done();
    const [p] = protectionsOf(h)!;
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    expect(p).toMatchObject({
      can: 'owner',
      description: 'Totals',
      range: { r1: rows[1], c1: cols[1], r2: rows[2], c2: cols[2] },
    });
    expect(screen.getByRole('button', { name: 'Go To Totals' })).toBeTruthy();
  });

  it('says a range it cannot read, and protects another sheet’s range on that sheet', async () => {
    const h = await makeSheet({ otherTitles: ['Rates'] });
    show(h);
    fireEvent.change(screen.getByRole('textbox', { name: 'Range' }), {
      target: { value: 'Nope!A1' },
    });
    done();
    expect(screen.getByRole('alert').textContent).toBe(PROTECTED_RANGE_UNREAD);
    fireEvent.change(screen.getByRole('textbox', { name: 'Range' }), {
      target: { value: 'Rates!A1:A2' },
    });
    done();
    expect(protectionsOf(h)).toBeUndefined();
    expect(protectionsOf(h, OTHER)).toHaveLength(1);
  });

  it('protects a sheet with its exceptions, refusing one off it, when asked by Protect Sheet', async () => {
    const h = await makeSheet({ otherTitles: ['Rates'] });
    show(h, { start: { what: 'sheet', sheetId: OTHER } });
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Sheet' }).value).toBe(OTHER);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Except Certain Cells' }));
    fireEvent.change(screen.getByLabelText('Exception 1'), { target: { value: 'Sheet 1!A1' } });
    done();
    expect(screen.getByRole('alert').textContent).toBe(PROTECTED_RANGE_UNREAD);
    fireEvent.change(screen.getByLabelText('Exception 1'), { target: { value: 'A1:B1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Another Range' }));
    fireEvent.change(screen.getByLabelText('Exception 2'), { target: { value: '' } });
    done();
    const [p] = protectionsOf(h, OTHER)!;
    expect(p!.range).toBeUndefined();
    expect(p!.except).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Go To Rates' })).toBeTruthy();
  });

  it('lists each by its description else where it stands, goes to it, and edits and removes one', async () => {
    const h = await makeSheet({ otherTitles: ['Rates'] });
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    const range = { r1: rows[0]!, c1: cols[0]!, r2: rows[1]!, c2: cols[0]! };
    protect(h, SHEET_ID, { id: 'prot01', range, can: 'warn' });
    protect(h, OTHER, { id: 'prot02', can: 'editors', description: 'Rates locked' });
    const { open } = show(h);
    const list = screen.getByRole('list', { name: 'Protected sheets and ranges' });
    expect(within(list).getByRole('button', { name: 'Go To A1:A2' }).textContent).toContain(
      'Warning',
    );
    fireEvent.click(within(list).getByRole('button', { name: 'Go To Rates locked' }));
    expect(open).toHaveBeenCalledWith(OTHER, { r1: 0, c1: 0, r2: 0, c2: 0 });
    fireEvent.click(within(list).getByRole('button', { name: 'Go To A1:A2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit A1:A2' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Editors Only' }));
    done();
    expect(protectionsOf(h)![0]).toMatchObject({ id: 'prot01', can: 'editors' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove A1:A2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove A1:A2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(protectionsOf(h)).toBeUndefined();
  });

  it('keeps an Editor from editing a protection that does not admit them', async () => {
    const h = await makeSheet();
    protect(h, SHEET_ID, { id: 'prot01', can: 'owner' });
    h.store.setProtection({ owner: false, editor: true }, null);
    show(h);
    expect(screen.getByRole('button', { name: 'Go To Sheet 1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit Sheet 1' })).toBeNull();
  });

  it('is read by a Participant or Viewer, saying so when nothing is protected', async () => {
    const h = await makeSheet();
    show(h, { canShape: false });
    expect(screen.getByText(NOTHING_PROTECTED)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a Sheet or Range' })).toBeNull();
  });

  it('opens on its list for an Editor once something is protected, and adds from there', async () => {
    const h = await makeSheet();
    protect(h, SHEET_ID, { id: 'prot01', can: 'warn' });
    show(h);
    fireEvent.click(screen.getByRole('button', { name: 'Add a Sheet or Range' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(NOTHING_PROTECTED_YET)).toBeNull();
  });
});
