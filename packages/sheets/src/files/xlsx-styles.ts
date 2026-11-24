// An XLSX file's cell styles (docs/specs/029-sheets/standard-mapping.md "Number formats in the file", "Cell styles
// in the file", "Values in XLSX"): each `cellXfs` entry's number format as a format code, read with ECMA-376's
// built-in formats (Part 1 §18.8.30) and written with them where a code is one (D92), with the rest of its look
// (xlsx-cell-style.ts); and which styles show dates, the only numbers that move between the 1900 and 1904 date systems.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  parseXml,
} from '@livedoc/office-packages';
import { cellStyleKey, type CellStyle } from './cell-style';
import { shortDateCode } from './number-format-code';
import { readXlsxStylesheet, xlsxCellStyleOf, XlsxStyleParts } from './xlsx-cell-style';
import { readThemeColours } from './xlsx-colours';
import { SPREADSHEETML_NS } from './xlsx-parts';

const STRICT_NS = 'http://purl.oclc.org/ooxml/spreadsheetml/main';

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The built-in number formats that show dates or times, East Asian ones included. */
export const XLSX_DATE_FORMAT_IDS: ReadonlySet<number> = new Set([
  ...range(14, 22),
  ...range(27, 36),
  ...range(45, 47),
  ...range(50, 58),
]);

/** ECMA-376's built-in formats every reader knows the same (Part 1 §18.8.30), by id. */
export const XLSX_BUILTIN_CODES: ReadonlyMap<number, string> = new Map([
  [1, '0'],
  [2, '0.00'],
  [3, '#,##0'],
  [4, '#,##0.00'],
  [9, '0%'],
  [10, '0.00%'],
  [11, '0.00E+00'],
  [12, '# ?/?'],
  [13, '# ??/??'],
  [15, 'd-mmm-yy'],
  [16, 'd-mmm'],
  [17, 'mmm-yy'],
  [18, 'h:mm AM/PM'],
  [19, 'h:mm:ss AM/PM'],
  [20, 'h:mm'],
  [21, 'h:mm:ss'],
  [37, '#,##0 ;(#,##0)'],
  [38, '#,##0 ;[Red](#,##0)'],
  [39, '#,##0.00;(#,##0.00)'],
  [40, '#,##0.00;[Red](#,##0.00)'],
  [45, 'mm:ss'],
  [46, '[h]:mm:ss'],
  [47, 'mmss.0'],
  [48, '##0.0E+0'],
  [49, '@'],
]);

/** The codes written by their built-in id rather than as a format of the file's own. */
const WRITTEN_BUILTINS: ReadonlyMap<string, number> = new Map(
  [1, 2, 3, 4, 9, 10, 11, 46, 49].map((id) => [XLSX_BUILTIN_CODES.get(id)!, id]),
);

/** The first id a file's own number format takes. */
export const XLSX_CUSTOM_FORMAT_ID = 164;

/** Whether a format code shows a date or a time: a date part outside its quoted text, escapes and brackets. */
export function isDateFormatCode(code: string): boolean {
  const first = code
    .replace(/"[^"]*"/g, '')
    .replace(/[\\_*]./g, '')
    .split(';')[0]!;
  const bare = first.replace(/\[(?![hms]+\])[^\]]*\]/gi, '');
  return /[dmyhs]/i.test(bare);
}

/**
 * A built-in format's code in the reader's locale: 14 and 22 are Excel's short date and date time, the other dates
 * without a code of the standard's (East Asian) the short date too; undefined for an id the standard leaves to the
 * application (a currency's 5 to 8, 41 to 44).
 */
export function xlsxBuiltinCode(id: number, locale: string): string | null | undefined {
  if (id === 0) return null;
  const code = XLSX_BUILTIN_CODES.get(id);
  if (code !== undefined) return code;
  if (id === 22) return `${shortDateCode(locale)} hh:mm`;
  return XLSX_DATE_FORMAT_IDS.has(id) ? shortDateCode(locale) : undefined;
}

/** A cell style's number format: its code (null for General), or unknown when the file names none it defines. */
export type XlsxNumberFormat = { code: string | null } | { unknown: true };

/**
 * A cell style: its number format, the rest of its look as a cell's style (none for LiveDoc's defaults), and whether
 * it says more than the model holds (`styles_unread`, D104).
 */
export type XlsxCellStyle = { number: XlsxNumberFormat; style?: CellStyle; lost: boolean };

/**
 * Each cell style (`cellXfs` entry) of `xl/styles.xml`'s text, in order, its colours from the theme's; none when the
 * part is absent or unread.
 */
export function readCellStyles(
  stylesXml: string | undefined,
  locale: string,
  themeXml?: string,
): XlsxCellStyle[] {
  if (stylesXml === undefined) return [];
  const parsed = parseXml(stylesXml, 'xl/styles.xml');
  if (!parsed.ok) return [];
  const ns = parsed.root.uri === STRICT_NS ? STRICT_NS : SPREADSHEETML_NS;
  const listed = (list: string, item: string) => {
    const holder = childElement(parsed.root, ns, list);
    return holder ? childElements(holder).filter((e) => e.local === item) : [];
  };
  const codes = new Map<number, string>();
  for (const fmt of listed('numFmts', 'numFmt'))
    codes.set(Number(attributeOf(fmt, '', 'numFmtId')), attributeOf(fmt, '', 'formatCode') ?? '');
  const stylesheet = readXlsxStylesheet(parsed.root, ns, readThemeColours(themeXml));
  // Styles that look the same share one, so the cells of a file's many entries share their formats (D121).
  const looks = new Map<string, CellStyle>();
  return listed('cellXfs', 'xf').map((xf) => {
    const id = Number(attributeOf(xf, '', 'numFmtId') ?? 0);
    const code = codes.get(id) ?? xlsxBuiltinCode(id, locale);
    const number: XlsxNumberFormat = code === undefined ? { unknown: true } : { code };
    const { style, lost } = xlsxCellStyleOf(xf, stylesheet);
    if (!style) return { number, lost };
    const key = cellStyleKey(style);
    const shared = looks.get(key) ?? style;
    looks.set(key, shared);
    return { number, style: shared, lost };
  });
}

/** The cell styles whose number format shows a date. */
export function dateStyles(styles: readonly XlsxCellStyle[]): Set<number> {
  const out = new Set<number>();
  styles.forEach(({ number }, i) => {
    if ('code' in number && number.code !== null && isDateFormatCode(number.code)) out.add(i);
  });
  return out;
}

/** One written cell style: its number format's id and its look's parts. */
type WrittenXf = { numFmt: number; font: number; fill: number; border: number; alignment: string };

/**
 * The styles part an XLSX file is written with: one cell style per distinct number format and look, in order of first
 * use, after the default (D203, D204).
 */
export class XlsxStyles {
  private readonly xfs = new Map<string, number>();
  private readonly written: WrittenXf[] = [];
  private readonly own = new Map<string, number>();
  private readonly parts = new XlsxStyleParts();

  /** The cell style (`c@s`) for a code and a look: 0, the default, for neither. */
  xf(code: string | undefined, style?: CellStyle): number {
    if (code === undefined && style === undefined) return 0;
    const key = `${code ?? ''}\u0000${cellStyleKey(style)}`;
    const known = this.xfs.get(key);
    if (known !== undefined) return known;
    if (code !== undefined && !WRITTEN_BUILTINS.has(code) && !this.own.has(code))
      this.own.set(code, XLSX_CUSTOM_FORMAT_ID + this.own.size);
    this.written.push({
      numFmt: code === undefined ? 0 : (WRITTEN_BUILTINS.get(code) ?? this.own.get(code)!),
      font: this.parts.font(style),
      fill: this.parts.fill(style),
      border: this.parts.border(style),
      alignment: this.parts.alignment(style),
    });
    this.xfs.set(key, this.written.length);
    return this.written.length;
  }

  /** The styles part, LiveDoc's styles and then `kept`: the file's differential formats and table styles (D110). */
  xml(kept = ''): string {
    const own = [...this.own].map(
      ([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escapeXmlAttribute(code)}"/>`,
    );
    const middle = this.parts.alignment(undefined);
    const xfs = this.written.map(
      ({ numFmt, font, fill, border, alignment }) =>
        `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
        (numFmt > 0 ? ' applyNumberFormat="1"' : '') +
        (font > 0 ? ' applyFont="1"' : '') +
        (fill > 0 ? ' applyFill="1"' : '') +
        (border > 0 ? ' applyBorder="1"' : '') +
        ` applyAlignment="1">${alignment}</xf>`,
    );
    const { fonts, fills, borders } = this.parts.xml();
    return (
      `<styleSheet xmlns="${SPREADSHEETML_NS}">` +
      (own.length > 0 ? `<numFmts count="${own.length}">${own.join('')}</numFmts>` : '') +
      fonts +
      fills +
      borders +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1">${middle}</xf></cellStyleXfs>` +
      `<cellXfs count="${xfs.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">${middle}</xf>${xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      kept +
      '</styleSheet>'
    );
  }
}
