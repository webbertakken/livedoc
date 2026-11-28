import { describe, expect, it } from 'vitest';
import { cellKey, type Sheet } from './sheet';
import { applySheetWrite, type SheetWrite } from './store';
import { Workbook } from './engine/workbook';
import { makeSheets } from './testing/book';
import { deleteNotes, noteRanges, noteText, notesIn } from './note-commands';
import { SHEET_NOTE_MAX } from './note';

// docs/specs/029-sheets/review.md "Notes": the note box gives every selected cell the note, an empty one takes it off,
// and Delete Notes takes off every note in the selection.

const ctx = { now: 1, by: { id: 'p', name: 'P', color: '#000000' } };
const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;

function setup(notes: Record<string, string> = {}, merges = false) {
  const sheet: Sheet = makeSheets({ 'Sheet 1': { A1: 'x' } }, { rows: 4, cols: 3 })[0]!;
  for (const [key, note] of Object.entries(notes)) {
    const [r, c] = key.split(',').map(Number) as [number, number];
    const k = cellKey(R(r), C(c));
    sheet.cells.set(k, { ...sheet.cells.get(k), note });
  }
  if (merges)
    sheet.layout = { ...sheet.layout, merges: [{ r1: R(1), c1: C(0), r2: R(2), c2: C(1) }] };
  const wb = new Workbook({ sheets: [sheet], locale: 'en-GB' });
  return { sheet, wb };
}

const cellsOf = (w: SheetWrite | null) => (w && w.kind === 'cells' ? w.cells : []);
const box = (r1: number, c1: number, r2 = r1, c2 = c1) => ({ r1, c1, r2, c2 });

describe('noteText', () => {
  it('reads line breaks as the store keeps them, and an empty note as none', () => {
    expect(noteText('a\r\nb\rc')).toEqual({ text: 'a\nb\nc' });
    expect(noteText(null)).toEqual({ text: null });
  });

  it('refuses a note too long, or one holding a control character', () => {
    expect(noteText('x'.repeat(SHEET_NOTE_MAX + 1))).toMatchObject({ refusal: 'note_too_long' });
    expect(noteText('a\u0007')).toMatchObject({ refusal: 'note_invalid' });
    expect(noteText('')).toMatchObject({ refusal: 'note_invalid' });
  });
});

describe('noteRanges', () => {
  it('gives every selected cell the note, leaving a cell that holds it already', () => {
    const { wb, sheet } = setup({ '0,1': 'Same' });
    const made = noteRanges(wb, sheet.id, [box(0, 0, 0, 1), box(3, 2)], 'Same');
    expect(made && 'write' in made && cellsOf(made.write)).toEqual([
      { r: R(0), c: C(0), n: 'Same' },
      { r: R(3), c: C(2), n: 'Same' },
    ]);
  });

  it('gives a merged area its note once, at its top-left cell', () => {
    const { wb, sheet } = setup({}, true);
    const made = noteRanges(wb, sheet.id, [box(1, 0, 2, 1)], 'Merged');
    expect(made && 'write' in made && cellsOf(made.write)).toEqual([
      { r: R(1), c: C(0), n: 'Merged' },
    ]);
  });

  it('takes an empty note off the cells holding one, and writes nothing where none changes', () => {
    const { wb, sheet } = setup({ '1,1': 'Gone' });
    const made = noteRanges(wb, sheet.id, [box(0, 0, 2, 2)], '');
    expect(made && 'write' in made && cellsOf(made.write)).toEqual([{ r: R(1), c: C(1), n: null }]);
    expect(noteRanges(wb, sheet.id, [box(0, 0)], '')).toBeNull();
  });

  it('keeps a whole column to the cells in use', () => {
    const { wb, sheet } = setup();
    const made = noteRanges(wb, sheet.id, [box(0, 0, 3, 0)], 'Col');
    expect(cellsOf(made && 'write' in made ? made.write : null)).toHaveLength(1);
  });

  it('says why it refuses a note, and is null on a sheet that is gone', () => {
    const { wb, sheet } = setup();
    expect(noteRanges(wb, sheet.id, [box(0, 0)], 'a\u0001')).toMatchObject({
      refusal: 'note_invalid',
    });
    expect(noteRanges(wb, 'gone', [box(0, 0)], 'x')).toBeNull();
  });

  it('writes what the store applies, a cell kept for its note alone', () => {
    const { wb, sheet } = setup();
    const made = noteRanges(wb, sheet.id, [box(2, 2)], 'Alone');
    const next = applySheetWrite(sheet, (made as { write: SheetWrite }).write, ctx).sheet;
    expect(next.cells.get(cellKey(R(2), C(2)))).toEqual({ note: 'Alone' });
  });
});

describe('Delete Notes', () => {
  it('takes off every note in the selection, and only there', () => {
    const { sheet } = setup({ '0,0': 'One', '1,1': 'Two', '3,2': 'Kept' });
    expect(cellsOf(deleteNotes(sheet, [box(0, 0, 1, 1)]))).toEqual([
      { r: R(0), c: C(0), n: null },
      { r: R(1), c: C(1), n: null },
    ]);
    expect(deleteNotes(sheet, [box(2, 0)])).toBeNull();
  });

  it('knows whether a selection holds a note', () => {
    const { sheet } = setup({ '3,2': 'Here' });
    expect(notesIn(sheet, [box(0, 0, 1, 1)])).toBe(false);
    expect(notesIn(sheet, [box(0, 0), box(3, 2)])).toBe(true);
  });
});
