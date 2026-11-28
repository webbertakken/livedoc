// A cell's note (docs/specs/029-sheets/review.md "Notes"): plain text the cell holds beside its input and format, as
// Google's notes are; no author, no replies.

/** The longest note a cell holds, in characters. */
export const SHEET_NOTE_MAX = 50_000;

// Line breaks are a note's own; every other control character is refused (a file's `\r\n` is read as `\n`).
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;

/** Whether a value is a note as the store holds one: text of 1 to SHEET_NOTE_MAX characters, line breaks its only
 *  control characters. */
export function isCellNote(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= SHEET_NOTE_MAX && !CONTROL.test(v);
}
