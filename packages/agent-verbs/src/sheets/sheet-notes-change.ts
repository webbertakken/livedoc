// change_sheet's note op (docs/specs/029-sheets/review.md "Notes"): a range's cells each given the note, or theirs taken
// off, as one cells write. A note's `\r\n` is a line break, as a file's is.
import {
  isCellNote,
  SHEET_NOTE_MAX,
  type CellChange,
  type GridRange,
  type Sheet,
  type SheetWrite,
} from '@livedoc/sheets';

export type NoteWrite =
  { write: SheetWrite } | { refusal: 'note_too_long' | 'note_invalid'; message: string };

/** The write giving each cell of `range` the note (null takes it off); null for a range past the sheet's cells. */
export function noteWrite(sheet: Sheet, range: GridRange, note: string | null): NoteWrite | null {
  const { rows, cols } = sheet.layout;
  if (range.r2 >= rows.length || range.c2 >= cols.length) return null;
  const text = note === null ? null : note.replace(/\r\n?/g, '\n');
  const length = text?.length ?? 0;
  if (text !== null && !isCellNote(text))
    return length > SHEET_NOTE_MAX
      ? {
          refusal: 'note_too_long',
          message: `A note holds up to ${SHEET_NOTE_MAX.toLocaleString('en-GB')} characters.`,
        }
      : {
          refusal: 'note_invalid',
          message: 'Give a note as text of at least one character, or null to take notes off.',
        };
  const cells: CellChange[] = [];
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++) cells.push({ r: rows[r]!, c: cols[c]!, n: text });
  return { write: { kind: 'cells', cells } };
}
