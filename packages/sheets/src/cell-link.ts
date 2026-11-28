// A cell's link (docs/specs/029-sheets/inserted-objects.md "A cell's link", D636, D637): held with its format as `ln`,
// the whole cell's. It leads to a web or email address, a LiveDoc document's address, or a sheet or range of this
// workbook in Google's own form, `#gid=<sheet id>&range=<A1 range>`, the sheet by its id so a rename keeps it and
// the range by position. A file's link of another scheme is held as it came and written back, never opened.
import { formatRange, parseRangeText, type GridRange } from './address';
import { safeHyperlink } from './hyperlink';

/** The longest address a cell's link holds, as a HYPERLINK's and a text document's (D637). */
export const CELL_LINK_MAX = 2048;

// A sheet id as the store makes them: letters, digits, `_` and `-`.
const SHEET_LINK = /^#gid=([\w-]+)(?:&range=([A-Za-z$0-9:]+))?$/;
// Whether text holds a control character, which an address never does and which would break a file's XML.
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** A sheet of this workbook, or a range on it, as a cell's link. */
export function sheetLink(sheetId: string, range?: GridRange): string {
  return range ? `#gid=${sheetId}&range=${formatRange(range)}` : `#gid=${sheetId}`;
}

/** The sheet (and range) a link of this workbook names; null for any other link. */
export function sheetLinkOf(link: string): { sheetId: string; range?: GridRange } | null {
  const m = SHEET_LINK.exec(link);
  if (!m) return null;
  if (m[2] === undefined) return { sheetId: m[1]! };
  const range = parseRangeText(m[2].replaceAll('$', ''));
  return range ? { sheetId: m[1]!, range } : null;
}

/** Whether a value is a cell's link as the store holds one: text of 1 to CELL_LINK_MAX characters, no controls. */
export function isCellLink(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && v.length <= CELL_LINK_MAX && !hasControl(v);
}

/** Where a cell's link opens: a web or email address, or a sheet of this workbook. */
export type CellLinkTarget =
  { k: 'web'; href: string } | { k: 'sheet'; sheetId: string; range?: GridRange };

/** Where a cell's link opens, or null for one that never opens (a file's link of another scheme). */
export function cellLinkTarget(link: string): CellLinkTarget | null {
  const sheet = sheetLinkOf(link);
  if (sheet) return { k: 'sheet', ...sheet };
  const href = safeHyperlink(link);
  return href ? { k: 'web', href } : null;
}
