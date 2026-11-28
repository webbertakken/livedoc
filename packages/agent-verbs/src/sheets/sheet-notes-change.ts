// change_sheet's note op (docs/specs/029-sheets/review.md "Notes"): a range's cells each given the note, or theirs taken
// off, as one cells write. A note's `\r\n` is a line break, as a file's is.
import {
  noteText,
  type CellChange,
  type GridRange,
  type NoteRefusal,
  type Sheet,
  type SheetWrite,
} from '@livedoc/sheets';

export type NoteWrite = { write: SheetWrite } | NoteRefusal;

/** The write giving each cell of `range` the note (null takes it off); null for a range past the sheet's cells. */
export function noteWrite(sheet: Sheet, range: GridRange, note: string | null): NoteWrite | null {
  const { rows, cols } = sheet.layout;
  if (range.r2 >= rows.length || range.c2 >= cols.length) return null;
  // An empty text is refused: an agent takes a note off with null.
  const read = noteText(note);
  if ('refusal' in read) return read;
  const cells: CellChange[] = [];
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++)
      cells.push({ r: rows[r]!, c: cols[c]!, n: read.text });
  return { write: { kind: 'cells', cells } };
}
