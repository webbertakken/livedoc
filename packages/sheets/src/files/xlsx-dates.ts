// Which XLSX cells hold dates (docs/specs/029-sheets/standard-mapping.md "Values in XLSX"): a number is a date when
// its cell style's number format is one, built in (ECMA-376 Part 1 §18.8.30) or a format code that shows a day, month,
// year, hour, minute or second. Only dates move between the 1900 and 1904 date systems.
import { attributeOf, childElement, childElements, parseXml } from '@livedoc/office-packages';
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

/** Whether a format code shows a date or a time: a date part outside its quoted text, escapes and brackets. */
export function isDateFormatCode(code: string): boolean {
  const first = code
    .replace(/"[^"]*"/g, '')
    .replace(/[\\_*]./g, '')
    .split(';')[0]!;
  const bare = first.replace(/\[(?![hms]+\])[^\]]*\]/gi, '');
  return /[dmyhs]/i.test(bare);
}

/** The indexes of the cell styles (`cellXfs`) whose number format is a date, from `xl/styles.xml`'s text. */
export function dateStyles(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>();
  if (stylesXml === undefined) return out;
  const parsed = parseXml(stylesXml, 'xl/styles.xml');
  if (!parsed.ok) return out;
  const ns = parsed.root.uri === STRICT_NS ? STRICT_NS : SPREADSHEETML_NS;
  const listed = (list: string, item: string) => {
    const holder = childElement(parsed.root, ns, list);
    return holder ? childElements(holder).filter((e) => e.local === item) : [];
  };
  const codes = new Map<number, string>();
  for (const fmt of listed('numFmts', 'numFmt'))
    codes.set(Number(attributeOf(fmt, '', 'numFmtId')), attributeOf(fmt, '', 'formatCode') ?? '');
  listed('cellXfs', 'xf').forEach((xf, i) => {
    const id = Number(attributeOf(xf, '', 'numFmtId') ?? 0);
    const code = codes.get(id);
    if (code === undefined ? XLSX_DATE_FORMAT_IDS.has(id) : isDateFormatCode(code)) out.add(i);
  });
  return out;
}
