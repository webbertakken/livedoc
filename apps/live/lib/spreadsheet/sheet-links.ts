// A spreadsheet's links in the grid (docs/specs/029-sheets/inserted-objects.md "Links"): what the link editor opens with,
// what its Link field reads as and offers, the one write applying it, Get Link to This Cell's address and the range
// such an address lands on. Pure, beside the editor's hook.
import {
  cellKey,
  cellLinkText,
  displayValue,
  formatRange,
  formatRanges,
  parseRangeText,
  sheetLinkOf,
  typeInto,
  typedCellLink,
  type CellChange,
  type GridRange,
  type LinkSheet,
  type SheetWrite,
  type Workbook,
} from '@livedoc/sheets';
import {
  documentAddress,
  linkAddress,
  LINK_REFUSED,
  matchingDocuments,
  type LinkDocument,
} from '@/lib/text-document/text-document-links';

/** Insert › Link, the toolbar's Insert Link, the cell menu's Insert Link and Ctrl+K. */
export const INSERT_LINK = 'insert-link';
/** The cell menu's and the link card's. */
export const EDIT_LINK = 'edit-link';
export const REMOVE_LINK = 'remove-link';
export const COPY_LINK = 'copy-link';
/** View More Cell Actions › Get Link to This Cell. */
export const GET_LINK_TO_CELL = 'get-link-to-cell';
/** Alt+Enter (keyboard-shortcuts.md "Navigate the spreadsheet"). */
export const OPEN_HYPERLINK = 'open-hyperlink';

export const LINK_COPIED = 'Link copied';
export const SHEET_GONE = 'This sheet no longer exists';

/** What the link editor opens with: Text null where it is not shown (a formula's cell, more than one cell). */
export type SheetLinkEditing = { text: string | null; link: string };

type Place = { wb: Workbook; sheetId: string; locale: string };

const titleOf = (wb: Workbook) => (id: string) => wb.sheet(id)?.title;

/** The sheets of the workbook as a typed link names them. */
export const linkSheets = (wb: Workbook): LinkSheet[] =>
  wb.sheetList().map((s) => ({ id: s.id, title: s.title }));

/**
 * What the link editor opens with on the active cell (D639): Text is what it shows, absent on a formula's cell and
 * when `many` cells are selected; Link its own link as words (a sheet's by name), else empty.
 */
export function sheetLinkEditing(
  { wb, sheetId, locale }: Place,
  at: { r: number; c: number },
  many: boolean,
): SheetLinkEditing {
  const sheet = wb.sheet(sheetId);
  const rowId = sheet?.layout.rows[at.r];
  const colId = sheet?.layout.cols[at.c];
  const cell = rowId && colId ? sheet.cells.get(cellKey(rowId, colId)) : undefined;
  const own = cell?.format?.ln;
  const link = own ? cellLinkText(own, titleOf(wb)) : '';
  if (many || (cell?.input && 'f' in cell.input)) return { text: null, link };
  const shown = displayValue(wb.value(sheetId, at.r, at.c), cell?.format, locale).text;
  return { text: shown, link };
}

/** The Link field as the address a cell holds: '' for none, or why it is refused (D637). */
export function sheetLinkAddress(
  typed: string,
  sheets: readonly LinkSheet[],
  here: string,
): { href: string } | { problem: string } {
  const inBook = typedCellLink(typed, sheets, here);
  if (inBook && sheetLinkOf(inBook)) return { href: inBook };
  const address = linkAddress(typed);
  if ('href' in address && address.href.startsWith('#')) return { problem: LINK_REFUSED };
  return address;
}

/** One suggestion under Link: a range or sheet of this workbook, or a LiveDoc document. */
export type SheetLinkOffer = {
  group: 'range' | 'sheets' | 'documents';
  key: string;
  label: string;
  // What Link holds once taken: a range or sheet by name, a document's address.
  value: string;
};

/** The groups the editor lists, in order (D640). */
export const SHEET_LINK_GROUPS = [
  ['range', 'Range'],
  ['sheets', 'Sheets in this spreadsheet'],
  ['documents', 'LiveDoc documents'],
] as const;

/**
 * What Link offers for what is typed (D640): the range it reads as, this workbook's sheets (every one when nothing is
 * typed, else those holding every typed word), then the person's documents holding every word.
 */
export function sheetLinkOffers(
  typed: string,
  wb: Workbook,
  here: string,
  documents: readonly LinkDocument[],
  origin: string,
): SheetLinkOffer[] {
  const sheets = linkSheets(wb);
  const inBook = typedCellLink(typed, sheets, here);
  const range = inBook ? sheetLinkOf(inBook) : null;
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  const rangeOffer: SheetLinkOffer[] =
    inBook && range?.range
      ? [
          {
            group: 'range',
            key: `r:${inBook}`,
            label: cellLinkText(inBook, titleOf(wb)),
            value: cellLinkText(inBook, titleOf(wb)),
          },
        ]
      : [];
  const sheetOffers = sheets
    .filter((s) => words.every((w) => s.title.toLowerCase().includes(w)))
    .map((s): SheetLinkOffer => ({
      group: 'sheets',
      key: `s:${s.id}`,
      label: s.title,
      value: s.title,
    }));
  const documentOffers = matchingDocuments(documents, typed).map((d): SheetLinkOffer => ({
    group: 'documents',
    key: `d:${d.id}`,
    label: d.name.trim(),
    value: documentAddress(d.id, origin),
  }));
  return [...rangeOffer, ...sheetOffers, ...documentOffers];
}

/**
 * The one write applying the link editor (D639): `href` set on every cell of `ranges` ('' takes it off), and a
 * changed `text` typed into the active cell, as typing it would be (an empty Text on an empty cell takes `shown`,
 * the address as typed). Null when nothing is written; a typed text the cell refuses answers why.
 */
export function sheetLinkWrite(
  { wb, sheetId }: Place,
  at: { r: number; c: number },
  ranges: readonly GridRange[],
  opened: SheetLinkEditing,
  applied: { text: string | null; href: string; shown: string },
): { write: SheetWrite } | { problem: string } | null {
  const linked = formatRanges(wb, sheetId, ranges, {
    ln: applied.href === '' ? null : applied.href,
  });
  if (!linked || linked.kind !== 'cells' || linked.cells.length === 0) return null;
  const empty = opened.text === '';
  const text = applied.text === '' && empty && applied.href !== '' ? applied.shown : applied.text;
  if (opened.text === null || text === null || text === opened.text) return { write: linked };
  const typed = typeInto(wb, sheetId, at, text);
  if (!typed?.ok) return { problem: 'That text cannot go in the cell' };
  const [change] = (typed.write as { cells: CellChange[] }).cells;
  const cells = linked.cells.map((cell) =>
    cell.r === change!.r && cell.c === change!.c
      ? { ...cell, i: change!.i, f: { ...change!.f, ...cell.f } }
      : cell,
  );
  return { write: { kind: 'cells', cells } };
}

/** The query parameter naming the range a cell's link opens on, beside the editor's `#t=` naming the tab. */
export const RANGE_PARAM = 'range';

/**
 * Get Link to This Cell (D641): the spreadsheet's address with the range in its query and the sheet's tab in its
 * fragment, the editor's own pin (`?range=B2:C4#t=<tab>`), so the editor's rewrite of the fragment keeps the range.
 */
export const cellLinkAddress = (documentHref: string, tabId: string, range: GridRange): string =>
  `${documentHref}?${RANGE_PARAM}=${formatRange(range)}#t=${encodeURIComponent(tabId)}`;

/** The range an address's query selects; null for none. */
export function rangeOfSearch(search: string): GridRange | null {
  const text = new URLSearchParams(search).get(RANGE_PARAM);
  return text ? parseRangeText(text) : null;
}

/** The address without its range, the rest as it was. */
export function withoutRange(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(RANGE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A range cut to a sheet's edge (D641); null when none of it is on the sheet. */
export function rangeOnSheet(range: GridRange, rows: number, cols: number): GridRange | null {
  if (range.r1 >= rows || range.c1 >= cols) return null;
  return { ...range, r2: Math.min(range.r2, rows - 1), c2: Math.min(range.c2, cols - 1) };
}
