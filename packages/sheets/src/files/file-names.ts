// Named ranges in a file (docs/specs/029-sheets/standard-mapping.md "Named ranges in the file", D343, D344): each a
// name of the workbook, its cells with their sheet and absolute; XLSX's `definedName`, ODF's `table:named-range`. What
// LiveDoc cannot read stays the file's own, kept and named; a name is written once.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  keptXmlOf,
  ODF_NS,
  textContent,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import { parseFormula } from '../formula/parse';
import { VIEW_NAME } from './xlsx-filters';
import { posRangeOf } from '../layout';
import { rangeNameProblem } from '../range-names';
import type { RangeName, Sheet, SheetLayout } from '../sheet';
import { a1Text } from './a1-text';
import type { FileRange } from './file-charts';
import type { FileAt, KeptItem } from './kept-content';
import { parseOdfRef } from './ods-charts-read';
import { columnLetters } from '../address';
import type { FileLoss } from './workbook-file';

const { table: TABLE } = ODF_NS;

/**
 * A named range as a file holds it: its name, the sheet it covers (by its place among the file's sheets) and its cells,
 * zero-based. `kept`: read, the name as the file wrote it, kept again when LiveDoc cannot hold it.
 */
export type FileRangeName = FileRange & { name: string; sheet: number; kept?: KeptItem<FileAt> };

/** Every sheet's named ranges in tab order, each by its cells' places; one whose cells are gone is left out. */
export function fileNamesOf(sheets: readonly Sheet[]): FileRangeName[] {
  return sheets.flatMap((sheet, at) =>
    (sheet.layout.names ?? []).flatMap((x) => {
      const range = posRangeOf(sheet.layout, x);
      return range ? [{ name: x.name, sheet: at, ...range }] : [];
    }),
  );
}

// Names Excel refuses, as they read as its R1C1 row and column.
const EXCEL_REFUSED_NAME = /^[RC]$/i;

/** Whether Excel refuses a name LiveDoc allows. */
export const excelRefuses = (name: string): boolean => EXCEL_REFUSED_NAME.test(name);

/**
 * The names a write holds: each once, case aside, the first in tab order (D297's names on two sheets), and in XLSX
 * none Excel refuses; each left out is named (D344).
 */
export function namesToWrite(
  names: readonly FileRangeName[] | undefined,
  xlsx: boolean,
  losses: FileLoss[],
): FileRangeName[] {
  const seen = new Set<string>();
  const out: FileRangeName[] = [];
  for (const name of names ?? []) {
    const upper = name.name.toUpperCase();
    if (seen.has(upper) || (xlsx && excelRefuses(name.name))) {
      losses.push({ k: 'name_unwritten', name: name.name });
      continue;
    }
    seen.add(upper);
    out.push(name);
  }
  return out;
}

/** A named range as an XLSX workbook's `definedName`: `'My data'!$A$1:$B$4`, the sheet as `titles` writes it. */
export function xlsxNameXml(name: FileRangeName, titles: readonly string[]): string {
  const single = name.r1 === name.r2 && name.c1 === name.c2;
  const at = a1Text(
    {
      sheet: titles[name.sheet]!,
      r1: name.r1,
      c1: name.c1,
      ...(single ? {} : { r2: name.r2, c2: name.c2 }),
      a: 15,
    },
    true,
  );
  return `<definedName name="${escapeXmlAttribute(name.name)}">${escapeXmlAttribute(at)}</definedName>`;
}

// A cell of an ODF address, absolute: `$B$2`.
const odfAt = (r: number, c: number) => `$${columnLetters(c)}$${r + 1}`;

/** A named range as an ODF `table:named-range` (`$'My data'.$A$1:.$B$4`), the sheet as `titles` writes it. */
export function odsNameXml(name: FileRangeName, titles: readonly string[]): string {
  const base = `$'${titles[name.sheet]!.replace(/'/g, "''")}'.${odfAt(name.r1, name.c1)}`;
  const single = name.r1 === name.r2 && name.c1 === name.c2;
  const range = single ? base : `${base}:.${odfAt(name.r2, name.c2)}`;
  return (
    `<table:named-range table:name="${escapeXmlAttribute(name.name)}"` +
    ` table:base-cell-address="${escapeXmlAttribute(base)}"` +
    ` table:cell-range-address="${escapeXmlAttribute(range)}"/>`
  );
}

const HOLDER = /^<([\w.-]+:named-expressions)\b([^>]*?)(\/?)>/;

// A holder's children: each a named range, expression or database range, as written.
const CHILD =
  /<([\w.-]+):(named-range|named-expression|named-database-range)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1:\2>)/g;
const CHILD_NAME = /\s[\w.-]+:name="([^"]*)"/;

/**
 * The kept content after the tables with the spreadsheet's names in one `table:named-expressions`: the kept ones'
 * children (every kept holder's, in their order) then `own` (`named`, upper case, the names they take), where the
 * first kept holder sat, else first (the schema's place for it after the tables). A kept name `own` takes gives way
 * to it, counted in `dropped` (D344).
 */
export function withOdsNames(
  after: readonly string[],
  own: readonly string[],
  named: ReadonlySet<string>,
): { xml: string[]; dropped: number } {
  const holders = after.flatMap((xml, i) => (HOLDER.test(xml) ? [i] : []));
  if (holders.length === 0 && own.length === 0) return { xml: [...after], dropped: 0 };
  let dropped = 0;
  const children = holders.flatMap((i) =>
    [...after[i]!.matchAll(CHILD)].flatMap((m) => {
      // A kept name without its name never gives way.
      const name = CHILD_NAME.exec(m[0]);
      if (!name || !named.has(name[1]!.toUpperCase())) return [m[0]];
      dropped++;
      return [];
    }),
  );
  const first = holders[0];
  const opening = first === undefined ? null : HOLDER.exec(after[first]!)!;
  const [tag, attributes] = opening ? [opening[1]!, opening[2]!] : ['table:named-expressions', ''];
  const inner = [...children, ...own];
  // A holder the file left empty stays as it was.
  const merged = inner.length
    ? [`<${tag}${attributes}>${inner.join('')}</${tag}>`]
    : [`<${tag}${attributes}/>`];
  const rest = after.filter((_, i) => !holders.includes(i));
  const at = first ?? 0;
  return { xml: [...rest.slice(0, at), ...merged, ...rest.slice(at)], dropped };
}

/** Whether a defined name (`own`) is Excel's own (`_xlnm.Print_Area`) or hidden: kept, never a person's name (D343). */
export function isExcelOwnName(own: string, name: XmlElement): boolean {
  const hidden = attributeOf(name, '', 'hidden');
  return own.toLowerCase().startsWith('_xlnm.') || hidden === '1' || hidden === 'true';
}

// One cell or one rectangle of a named sheet, as a reference reads: null for anything else.
function oneRectangle(text: string): { sheet: string; range: FileRange } | null {
  const parsed = parseFormula(`=${text.trim()}`);
  if (!parsed.ok || parsed.ast.k !== 'ref') return null;
  const ref = parsed.ast.ref;
  if (ref.sheet === undefined || ref.r1 === undefined || ref.c1 === undefined) return null;
  // Whole columns and rows have no first row or column; an open-ended range (`A2:A`) and a spill no last one.
  if (ref.open || ref.spill) return null;
  const r2 = ref.r2 ?? ref.r1;
  const c2 = ref.c2 ?? ref.c1;
  return {
    sheet: ref.sheet,
    range: {
      r1: Math.min(ref.r1, r2),
      c1: Math.min(ref.c1, c2),
      r2: Math.max(ref.r1, r2),
      c2: Math.max(ref.c1, c2),
    },
  };
}

/**
 * A workbook's defined name (`own`) as a named range, when it names one cell or rectangle of one of the file's
 * sheets (`sheetAt` finds a sheet's place by its name); else null.
 */
export function xlsxRangeName(
  own: string,
  name: XmlElement,
  sheetAt: (title: string) => number | undefined,
  kept: KeptItem<FileAt>,
): FileRangeName | null {
  const read = oneRectangle(textContent(name));
  const sheet = read ? sheetAt(read.sheet) : undefined;
  if (!read || sheet === undefined) return null;
  return { name: own, sheet, ...read.range, kept };
}

/** An ODF spreadsheet's names read: the named ranges LiveDoc holds, the elements read, and the names it cannot. */
export type OdsNamesRead = { names: FileRangeName[]; read: Set<XmlElement>; unread: string[] };

// The names of a holder's children (`table:named-range`, `table:named-expression`).
const namesIn = (holder: XmlElement | undefined): string[] =>
  (holder ? childElements(holder) : []).flatMap((e) => attributeOf(e, TABLE, 'name') ?? []);

/**
 * An ODF spreadsheet's `table:named-expressions`: each `table:named-range` of one cell or rectangle of one of its
 * sheets is read; the rest are the file's own, named, as is every name a table holds for itself (D343).
 */
export function readOdsNames(
  parsed: XmlParsed,
  spreadsheet: XmlElement,
  sheetAt: (title: string) => number | undefined,
): OdsNamesRead {
  const out: OdsNamesRead = { names: [], read: new Set(), unread: [] };
  const holder = childElement(spreadsheet, TABLE, 'named-expressions');
  for (const element of holder ? childElements(holder) : []) {
    const name = attributeOf(element, TABLE, 'name');
    if (!name) continue;
    // A filter view's range as Google's and LibreOffice's ODS keep it: the file's own, kept, never named
    // (standard-mapping.md "Filters in the file").
    if (VIEW_NAME.test(name)) continue;
    const ref =
      element.uri === TABLE && element.local === 'named-range'
        ? parseOdfRef(attributeOf(element, TABLE, 'cell-range-address') ?? '')
        : null;
    const sheet = ref ? sheetAt(ref.sheet) : undefined;
    if (!ref || sheet === undefined) {
      out.unread.push(name);
      continue;
    }
    // Kept again on its own, should LiveDoc refuse it, in a holder of its own that the writer merges.
    const kept = keptXmlOf(parsed, element);
    const xml = `<table:named-expressions>${kept.xml}</table:named-expressions>`;
    const item: KeptItem<FileAt> = {
      place: 'spreadsheet-after',
      xml,
      ns: { table: TABLE, ...kept.ns },
      at: {},
    };
    out.names.push({ name, sheet, ...ref.range, kept: item });
    out.read.add(element);
  }
  for (const table of childElements(spreadsheet))
    if (table.uri === TABLE && table.local === 'table')
      out.unread.push(...namesIn(childElement(table, TABLE, 'named-expressions')));
  return out;
}

/**
 * A file's named ranges on the sheets made of it, by the sheets' places: each by its cells' ids, the rules checked
 * against the names before it. One past the sheets or their cells, or one the rules refuse, is `refused`: its file's
 * own XML, to keep, and named.
 */
export function namesFromFile(
  names: readonly FileRangeName[] | undefined,
  layouts: readonly SheetLayout[],
  losses: FileLoss[],
): { names: Map<number, RangeName[]>; refused: KeptItem<FileAt>[] } {
  const made = new Map<number, RangeName[]>();
  const refused: KeptItem<FileAt>[] = [];
  const withNames = (at: number, layout: SheetLayout): SheetLayout => ({
    ...layout,
    names: made.get(at) ?? [],
  });
  for (const name of names ?? []) {
    const layout = layouts[name.sheet];
    const ids = layout && {
      r1: layout.rows[name.r1],
      c1: layout.cols[name.c1],
      r2: layout.rows[name.r2],
      c2: layout.cols[name.c2],
    };
    const others = layouts.flatMap((l, i) => (i === name.sheet ? [] : [withNames(i, l)]));
    const fits = ids && ids.r1 && ids.c1 && ids.r2 && ids.c2;
    if (!fits || rangeNameProblem(name.name, withNames(name.sheet, layout), { others })) {
      losses.push({ k: 'name_unread', name: name.name });
      if (name.kept) refused.push(name.kept);
      continue;
    }
    const range = { name: name.name, r1: ids.r1!, c1: ids.c1!, r2: ids.r2!, c2: ids.c2! };
    made.set(name.sheet, [...(made.get(name.sheet) ?? []), range]);
  }
  return { names: made, refused };
}
