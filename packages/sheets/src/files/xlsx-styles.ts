// An XLSX file's cell styles (docs/specs/029-sheets/standard-mapping.md "Number formats in the file", "Values in
// XLSX"): each `cellXfs` entry's number format as a format code, read with ECMA-376's built-in formats (Part 1
// §18.8.30) and written with them where a code is one (D92); and which styles show dates, the only numbers that move
// between the 1900 and 1904 date systems.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  parseXml,
  type XmlElement,
} from '@livedoc/office-packages';
import { shortDateCode } from './number-format-code';
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
export type XlsxCellStyle = { code: string | null } | { unknown: true };

/** Each cell style (`cellXfs` entry) of `xl/styles.xml`'s text, in order; none when the part is absent or unread. */
export function readCellStyles(stylesXml: string | undefined, locale: string): XlsxCellStyle[] {
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
  return listed('cellXfs', 'xf').map((xf) => {
    const id = Number(attributeOf(xf, '', 'numFmtId') ?? 0);
    const code = codes.get(id) ?? xlsxBuiltinCode(id, locale);
    return code === undefined ? { unknown: true } : { code };
  });
}

// Excel's defaults of an alignment and a protection (ECMA-376 18.8.1, 18.8.33): one that says only these formats
// nothing, as LibreOffice writes on every cell style.
const XF_DEFAULTS = new Map<string, Map<string, readonly string[]>>(
  Object.entries({
    alignment: {
      horizontal: ['general'],
      vertical: ['bottom'],
      textRotation: ['0'],
      wrapText: ['0', 'false'],
      indent: ['0'],
      relativeIndent: ['0'],
      justifyLastLine: ['0', 'false'],
      shrinkToFit: ['0', 'false'],
      readingOrder: ['0'],
    },
    protection: { locked: ['1', 'true'], hidden: ['0', 'false'] },
  }).map(([local, attributes]) => [local, new Map(Object.entries(attributes))]),
);

// Whether an `xf`'s child formats the cell: any but an alignment or protection holding only Excel's defaults.
function formats(child: XmlElement): boolean {
  const defaults = XF_DEFAULTS.get(child.local);
  if (!defaults) return true;
  return child.attributes.some(
    ({ uri, local, value }) => uri !== '' || !(defaults.get(local) ?? []).includes(value),
  );
}

/**
 * The cell styles (`cellXfs` indexes) that format more than the number: a font, fill or border other than the
 * first, or an alignment or protection other than Excel's default (standard-mapping.md "Unknown content",
 * `styles_unread`, D104).
 */
export function styledCellStyles(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>();
  const parsed = stylesXml === undefined ? undefined : parseXml(stylesXml, 'xl/styles.xml');
  if (!parsed?.ok) return out;
  const holder = childElements(parsed.root).find((e) => e.local === 'cellXfs');
  const xfs = holder ? childElements(holder).filter((e) => e.local === 'xf') : [];
  xfs.forEach((xf, i) => {
    const own = ['fontId', 'fillId', 'borderId'].some(
      (id) => (attributeOf(xf, '', id) ?? '0') !== '0',
    );
    if (own || childElements(xf).some(formats)) out.add(i);
  });
  return out;
}

/** The cell styles whose number format shows a date. */
export function dateStyles(styles: readonly XlsxCellStyle[]): Set<number> {
  const out = new Set<number>();
  styles.forEach((style, i) => {
    if ('code' in style && style.code !== null && isDateFormatCode(style.code)) out.add(i);
  });
  return out;
}

/** The styles part an XLSX file is written with: one cell style per number format, in order of first use. */
export class XlsxStyles {
  private readonly xfs = new Map<string, number>();
  private readonly own = new Map<string, number>();

  /** The cell style (`c@s`) for a code: 0, the default, for none. */
  xf(code: string | undefined): number {
    if (code === undefined) return 0;
    const known = this.xfs.get(code);
    if (known !== undefined) return known;
    this.xfs.set(code, this.xfs.size + 1);
    if (!WRITTEN_BUILTINS.has(code)) this.own.set(code, XLSX_CUSTOM_FORMAT_ID + this.own.size);
    return this.xfs.size;
  }

  private numFmtId(code: string): number {
    return WRITTEN_BUILTINS.get(code) ?? this.own.get(code)!;
  }

  /** `xl/styles.xml`: Google Sheets' default font, no fill, no border, and each number format's cell style. */
  /** The styles part, LiveDoc's styles and then `kept`: the file's differential formats and table styles (D110). */
  xml(kept = ''): string {
    const own = [...this.own].map(
      ([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escapeXmlAttribute(code)}"/>`,
    );
    const xfs = [...this.xfs.keys()].map(
      (code) =>
        `<xf numFmtId="${this.numFmtId(code)}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
    );
    return (
      `<styleSheet xmlns="${SPREADSHEETML_NS}">` +
      (own.length > 0 ? `<numFmts count="${own.length}">${own.join('')}</numFmts>` : '') +
      '<fonts count="1"><font><sz val="10"/><name val="Arial"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfs.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      kept +
      '</styleSheet>'
    );
  }
}
