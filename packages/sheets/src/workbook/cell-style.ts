// A workbook's styles (docs/specs/029-sheets/sheet-store.md "In a spreadsheet"; formatting.md "Styles in the model"):
// each distinct cell format once, by id, as ODF's automatic cell styles and OOXML's cell formats hold them; a cell
// holds a style id instead of its format. Ids are made where the table lives (the room), never by a client: `s1`,
// `s2`, ... in the order styles first appear.
import { validFormat } from '../format';
import type { CellFormat } from '../sheet';

export type StyleId = string;

const STYLE_ID = /^s([1-9]\d{0,9})$/;

/** A format with its keys in one order, so two formats that mean the same are the same text. */
function canonical(format: CellFormat): CellFormat {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(format).sort()) {
    const value = (format as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out as CellFormat;
}

export const CellStyle = {
  canonical,

  /** The text a style is found by: its canonical JSON. */
  keyOf: (format: CellFormat): string => JSON.stringify(canonical(format)),

  /** A stored or sent style, or null when it is not a cell format. */
  read: (raw: unknown): CellFormat | null => (validFormat(raw) ? canonical(raw) : null),
} as const;

export type StyleTable = {
  readonly byId: ReadonlyMap<StyleId, CellFormat>;
  readonly byKey: ReadonlyMap<string, StyleId>;
  // The number the next new style's id takes.
  readonly next: number;
};

const empty = (): StyleTable => ({ byId: new Map(), byKey: new Map(), next: 1 });

const isEmpty = (format: CellFormat | undefined): boolean =>
  !format || Object.keys(format).length === 0;

function internInto(
  byId: Map<StyleId, CellFormat>,
  byKey: Map<string, StyleId>,
  next: { n: number },
  format: CellFormat | undefined,
): StyleId | null {
  if (isEmpty(format)) return null;
  const key = CellStyle.keyOf(format!);
  const found = byKey.get(key);
  if (found) return found;
  const id = `s${next.n++}`;
  byId.set(id, canonical(format!));
  byKey.set(key, id);
  return id;
}

export const StyleTable = {
  empty,

  size: (table: StyleTable): number => table.byId.size,

  of: (table: StyleTable, id: StyleId): CellFormat | undefined => table.byId.get(id),

  idOf: (table: StyleTable, format: CellFormat): StyleId | undefined =>
    table.byKey.get(CellStyle.keyOf(format)),

  /** The style's id, made when the table has none for it; null for no style at all. */
  intern: (
    table: StyleTable,
    format: CellFormat | undefined,
  ): { table: StyleTable; id: StyleId | null } => {
    if (isEmpty(format)) return { table, id: null };
    const known = table.byKey.get(CellStyle.keyOf(format!));
    if (known) return { table, id: known };
    const made = StyleTable.internAll(table, [format]);
    return { table: made.table, id: made.ids[0]! };
  },

  /** Many formats at once (a file's cells, a migrated sheet): one copy of the table, ids in order. */
  internAll: (
    table: StyleTable,
    formats: readonly (CellFormat | undefined)[],
  ): { table: StyleTable; ids: (StyleId | null)[] } => {
    const byId = new Map(table.byId);
    const byKey = new Map(table.byKey);
    const next = { n: table.next };
    const ids = formats.map((f) => internInto(byId, byKey, next, f));
    if (next.n === table.next) return { table, ids };
    return { table: { byId, byKey, next: next.n }, ids };
  },

  /** The table from its stored rows; a row that is not a style is left out. */
  fromRows: (rows: readonly { id: string; keys: string }[]): StyleTable => {
    const byId = new Map<StyleId, CellFormat>();
    const byKey = new Map<string, StyleId>();
    let next = 1;
    for (const row of rows) {
      const n = STYLE_ID.exec(row.id);
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.keys);
      } catch {
        parsed = null;
      }
      const format = CellStyle.read(parsed);
      if (!n || !format) continue;
      byId.set(row.id, format);
      byKey.set(CellStyle.keyOf(format), row.id);
      next = Math.max(next, Number(n[1]) + 1);
    }
    return { byId, byKey, next };
  },
} as const;
