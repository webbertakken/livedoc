// Table references (docs/specs/029-sheets/formulas.md "Table references"): Google's and Excel's grammar read into a
// spec (the table's name, its columns by name, its parts), written back as text, and resolved to the cells they read.
import { tableBracketLength } from '../formula/tokens';
import { layoutIndex } from '../layout';
import type { SheetLayout } from '../sheet';
import { tableBox, type SheetTable } from './table';

/** A table's parts a reference reads, as bits: its header row, data rows, total row, or the formula's own row. */
export const TableArea = { headers: 1, data: 2, totals: 4, thisRow: 8 } as const;
const ALL = TableArea.headers | TableArea.data | TableArea.totals;

/** A table reference as typed: the table's name (null: the table the formula is in), its columns, its parts. */
export type TableSpec = {
  readonly table: string | null;
  readonly cols: readonly [string, string] | null;
  readonly area: number;
};

const SPECIALS: Readonly<Record<string, number>> = {
  '#all': ALL,
  '#data': TableArea.data,
  '#headers': TableArea.headers,
  '#totals': TableArea.totals,
  '#this row': TableArea.thisRow,
};

// The joins of parts a reference may name, as Excel's grammar admits them.
const AREAS = new Set([
  TableArea.headers,
  TableArea.data,
  TableArea.totals,
  TableArea.headers | TableArea.data,
  TableArea.data | TableArea.totals,
  ALL,
  TableArea.thisRow,
]);

// A column name with Excel's escapes taken off: `'` before `[`, `]`, `#` or `'`.
function unescape(text: string): string {
  return text.replace(/'(.)/g, '$1');
}

// Reads `[...]` from `at` (the opening bracket), honouring escapes; the inside and the index after the close.
function bracketed(text: string, at: number): { inner: string; end: number } | null {
  if (text[at] !== '[') return null;
  for (let i = at + 1; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "'") i++;
    else if (ch === '[') return null;
    else if (ch === ']') return { inner: text.slice(at + 1, i), end: i + 1 };
  }
  return null;
}

type Item = { area: number } | { cols: [string, string] };

// One item of a list: `[#Totals]`, `[Amount]` or `[Amount]:[Tax]`.
function listItem(text: string, at: number): { item: Item; end: number } | null {
  const first = bracketed(text, at);
  if (!first) return null;
  const special = SPECIALS[first.inner.trim().toLowerCase()];
  if (special !== undefined) return { item: { area: special }, end: first.end };
  const name = unescape(first.inner).trim();
  if (!name) return null;
  let end = first.end;
  while (text[end] === ' ') end++;
  if (text[end] !== ':') return { item: { cols: [name, name] }, end: first.end };
  end++;
  while (text[end] === ' ') end++;
  const second = bracketed(text, end);
  const other = second && unescape(second.inner).trim();
  if (!second || !other || SPECIALS[other.toLowerCase()] !== undefined) return null;
  return { item: { cols: [name, other] }, end: second.end };
}

// The inside of a reference's brackets: a column, a part, `@` and a column, or a list of items.
function readInner(inner: string): Omit<TableSpec, 'table'> | null {
  const text = inner.trim();
  if (!text) return { cols: null, area: TableArea.data };
  if (text.startsWith('@')) {
    const rest = text.slice(1).trim();
    if (!rest) return { cols: null, area: TableArea.thisRow };
    if (!rest.startsWith('['))
      return { cols: [unescape(rest), unescape(rest)], area: TableArea.thisRow };
    const one = readList(rest);
    return one && one.area === TableArea.data && one.cols
      ? { cols: one.cols, area: TableArea.thisRow }
      : null;
  }
  if (text.startsWith('[')) return readList(text);
  const special = SPECIALS[text.toLowerCase()];
  if (special !== undefined) return { cols: null, area: special };
  if (/[[\]]/.test(text.replace(/'./g, ''))) return null;
  const name = unescape(text);
  return { cols: [name, name], area: TableArea.data };
}

function readList(text: string): Omit<TableSpec, 'table'> | null {
  let area = 0;
  let cols: [string, string] | null = null;
  let at = 0;
  for (;;) {
    while (text[at] === ' ') at++;
    const read = listItem(text, at);
    if (!read) return null;
    if ('area' in read.item) {
      if (area & read.item.area) return null;
      area |= read.item.area;
    } else {
      if (cols) return null;
      cols = read.item.cols;
    }
    at = read.end;
    while (text[at] === ' ') at++;
    if (at >= text.length) break;
    if (text[at] !== ',') return null;
    at++;
  }
  const parts = area || TableArea.data;
  return AREAS.has(parts) ? { cols, area: parts } : null;
}

/** A table reference's text (`Table1[Amount]`, `[@Amount]`) read into its spec, or null when it is not one. */
export function parseTableRef(text: string): TableSpec | null {
  const open = text.indexOf('[');
  if (open < 0) return null;
  const name = text.slice(0, open);
  if (name && !/^[A-Za-z_\\][A-Za-z0-9_.]*$/.test(name)) return null;
  if (tableBracketLength(text, open) !== text.length - open) return null;
  const inner = readInner(text.slice(open + 1, -1));
  return inner ? { table: name || null, ...inner } : null;
}

const SPECIAL_TEXT: Readonly<Record<number, string>> = {
  [ALL]: '#ALL',
  [TableArea.data]: '#DATA',
  [TableArea.headers]: '#HEADERS',
  [TableArea.totals]: '#TOTALS',
};

// A column name as a reference writes it: Excel's escapes before `[`, `]`, `#` and `'`.
function escapeColumn(name: string): string {
  return name.replace(/(['[\]#])/g, "'$1");
}

// The parts' items: one special, or two joined (`[#HEADERS],[#DATA]`).
function areaItems(area: number): string[] {
  const one = SPECIAL_TEXT[area];
  if (one) return [`[${one}]`];
  return [TableArea.headers, TableArea.data, TableArea.totals]
    .filter((bit) => area & bit)
    .map((bit) => `[${SPECIAL_TEXT[bit]}]`);
}

/** A table reference as Google's text writes it, the table by its formula name. */
export function formatTableRef(
  name: string,
  cols: readonly [string, string] | null,
  area: number,
): string {
  const colText =
    cols &&
    (cols[0] === cols[1]
      ? `[${escapeColumn(cols[0])}]`
      : `[${escapeColumn(cols[0])}]:[${escapeColumn(cols[1])}]`);
  if (area === TableArea.thisRow) {
    if (!cols) return `${name}[@]`;
    const simple = cols[0] === cols[1] && /^[A-Za-z0-9_]+$/.test(cols[0]);
    return `${name}[@${simple ? cols[0] : colText}]`;
  }
  if (area === TableArea.data) {
    if (!cols) return name;
    if (cols[0] === cols[1]) return `${name}${colText}`;
    return `${name}[${colText}]`;
  }
  const items = areaItems(area);
  if (!cols) return items.length === 1 ? `${name}${items[0]}` : `${name}[${items.join(',')}]`;
  return `${name}[${[...items, colText].join(',')}]`;
}

const EXCEL_SPECIAL_TEXT: Readonly<Record<number, string>> = {
  [ALL]: '#All',
  [TableArea.data]: '#Data',
  [TableArea.headers]: '#Headers',
  [TableArea.totals]: '#Totals',
  [TableArea.thisRow]: '#This Row',
};

/**
 * A table reference in Excel's file form (standard-mapping.md "Tables in the file"): this row as `[#This Row]`, the
 * table alone as `Sales[]`, parts as Excel writes them (`#All`); it reads back as the same reference.
 */
export function formatExcelTableRef(
  name: string,
  cols: readonly [string, string] | null,
  area: number,
): string {
  const colText =
    cols &&
    (cols[0] === cols[1]
      ? `[${escapeColumn(cols[0])}]`
      : `[${escapeColumn(cols[0])}]:[${escapeColumn(cols[1])}]`);
  if (area === TableArea.data) {
    if (!cols) return `${name}[]`;
    return cols[0] === cols[1] ? `${name}${colText}` : `${name}[${colText}]`;
  }
  const one = EXCEL_SPECIAL_TEXT[area];
  const items = one
    ? [`[${one}]`]
    : [TableArea.headers, TableArea.data, TableArea.totals]
        .filter((bit) => area & bit)
        .map((bit) => `[${EXCEL_SPECIAL_TEXT[bit]}]`);
  if (!cols) return items.length === 1 ? `${name}${items[0]}` : `${name}[${items.join(',')}]`;
  return `${name}[${[...items, colText].join(',')}]`;
}

/** The rows a table's parts cover (positions), or null when it has none of them (`#TOTALS` with no total row). */
export function tableAreaRows(
  layout: SheetLayout,
  table: SheetTable,
  area: number,
  row?: number,
): { r1: number; r2: number } | null {
  const p = tableBox(layout, table);
  if (!p) return null;
  const firstData = p.r1 + 1;
  const lastData = table.total ? p.r2 - 1 : p.r2;
  if (area === TableArea.thisRow)
    return row !== undefined && row >= firstData && row <= lastData ? { r1: row, r2: row } : null;
  const r1 =
    area & TableArea.headers ? p.r1 : area & TableArea.data ? firstData : table.total ? p.r2 : -1;
  const r2 =
    area & TableArea.totals
      ? table.total
        ? p.r2
        : lastData
      : area & TableArea.data
        ? lastData
        : p.r1;
  if (r1 < 0 || (area === TableArea.totals && !table.total)) return null;
  return { r1, r2 };
}

/** The columns (positions) of a table between two column ids, or every column; null when one is not the table's. */
export function tableAreaCols(
  layout: SheetLayout,
  table: SheetTable,
  c1?: string,
  c2?: string,
): { c1: number; c2: number } | null {
  const p = tableBox(layout, table);
  if (!p) return null;
  if (c1 === undefined) return { c1: p.c1, c2: p.c2 };
  const ix = layoutIndex(layout);
  const a = ix.colPos.get(c1);
  const b = ix.colPos.get(c2 ?? c1);
  if (a === undefined || b === undefined) return null;
  if (a < p.c1 || a > p.c2 || b < p.c1 || b > p.c2) return null;
  return { c1: Math.min(a, b), c2: Math.max(a, b) };
}
