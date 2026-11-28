// Cells' links in a file (docs/specs/029-sheets/standard-mapping.md "Links in the file", D642): a link as both formats
// hold one, an address or a range of the workbook by its sheet's name, and its forms in each: XLSX a hyperlink's
// external relationship or `location` (`'Sheet 2'!B2:C3`), ODF a `text:a`'s `xlink:href` (`#'Sheet 2'.B2:C3`).
// Pure; the readers and writers place them.
import { formatRange, parseRangeText, type GridRange } from '../address';
import { sheetLink, sheetLinkOf } from '../cell-link';
import { sheetPrefix } from './a1-text';

/** A cell's link as a file holds it: an address as written, or a range of the workbook by its sheet's name. */
export type FileLink = { href: string } | { sheet: string; range: GridRange };

const A1_TOP_LEFT: GridRange = { r1: 0, c1: 0, r2: 0, c2: 0 };

/**
 * A model's link as a file holds it: a sheet of this workbook (`#gid=`) by its title, its top left cell for a whole
 * sheet's link, or none when its sheet is gone; any other link as the address it is.
 */
export function fileLinkOf(
  ln: string,
  titleOf: (sheetId: string) => string | undefined,
): FileLink | null {
  const inBook = sheetLinkOf(ln);
  if (!inBook) return { href: ln };
  const sheet = titleOf(inBook.sheetId);
  return sheet === undefined ? null : { sheet, range: inBook.range ?? A1_TOP_LEFT };
}

/** A file's link as the model holds it: a range by its sheet's id, or none when no sheet of the name was made. */
export function linkFromFile(
  link: FileLink,
  idOf: (title: string) => string | undefined,
): string | null {
  if ('href' in link) return link.href;
  const id = idOf(link.sheet);
  return id === undefined ? null : sheetLink(id, link.range);
}

// A range's text without its `$`s, read as positions.
const rangeOf = (text: string): GridRange | null =>
  text.includes('!') || text.includes('.') ? null : parseRangeText(text.replaceAll('$', ''));

// A sheet name and what follows it, quoted (`'Sheet 2'`, a quote doubled) or bare up to `sep`: each place a bare name
// could end, for a bare name may hold the separator itself (`My.Sheet` in ODF).
function namedSplits(text: string, sep: string): { sheet: string; rest: string }[] {
  if (text.startsWith("'")) {
    const m = /^'((?:[^']|'')+)'(.*)$/s.exec(text);
    if (!m || !m[2]!.startsWith(sep)) return [];
    return [{ sheet: m[1]!.replaceAll("''", "'"), rest: m[2]!.slice(sep.length) }];
  }
  const out: { sheet: string; rest: string }[] = [];
  for (let at = text.indexOf(sep); at > 0; at = text.indexOf(sep, at + 1))
    out.push({ sheet: text.slice(0, at), rest: text.slice(at + sep.length) });
  return out;
}

/** An XLSX hyperlink's `location` as a range of a sheet the file holds (`known`), or null for any other. */
export function xlsxLocationLink(
  location: string,
  known: (sheet: string) => boolean,
): FileLink | null {
  for (const { sheet, rest } of namedSplits(location.trim(), '!')) {
    const range = rangeOf(rest);
    if (range && known(sheet)) return { sheet, range };
  }
  return null;
}

/** A range of the workbook as an XLSX hyperlink's `location`. */
export const xlsxLocation = (link: { sheet: string; range: GridRange }): string =>
  `${sheetPrefix(link.sheet)}${formatRange(link.range)}`;

// An ODF range's second corner may name its sheet again (`Sheet1.A1:Sheet1.B2`): the sheet's part is dropped.
function odfRange(rest: string): GridRange | null {
  const [a, b, more] = rest.split(':');
  if (more !== undefined || a === undefined) return null;
  if (b === undefined) return rangeOf(a);
  const dot = b.lastIndexOf('.');
  return rangeOf(`${a}:${dot < 0 ? b : b.slice(dot + 1)}`);
}

/** An ODF `xlink:href` within the workbook (`#Sheet1.A1`, `#'Sheet 2'.A1:B2`) as a range of a sheet it holds. */
export function odfHrefLink(href: string, known: (sheet: string) => boolean): FileLink | null {
  if (!href.startsWith('#')) return null;
  const text = href.slice(1).replace(/^\$/, '');
  for (const { sheet, rest } of namedSplits(text, '.')) {
    const range = odfRange(rest);
    if (range && known(sheet)) return { sheet, range };
  }
  return null;
}

/** A range of the workbook as an ODF `xlink:href`, as LibreOffice writes one: the sheet's name always quoted. */
export const odfHref = (link: { sheet: string; range: GridRange }): string =>
  `#'${link.sheet.replaceAll("'", "''")}'.${formatRange(link.range)}`;
