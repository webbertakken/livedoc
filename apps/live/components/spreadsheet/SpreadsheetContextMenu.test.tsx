// @vitest-environment jsdom
// docs/specs/029-sheets/surface.md "Context menus": a cell's, a row number's and a column letter's menu on a
// spreadsheet, the menus' items in Google's order, by role, run by the grid's bindings.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenMenu } from '@/components/sheets/sheet-controller';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { track } from '@/lib/telemetry';
import { SpreadsheetGridMenus } from './SpreadsheetContextMenu';
import { useGridMenuBindings } from './useGridMenuBindings';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
const clip = vi.hoisted(() => ({
  copyNow: vi.fn(),
  pasteNow: vi.fn(async () => {}),
  pasteSpecial: vi.fn(async () => {}),
}));
vi.mock('@/components/sheets/useSheetClipboard', () => ({ useSheetClipboard: () => clip }));

beforeAll(stubResizeObserver);

function Menus({ actions }: { actions: SheetActions }) {
  const office = useGridMenuBindings(
    actions,
    {
      openCustomFormat: vi.fn(),
      openCustomCurrency: vi.fn(),
      openCustomDateTime: vi.fn(),
      merge: vi.fn(),
      openCustomAngle: vi.fn(),
      openSortRange: vi.fn(),
    },
    // The side panels' items, as SpreadsheetSheetParts binds them.
    {
      'conditional-formatting': { run: vi.fn(), checked: false },
      'data-validation': { run: vi.fn(), checked: false },
      'convert-to-table': { run: vi.fn() },
      'column-stats': { run: vi.fn() },
      // Insert Link, as useSpreadsheetLinks binds it for an Editor.
      'insert-link': { run: vi.fn() },
    },
  );
  return <SpreadsheetGridMenus actions={actions} bound={office.actions} />;
}

const menu = () => screen.queryByRole('menu', { name: 'Context menu' });
// Every item, a check (Conditional Formatting, which opens its panel) as any other.
const names = () =>
  [...menu()!.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')].map(
    (i) => i.querySelector('.flex-1')?.textContent ?? '',
  );
const item = (name: string) =>
  within(menu()!)
    .getAllByRole('menuitem')
    .find((i) => i.querySelector('.flex-1')?.textContent === name)!;
const layout = (h: SheetHarness) => h.store.sheet(SHEET_ID)!.layout;

function show(
  h: SheetHarness,
  open: OpenMenu,
  opts: { canEdit?: boolean; canShape?: boolean; at?: string } = {},
) {
  renderSheet(h, ({ actions }) => <Menus actions={actions} />, opts);
  act(() => h.ctl().setMenu(open));
}

const CELL: OpenMenu = { kind: 'cell', x: 20, y: 20 };
const ROW: OpenMenu = { kind: 'header', axis: 'r', index: 1, x: 5, y: 40 };
const COLUMN: OpenMenu = { kind: 'header', axis: 'c', index: 1, x: 60, y: 5 };

describe('the spreadsheet cell menu', () => {
  let h: SheetHarness;
  beforeEach(async () => {
    vi.mocked(track).mockClear();
    clip.copyNow.mockClear();
    h = await makeSheet({
      cells: { A1: '1', A2: '2', B1: '=HYPERLINK("https://example.com","x")' },
    });
  });

  it("draws an Editor's items in Google's order, what is not built dimmed, and counts its open", () => {
    show(h, CELL);
    expect(names()).toEqual([
      'Cut',
      'Copy',
      'Paste',
      'Paste Special',
      'Insert 1 Row Above',
      'Insert 1 Column Left',
      'Insert Cells',
      'Delete Row 1',
      'Delete Column A',
      'Delete Cells',
      'Create a Filter',
      'Filter by Cell Value',
      'Show Edit History',
      'Conditional Formatting',
      'Data Validation',
      'Insert Link',
      'Comment',
      'Insert Note',
      'Convert to Table',
      'View More Cell Actions',
    ]);
    expect(item('Filter by Cell Value').getAttribute('aria-disabled')).toBe('true');
    expect(item('Cut').getAttribute('aria-disabled')).toBeNull();
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'SpreadsheetContextMenu');
  });

  it('runs an item through the grid and closes', () => {
    show(h, CELL);
    fireEvent.click(item('Cut'));
    expect(clip.copyNow).toHaveBeenCalledWith(true);
    expect(menu()).toBeNull();
    expect(h.ctl().menu).toBeNull();
  });

  it('gives a Viewer Copy and what anyone may use', () => {
    show(h, CELL, { canEdit: false });
    expect(names()).toEqual(['Copy', 'View More Cell Actions']);
  });

  it('gives a Participant the clipboard, Values Only and Comment', () => {
    show(h, CELL, { canShape: false });
    expect(names()).toEqual([
      'Cut',
      'Copy',
      'Paste',
      'Paste Special',
      'Comment',
      'View More Cell Actions',
    ]);
  });

  it('heads the menu with Open Link over a link, for anyone (D189)', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    show(h, CELL, { canEdit: false, at: 'B1' });
    expect(names()[0]).toBe('Open Link');
    fireEvent.click(item('Open Link'));
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});

describe('the spreadsheet header menus', () => {
  let h: SheetHarness;
  beforeEach(async () => {
    h = await makeSheet({ cells: { A1: 'b', A2: 'a', B2: 'x' } });
  });

  it("draws a row number's items and hides the row", () => {
    show(h, ROW, { at: 'A2:Z2' });
    expect(names()).toContain('Clear Row 2');
    expect(names().slice(4, 10)).toEqual([
      'Insert 1 Row Above',
      'Insert 1 Row Below',
      'Delete Row 2',
      'Clear Row 2',
      'Hide Row 2',
      'Resize Row 2',
    ]);
    fireEvent.click(item('Hide Row 2'));
    expect(layout(h).hiddenRows).toHaveLength(1);
  });

  // parity-matrix.md "Context menu: a row header", "a column header": Conditional Formatting, built.
  it('offers Conditional Formatting on a row number and a column letter', () => {
    show(h, ROW, { at: 'A2:Z2' });
    expect(names()).toContain('Conditional Formatting');
    expect(item('Conditional Formatting').getAttribute('aria-disabled')).toBeNull();
    act(() => h.ctl().setMenu(COLUMN));
    expect(names()).toContain('Conditional Formatting');
    expect(item('Conditional Formatting').getAttribute('aria-disabled')).toBeNull();
  });

  it('opens the Resize dialog over the row, which stays open', () => {
    show(h, ROW, { at: 'A2:Z2' });
    fireEvent.click(item('Resize Row 2'));
    expect(h.ctl().menu).toEqual({ kind: 'resize', axis: 'r', from: 1, to: 1 });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it("draws a column letter's items, sorting the sheet by it and clearing it", () => {
    show(h, COLUMN, { at: 'A1:A100' });
    expect(names()).toContain('Column Stats');
    fireEvent.click(item('Sort Sheet A to Z'));
    expect(h.value('A1')).toBe('a');
    act(() => h.ctl().setMenu(COLUMN));
    fireEvent.click(item('Clear Column A'));
    expect(h.value('A1')).toBeNull();
    expect(menu()).toBeNull();
  });
});
