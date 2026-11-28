import { describe, expect, it } from 'vitest';
import { isCellNote, SHEET_NOTE_MAX } from './note';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from './store';
import { cellKey, type Sheet } from './sheet';
import { cellsFromJson, cellToJson } from './sheet-json';
import { cellBytes, validateWrite } from './validate';
import { valuesOnly, writesFormats } from './values-only';
import { makeSheets } from './testing/book';
import { CellMap } from './cells/cell-map';
import { Workbook } from './engine/workbook';
import { clipFromRange } from './clipboard';
import { pasteClip, pasteCut, type PasteResult } from './commands-paste';

// docs/specs/029-sheets/review.md "Notes": a note is plain text the cell holds, beside its input and format.

const ctx = { now: 1, by: { id: 'p', name: 'P', color: '#000000' } };
const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;
const A1 = cellKey(R(0), C(0));

function base(cells: Record<string, string> = {}): Sheet {
  return makeSheets({ 'Sheet 1': cells }, { rows: 4, cols: 3 })[0]!;
}

const note = (n: string | null): SheetWrite => ({
  kind: 'cells',
  cells: [{ r: R(0), c: C(0), n }],
});

describe('isCellNote', () => {
  it('takes text of 1 to SHEET_NOTE_MAX characters with line breaks', () => {
    expect(isCellNote('Check the total')).toBe(true);
    expect(isCellNote('two\nlines')).toBe(true);
    expect(isCellNote('x'.repeat(SHEET_NOTE_MAX))).toBe(true);
  });

  it('refuses anything else', () => {
    for (const not of [
      '',
      'x'.repeat(SHEET_NOTE_MAX + 1),
      'tab\there',
      'bell\u0007',
      'cr\r\n',
      3,
      null,
    ])
      expect(isCellNote(not)).toBe(false);
  });
});

describe('a note in the store', () => {
  it('lands on a cell beside its input and format, and undo takes it away', () => {
    const s = base({ A1: 'Total' });
    const r = applySheetWrite(s, note('Check it'), ctx);
    expect(r.sheet.cells.get(A1)).toEqual({ input: { s: 'Total' }, note: 'Check it' });
    const back = applySheetWrite(r.sheet, inverseSheetWrite(s, r), ctx).sheet;
    expect(back.cells.get(A1)).toEqual({ input: { s: 'Total' } });
  });

  it('makes a cell of an empty one, and removing it deletes the cell', () => {
    const s = base();
    const on = applySheetWrite(s, note('Alone'), ctx).sheet;
    expect(on.cells.get(A1)).toEqual({ note: 'Alone' });
    const off = applySheetWrite(on, note(null), ctx).sheet;
    expect(off.cells.has(A1)).toBe(false);
  });

  it('is kept when the value or format changes, and comes back on undoing a removal', () => {
    const s = applySheetWrite(base({ A1: 'a' }), note('Kept'), ctx).sheet;
    const typed = applySheetWrite(
      s,
      { kind: 'cells', cells: [{ r: R(0), c: C(0), i: null, f: { b: true } }] },
      ctx,
    );
    expect(typed.sheet.cells.get(A1)).toEqual({ format: { b: true }, note: 'Kept' });
    const removed = applySheetWrite(s, note(null), ctx);
    const back = applySheetWrite(removed.sheet, inverseSheetWrite(s, removed), ctx).sheet;
    expect(back.cells.get(A1)?.note).toBe('Kept');
  });

  it('leaves the note out of an undo that never touched one', () => {
    const s = base({ A1: 'a' });
    const r = applySheetWrite(
      s,
      { kind: 'cells', cells: [{ r: R(0), c: C(0), i: { s: 'b' } }] },
      ctx,
    );
    expect(inverseSheetWrite(s, r)).toEqual({
      kind: 'cells',
      cells: [{ r: R(0), c: C(0), i: { s: 'a' }, f: null }],
    });
  });
});

describe('a note on the wire', () => {
  it('travels as n and comes back', () => {
    const json = cellToJson(A1, { input: { s: 'a' }, note: 'N' });
    expect(json).toEqual({ r: R(0), c: C(0), i: { s: 'a' }, n: 'N' });
    expect(cellsFromJson([json, { r: R(1), c: C(0), n: 'only' }]).get(cellKey(R(1), C(0)))).toEqual(
      {
        note: 'only',
      },
    );
  });

  it('counts its length in the cell’s bytes', () => {
    expect(cellBytes({ note: 'abcd' })).toBe(4);
  });
});

describe('validating a note', () => {
  it('accepts a note and its removal', () => {
    const s = base();
    expect(validateWrite(s, note('ok'))).toEqual({ ok: true });
    expect(validateWrite(s, note(null))).toEqual({ ok: true });
  });

  it('refuses one too long or not plain text', () => {
    const s = base();
    expect(validateWrite(s, note('x'.repeat(SHEET_NOTE_MAX + 1)))).toEqual({
      ok: false,
      error: 'note_too_long',
      at: A1,
    });
    expect(validateWrite(s, note('a\u0000b'))).toEqual({
      ok: false,
      error: 'note_invalid',
      at: A1,
    });
    expect(
      validateWrite(s, { kind: 'cells', cells: [{ r: R(0), c: C(0), n: 7 as unknown as string }] }),
    ).toEqual({ ok: false, error: 'note_invalid', at: A1 });
  });
});

describe('a Participant’s note', () => {
  it('is dropped with formats: a note is never a value', () => {
    expect(writesFormats(note('x'))).toBe(true);
    expect(valuesOnly(note('x'))).toBeNull();
    expect(
      valuesOnly({ kind: 'cells', cells: [{ r: R(0), c: C(0), i: { s: 'v' }, n: 'x' }] }),
    ).toEqual({ kind: 'cells', cells: [{ r: R(0), c: C(0), i: { s: 'v' } }] });
  });
});

describe('a note in the cells held', () => {
  it('keeps a picture counted, and the count right as the note comes and goes', () => {
    const cells = CellMap.from([]);
    cells.set('r1:c1', { input: { img: { id: 'p1' } }, note: 'Logo' });
    expect(cells.pictureCount).toBe(1);
    expect(cells.get('r1:c1')).toEqual({ input: { img: { id: 'p1' } }, note: 'Logo' });
    cells.set('r1:c1', { input: { img: { id: 'p1' } } });
    expect(cells.pictureCount).toBe(1);
    cells.set('r1:c1', { note: 'gone picture' });
    expect(cells.pictureCount).toBe(0);
    cells.setCell('r2', 'c1', { img: { id: 'p2' } }, undefined, 'set');
    expect(cells.pictureCount).toBe(1);
    cells.delete('r2:c1');
    expect(cells.pictureCount).toBe(0);
  });

  it('is kept by a copy, and the copy’s writes leave the original', () => {
    const cells = CellMap.from([['r1:c1', { note: 'one' }]]);
    const next = cells.copy().set('r1:c1', { note: 'two' });
    expect(cells.get('r1:c1')).toEqual({ note: 'one' });
    expect(next.get('r1:c1')).toEqual({ note: 'two' });
  });
});

describe('a note in the workbook', () => {
  it('is read by position, and a cell holding only one counts in the extent', () => {
    const s = applySheetWrite(
      base(),
      { kind: 'cells', cells: [{ r: R(2), c: C(1), n: 'here' }] },
      ctx,
    ).sheet;
    const wb = new Workbook({ sheets: [s], locale: 'en-GB' });
    expect(wb.cellNoteOf(s.id, 2, 1)).toBe('here');
    expect(wb.cellNoteOf(s.id, 0, 0)).toBeNull();
    expect(wb.cellNoteOf(s.id, 99, 0)).toBeNull();
    expect(wb.cellNoteOf('nosheet', 0, 0)).toBeNull();
    expect(wb.extent(s.id)).toEqual({ rows: 3, cols: 2 });
  });
});

describe('a note on the clipboard', () => {
  const noted = () => {
    const s = applySheetWrite(
      base({ A1: 'a', B1: 'b' }),
      { kind: 'cells', cells: [{ r: R(0), c: C(0), n: 'Copied' }] },
      ctx,
    ).sheet;
    return new Workbook({ sheets: [s], locale: 'en-GB' });
  };
  const A = { r1: 0, c1: 0, r2: 0, c2: 0 };
  const C3 = { r1: 2, c1: 2, r2: 2, c2: 2 };
  const noteAt = (r: PasteResult | null) =>
    r!.edits[0]!.write.kind === 'cells' ? r!.edits[0]!.write.cells[0]!.n : 'not cells';

  it('is pasted with the cell, and Values Only, Format Only and Formula Only leave the note there', () => {
    const wb = noted();
    const clip = clipFromRange(wb, wb.sheetList()[0]!.id, A)!;
    const id = wb.sheetList()[0]!.id;
    expect(noteAt(pasteClip(wb, id, C3, clip, 'all'))).toBe('Copied');
    expect(noteAt(pasteClip(wb, id, C3, clip, 'transposed'))).toBe('Copied');
    expect(noteAt(pasteClip(wb, id, C3, clip, 'noBorders'))).toBe('Copied');
    for (const mode of ['values', 'formats', 'formulas'] as const)
      expect(noteAt(pasteClip(wb, id, C3, clip, mode)), mode).toBeUndefined();
    // A copied cell without a note takes the note off the cell it lands on.
    const plain = clipFromRange(wb, id, { r1: 0, c1: 1, r2: 0, c2: 1 })!;
    expect(noteAt(pasteClip(wb, id, A, plain, 'all'))).toBeNull();
  });

  it('moves with a cut cell', () => {
    const wb = noted();
    const id = wb.sheetList()[0]!.id;
    const cut = pasteCut(wb, id, { r: 2, c: 2 }, clipFromRange(wb, id, A, true)!)!;
    const write = cut.edits.flatMap((e) => (e.write.kind === 'cells' ? e.write.cells : []));
    expect(write.find((c) => c.r === R(0) && c.c === C(0))?.n).toBeNull();
    expect(write.find((c) => c.r === R(2) && c.c === C(2))?.n).toBe('Copied');
  });
});
