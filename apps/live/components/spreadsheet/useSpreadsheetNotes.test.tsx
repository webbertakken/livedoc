// @vitest-environment jsdom
// A spreadsheet's notes in the grid (docs/specs/029-sheets/review.md "Notes"): Insert Note opens the note box on the
// active cell with its note, the caret at its end; Escape, Shift+F2 and clicking away save it once, as one change; an
// empty note takes it off; every selected cell gets it; Delete Notes takes the selection's notes off; an Editor's alone.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  CELL_INSERT_NOTE,
  DELETE_NOTES,
  EDIT_NOTE,
  INSERT_NOTE,
} from '@/lib/spreadsheet/sheet-notes';
import type { OpenNoteCell } from '@/components/sheets/sheet-note-open-context';
import { useSpreadsheetNotes } from './useSpreadsheetNotes';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
import { track } from '@/lib/telemetry';

beforeAll(stubResizeObserver);
beforeEach(() => vi.mocked(track).mockClear());
afterEach(cleanup);

async function setup(
  opts: { canShape?: boolean; notes?: Record<string, string>; cells?: Record<string, string> } = {},
) {
  const h: SheetHarness = await makeSheet({
    rows: 6,
    cols: 4,
    cells: opts.cells ?? {},
    ...(opts.notes ? { notes: opts.notes } : {}),
  });
  let actions: OfficeActions = {};
  let open: OpenNoteCell | null = null;
  renderSheet(
    h,
    (p) => {
      const notes = useSpreadsheetNotes(p.c);
      actions = notes.actions;
      open = notes.open;
      return notes.box;
    },
    { canEdit: true, ...(opts.canShape === undefined ? {} : { canShape: opts.canShape }) },
  );
  return { h, actions: () => actions, open: () => open };
}

const box = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' });
const noBox = () => screen.queryByRole('textbox', { name: 'Note' });

describe('the note box', () => {
  it('opens on the active cell, empty, and Escape saves the note as one change, counted', async () => {
    const { h, actions, open } = await setup();
    act(() => h.select('B2'));
    act(() => actions()[INSERT_NOTE]!.run());
    expect(box().value).toBe('');
    expect(document.activeElement).toBe(box());
    expect(open()).toMatchObject({ r: 1, c: 1 });
    fireEvent.change(box(), { target: { value: 'Check\nthis' } });
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(noBox()).toBeNull();
    expect(h.cell('B2')?.note).toBe('Check\nthis');
    await act(() => h.store.settle());
    expect(h.writes).toHaveLength(1);
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Changed', 'Note');
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'Note');
  });

  it('opens on a noted cell with its note, the caret at its end, and Shift+F2 saves the edit', async () => {
    const { h, actions } = await setup({ notes: { A2: 'Old' } });
    act(() => h.select('A2'));
    expect(actions()[CELL_INSERT_NOTE]).toBeUndefined();
    act(() => actions()[EDIT_NOTE]!.run());
    expect(box().value).toBe('Old');
    expect(box().selectionStart).toBe(3);
    fireEvent.change(box(), { target: { value: 'New' } });
    fireEvent.keyDown(box(), { key: 'F2', shiftKey: true });
    expect(h.cell('A2')?.note).toBe('New');
  });

  it('saves once on clicking away, and an empty note takes it off', async () => {
    const { h, actions } = await setup({ notes: { A1: 'Gone soon' }, cells: { A1: 'x' } });
    act(() => h.select('A1'));
    act(() => actions()[INSERT_NOTE]!.run());
    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.blur(box());
    expect(noBox()).toBeNull();
    expect(h.cell('A1')).toEqual({ input: { s: 'x' } });
    await act(() => h.store.settle());
    expect(h.writes).toHaveLength(1);
  });

  it('writes nothing when the note is unchanged', async () => {
    const { h, actions } = await setup({ notes: { A1: 'Same' } });
    act(() => actions()[EDIT_NOTE]!.run());
    fireEvent.keyDown(box(), { key: 'Escape' });
    await act(() => h.store.settle());
    expect(h.writes).toHaveLength(0);
    expect(track).not.toHaveBeenCalled();
  });

  it('gives every selected cell the note', async () => {
    const { h, actions } = await setup();
    act(() => h.select('A1:B2'));
    act(() => actions()[CELL_INSERT_NOTE]!.run());
    fireEvent.change(box(), { target: { value: 'All' } });
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(['A1', 'B1', 'A2', 'B2'].map((a1) => h.cell(a1)?.note)).toEqual([
      'All',
      'All',
      'All',
      'All',
    ]);
  });

  it('says why a note is refused, and writes nothing', async () => {
    const { h, actions } = await setup();
    act(() => actions()[INSERT_NOTE]!.run());
    fireEvent.change(box(), { target: { value: 'bell\u0007' } });
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(h.toast).toHaveBeenCalledWith(
      'Give a note as text of at least one character, or null to take notes off.',
    );
    await act(() => h.store.settle());
    expect(h.writes).toHaveLength(0);
  });
});

describe('Delete Notes', () => {
  it("shows where a selected cell holds a note, and takes the selection's notes off", async () => {
    const { h, actions } = await setup({ notes: { A1: 'One', B2: 'Two', D6: 'Kept' } });
    act(() => h.select('C3'));
    expect(actions()[DELETE_NOTES]).toBeUndefined();
    act(() => h.select('A1:C3'));
    act(() => actions()[DELETE_NOTES]!.run());
    expect([h.cell('A1')?.note, h.cell('B2')?.note, h.cell('D6')?.note]).toEqual([
      undefined,
      undefined,
      'Kept',
    ]);
    await act(() => h.store.settle());
    expect(h.writes).toHaveLength(1);
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Changed', 'Note');
  });
});

describe('who may', () => {
  it("gives a Participant no note box nor Delete Notes: a note is an Editor's", async () => {
    const { actions } = await setup({ canShape: false, notes: { A1: 'Read me' } });
    expect(actions()).toEqual({});
  });
});
