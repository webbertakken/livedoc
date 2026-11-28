// @vitest-environment jsdom
// A spreadsheet's links in the grid (docs/specs/029-sheets/inserted-objects.md "Links"): Insert Link opens the link
// editor on the active cell, applies one write and counts a new link; the link card shows on a linked active cell,
// opens, copies, edits and removes; a link within the workbook opens its sheet, a gone one says so; Get Link to This
// Cell copies the address; Viewers open and copy alone.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeSheet,
  renderSheet,
  SHEET_ID,
  stubResizeObserver,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import type { CellFormat } from '@livedoc/sheets';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  COPY_LINK,
  EDIT_LINK,
  GET_LINK_TO_CELL,
  INSERT_LINK,
  OPEN_HYPERLINK,
  REMOVE_LINK,
} from '@/lib/spreadsheet/sheet-links';
import { OPEN_LINK, useSpreadsheetLinks } from './useSpreadsheetLinks';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
import { track } from '@/lib/telemetry';

const writeText = vi.fn(async (_: string) => {});
beforeAll(() => {
  stubResizeObserver();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
beforeEach(() => {
  vi.mocked(track).mockClear();
  writeText.mockClear();
});
afterEach(cleanup);

const followSheet = vi.fn();
const DOCUMENTS = [{ id: 'doc9', name: 'Price notes', savedAt: 1 }];

async function setup(
  opts: {
    canEdit?: boolean;
    cells?: Record<string, string>;
    format?: Record<string, CellFormat>;
  } = {},
) {
  const h: SheetHarness = await makeSheet({
    rows: 6,
    cols: 4,
    cells: opts.cells ?? {},
    ...(opts.format ? { format: opts.format } : {}),
    otherTitles: ['Prices'],
  });
  let actions: OfficeActions = {};
  renderSheet(
    h,
    (p) => {
      const links = useSpreadsheetLinks(p.c, {
        documentId: 'd1',
        documents: DOCUMENTS,
        followSheet,
      });
      actions = links.actions;
      return (
        <>
          {links.editor}
          {links.card}
        </>
      );
    },
    { canEdit: opts.canEdit ?? true },
  );
  return { h, actions: () => actions };
}

const editor = () => screen.getByRole('form', { name: 'Link' });
const field = (name: string) => within(editor()).getByRole<HTMLInputElement>('textbox', { name });
const linkField = () => within(editor()).getByRole<HTMLInputElement>('combobox', { name: 'Link' });
const card = () => screen.queryByRole('group', { name: 'Link details' });

describe('Insert Link', () => {
  it('links the active cell, keeping its text, and counts the new link', async () => {
    const { h, actions } = await setup({ cells: { B2: 'Docs' } });
    act(() => h.select('B2'));
    act(() => actions()[INSERT_LINK]!.run());
    expect(field('Text').value).toBe('Docs');
    fireEvent.change(linkField(), { target: { value: 'docs.nu' } });
    fireEvent.submit(editor());
    expect(h.cell('B2')).toMatchObject({ input: { s: 'Docs' }, format: { ln: 'https://docs.nu' } });
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Added', 'Link');
    expect(screen.queryByRole('form', { name: 'Link' })).toBeNull();
  });

  it('offers the sheets, takes one, and puts its name into an empty cell', async () => {
    const { h, actions } = await setup();
    act(() => h.select('A1'));
    act(() => actions()[INSERT_LINK]!.run());
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Sheet 1', 'Prices']);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Prices' }));
    expect(linkField().value).toBe('Prices');
    expect(field('Text').value).toBe('Prices');
    fireEvent.submit(editor());
    expect(h.cell('A1')).toMatchObject({
      input: { s: 'Prices' },
      format: { ln: '#gid=other0000' },
    });
  });

  it('says what it refuses, and writes nothing', async () => {
    const { h, actions } = await setup({ cells: { A1: 'x' } });
    act(() => h.select('A1'));
    act(() => actions()[INSERT_LINK]!.run());
    fireEvent.change(linkField(), { target: { value: 'javascript:alert(1)' } });
    fireEvent.submit(editor());
    expect(screen.getByRole('alert').textContent).toBe('Use a web, email or LiveDoc address');
    expect(h.cell('A1')?.format).toBeUndefined();
  });

  it('keeps the editor open on a text the cell cannot take, saying why', async () => {
    const { h, actions } = await setup({ cells: { A1: 'x' } });
    act(() => h.select('A1'));
    act(() => actions()[INSERT_LINK]!.run());
    fireEvent.change(field('Text'), { target: { value: '=SUM(' } });
    fireEvent.change(linkField(), { target: { value: 'docs.nu' } });
    fireEvent.submit(editor());
    expect(screen.getByRole('alert').textContent).toBe('That text cannot go in the cell');
    expect(h.cell('A1')?.format).toBeUndefined();
  });

  it('links every selected cell without a Text field, and closes on Escape', async () => {
    const { h, actions } = await setup({ cells: { A1: '1', A2: '2' } });
    act(() => h.select('A1:A2'));
    act(() => actions()[INSERT_LINK]!.run());
    expect(within(editor()).queryByRole('textbox', { name: 'Text' })).toBeNull();
    fireEvent.change(linkField(), { target: { value: 'B4' } });
    fireEvent.submit(editor());
    expect(h.cell('A2')).toMatchObject({
      input: { n: 2 },
      format: { ln: `#gid=${SHEET_ID}&range=B4` },
    });
    act(() => actions()[INSERT_LINK]!.run());
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(screen.queryByRole('form', { name: 'Link' })).toBeNull();
  });
});

describe('the link card', () => {
  const linked = {
    B2: { ln: `${window.location.origin}/document/doc9` },
    C3: { ln: '#gid=other0000&range=A2' },
  };

  it('names a LiveDoc document, opens, copies and removes its link', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { h, actions } = await setup({ cells: { B2: 'Notes', C3: 'There' }, format: linked });
    act(() => h.select('B2'));
    expect(within(card()!).getByRole('link').textContent).toBe('Price notes');
    fireEvent.click(within(card()!).getByRole('link'));
    expect(open).toHaveBeenCalledWith(
      `${window.location.origin}/document/doc9`,
      '_blank',
      'noopener,noreferrer',
    );
    fireEvent.click(within(card()!).getByRole('button', { name: 'Copy Link' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/document/doc9`);
    fireEvent.click(within(card()!).getByRole('button', { name: 'Remove Link' }));
    expect(h.cell('B2')?.format).toBeUndefined();
    open.mockRestore();
    expect(actions()[EDIT_LINK]).toBeUndefined();
  });

  it('opens a sheet of the workbook through its sheet, and copies the address opening it', async () => {
    const { h, actions } = await setup({ cells: { C3: 'There' }, format: linked });
    act(() => h.select('C3'));
    expect(within(card()!).getByRole('link').textContent).toBe('Prices!A2');
    act(() => actions()[OPEN_HYPERLINK]!.run());
    expect(followSheet).toHaveBeenCalledWith({
      k: 'sheet',
      sheetId: 'other0000',
      range: { r1: 1, c1: 0, r2: 1, c2: 0 },
    });
    act(() => actions()[COPY_LINK]!.run());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/document/d1?range=A2#t=t1`);
    act(() => actions()[OPEN_LINK]!.run());
    expect(followSheet).toHaveBeenCalledTimes(2);
  });

  it('edits through the editor, and hides on Escape until the active cell moves', async () => {
    const { h, actions } = await setup({ cells: { B2: 'Notes' }, format: linked });
    act(() => h.select('B2'));
    fireEvent.click(within(card()!).getByRole('button', { name: 'Edit Link' }));
    expect(linkField().value).toBe(`${window.location.origin}/document/doc9`);
    fireEvent.change(linkField(), { target: { value: '' } });
    fireEvent.submit(editor());
    expect(h.cell('B2')?.format).toBeUndefined();
    expect(track).not.toHaveBeenCalledWith('Spreadsheet', 'Added', 'Link');
    expect(actions()[REMOVE_LINK]).toBeUndefined();
  });

  it('gives a Viewer open and copy, never edit or remove', async () => {
    const { h, actions } = await setup({ canEdit: false, cells: { B2: 'Notes' }, format: linked });
    act(() => h.select('B2'));
    expect(within(card()!).queryByRole('button', { name: 'Edit Link' })).toBeNull();
    expect(Object.keys(actions()).sort()).toEqual(
      [COPY_LINK, GET_LINK_TO_CELL, OPEN_HYPERLINK, OPEN_LINK].sort(),
    );
  });
});

describe('Get Link to This Cell', () => {
  it('copies the address opening the selection and says so', async () => {
    const { h, actions } = await setup();
    act(() => h.select('B2:C3'));
    await act(async () => actions()[GET_LINK_TO_CELL]!.run());
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/document/d1?range=B2:C3#t=t1`,
    );
    expect(h.toast).toHaveBeenCalledWith('Link copied');
  });
});
