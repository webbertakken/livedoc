// A spreadsheet's notes in the grid (docs/specs/029-sheets/review.md "Notes"): the items that open the note box or
// take notes off, the marker a noted cell draws and how long the pointer rests before the note shows.
import { bestInk } from '@livedoc/document';

/** Insert › Note and Shift+F2: the note box on the active cell, an Editor's. */
export const INSERT_NOTE = 'insert-note';
/** The cell menu's Insert Note, drawn on a cell without a note. */
export const CELL_INSERT_NOTE = 'cell-insert-note';
/** The cell menu's Edit Note, drawn on a cell with one. */
export const EDIT_NOTE = 'edit-note';
/** The cell menu's Delete Notes, drawn when a selected cell holds one. */
export const DELETE_NOTES = 'delete-notes';

/** A note marker's side, in px at 100% zoom: Google's small black corner. */
export const NOTE_MARKER_PX = 6;
/** How long the pointer rests on a noted cell before its note shows, in ms. */
export const NOTE_CARD_DELAY_MS = 400;

/** A note marker's ink: black, white on a dark fill, as any ink is kept readable. */
export function noteMarkerInk(fill: string): string {
  return bestInk(fill, '#000000', '#ffffff');
}
