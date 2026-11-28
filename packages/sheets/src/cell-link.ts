// A cell's link (docs/specs/029-sheets/inserted-objects.md "A cell's link", D636, D637): held with its format as `ln`,
// the whole cell's. It leads to a web or email address, a LiveDoc document's address, or a sheet or range of this
// workbook in Google's own form, `#gid=<sheet id>&range=<A1 range>`, the sheet by its id so a rename keeps it and
// the range by position. A file's link of another scheme is held as it came and written back, never opened.
import { formatRange, parseRangeText, type GridRange } from './address';
import { safeHyperlink } from './hyperlink';
import { quoteSheet } from './formula/stored';

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

// A bare email address, as a link's address reads one.
const EMAIL = /^[^\s@:/]+@[^\s@]+\.[a-z]{2,}$/i;

/** A sheet as a typed link names one: its id and its title. */
export type LinkSheet = { readonly id: string; readonly title: string };

// A range typed after a sheet's name (`Sheet2!A1:B4`, `'My sheet'!A1`), on a sheet of the workbook.
function namedRange(typed: string, sheets: readonly LinkSheet[]): string | null {
  const bang = typed.lastIndexOf('!');
  if (bang <= 0) return null;
  const range = parseRangeText(typed.slice(bang + 1).replaceAll('$', ''));
  const name = typed.slice(0, bang);
  const title = /^'.*'$/s.test(name) ? name.slice(1, -1).replaceAll("''", "'") : name;
  const sheet = sheets.find((s) => s.title.toLowerCase() === title.toLowerCase());
  return range && sheet ? sheetLink(sheet.id, range) : null;
}

/**
 * A link as typed (inserted-objects.md "Links, agents"): a range of a sheet (`Sheet2!A1:B4`), of the sheet `here`
 * (`B2:C4`), a sheet by its title, a bare email address as `mailto:`, or an http, https or mailto address; null for
 * anything else, and for an address past CELL_LINK_MAX.
 */
export function typedCellLink(
  typed: string,
  sheets: readonly LinkSheet[],
  here: string,
): string | null {
  const text = typed.trim();
  if (text === '' || text.length > CELL_LINK_MAX) return null;
  const named = namedRange(text, sheets);
  if (named) return named;
  const range = parseRangeText(text.replaceAll('$', ''));
  if (range) return sheetLink(here, range);
  const sheet = sheets.find((s) => s.title.toLowerCase() === text.toLowerCase());
  if (sheet) return sheetLink(sheet.id);
  if (EMAIL.test(text)) return `mailto:${text}`;
  const href = safeHyperlink(text);
  return href && href.length <= CELL_LINK_MAX ? href : null;
}

/**
 * A link in words, as agents read it: a sheet of this workbook by its title, and its range after it as a formula
 * names one (`'Ada''s sheet'!B2:C4`); any other link, and one to a sheet that is gone, as held.
 */
export function cellLinkText(
  link: string,
  titleOf: (sheetId: string) => string | undefined,
): string {
  const inBook = sheetLinkOf(link);
  const title = inBook ? titleOf(inBook.sheetId) : undefined;
  if (!inBook || title === undefined) return link;
  return inBook.range ? `${quoteSheet(title)}!${formatRange(inBook.range)}` : title;
}
