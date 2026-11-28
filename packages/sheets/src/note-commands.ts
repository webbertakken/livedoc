// The note box's and Delete Notes' writes (docs/specs/029-sheets/review.md "Notes"): every selected cell given the
// note, as Google's are, a merged area once at its top-left cell; an empty note, or Delete Notes, takes the notes off
// the cells holding one. A cell already holding the note is left, so a save changing nothing writes nothing.
import { boundedRange, cellsIn } from './commands';
import { layoutIndex } from './layout';
import { isCellNote, SHEET_NOTE_MAX } from './note';
import { cellKey, type Sheet } from './sheet';
import type { GridRange } from './address';
import type { CellChange, SheetWrite } from './store';
import type { Workbook } from './engine/workbook';

export type NoteRefusal = { refusal: 'note_too_long' | 'note_invalid'; message: string };

/** A note as the store keeps it (`\r\n` a line break), null for none, or why it is refused (an empty one too). */
export function noteText(note: string | null): { text: string | null } | NoteRefusal {
  if (note === null) return { text: null };
  const text = note.replace(/\r\n?/g, '\n');
  const length = text.length;
  if (isCellNote(text)) return { text };
  return length > SHEET_NOTE_MAX
    ? {
        refusal: 'note_too_long',
        message: `A note holds up to ${SHEET_NOTE_MAX.toLocaleString('en-GB')} characters.`,
      }
    : {
        refusal: 'note_invalid',
        message: 'Give a note as text of at least one character, or null to take notes off.',
      };
}

// The positions a merge covers but its top-left cell: they hold no note of their own.
function coveredCells(sheet: Sheet): Set<string> {
  const covered = new Set<string>();
  const merges = sheet.layout.merges;
  if (!merges?.length) return covered;
  const ix = layoutIndex(sheet.layout);
  for (const m of merges) {
    const r1 = ix.rowPos.get(m.r1);
    const c1 = ix.colPos.get(m.c1);
    const r2 = ix.rowPos.get(m.r2);
    const c2 = ix.colPos.get(m.c2);
    if (r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) continue;
    for (let r: number = r1; r <= r2; r++)
      for (let c: number = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(`${r},${c}`);
  }
  return covered;
}

/** Delete Notes: every note in the ranges taken off; null when none is there. */
export function deleteNotes(sheet: Sheet, ranges: readonly GridRange[]): SheetWrite | null {
  const cells: CellChange[] = [];
  for (const { r, c, cell } of cellsIn(sheet, ranges))
    if (cell.note !== undefined) cells.push({ r, c, n: null });
  return cells.length ? { kind: 'cells', cells } : null;
}

/** Whether any cell of the ranges holds a note (the cell menu's Delete Notes shows then). */
export function notesIn(sheet: Sheet, ranges: readonly GridRange[]): boolean {
  return cellsIn(sheet, ranges).some(({ cell }) => cell.note !== undefined);
}

/**
 * The note box's save: each cell of the ranges given the note (a whole row or column kept to the cells in use, a
 * merged area once), or, for an empty note (as the box saves one), the notes taken off. Null when nothing changes or the sheet is gone.
 */
export function noteRanges(
  wb: Workbook,
  sheetId: string,
  ranges: readonly GridRange[],
  note: string | null,
): { write: SheetWrite } | NoteRefusal | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const read = noteText(note === '' ? null : note);
  if ('refusal' in read) return read;
  const { text } = read;
  if (text === null) {
    const write = deleteNotes(sheet, ranges);
    return write ? { write } : null;
  }
  const { rows, cols } = sheet.layout;
  const covered = coveredCells(sheet);
  const extent = wb.extent(sheetId);
  const seen = new Set<string>();
  const cells: CellChange[] = [];
  for (const raw of ranges) {
    const g = boundedRange(raw, sheet, extent);
    for (let r = g.r1; r <= g.r2; r++)
      for (let c = g.c1; c <= g.c2; c++) {
        const rowId = rows[r];
        const colId = cols[c];
        if (!rowId || !colId || covered.has(`${r},${c}`)) continue;
        const key = cellKey(rowId, colId);
        if (seen.has(key) || sheet.cells.get(key)?.note === text) continue;
        seen.add(key);
        cells.push({ r: rowId, c: colId, n: text });
      }
  }
  return cells.length ? { write: { kind: 'cells', cells } } : null;
}
