// Protections in ODF (docs/specs/029-sheets/standard-mapping.md "Protection in the file", D349 to D352): a protected
// sheet is its `table:table`'s `table:protected="true"`, the cells it frees those whose style's `style:cell-protect`
// does not protect them; LiveDoc's exact record in the table's `livedoc:` attributes, fingerprinted. ODF frees cells
// only by their styles, so LiveDoc writes no free cells (D350): its record keeps them.
import {
  attributeOf,
  escapeXmlAttribute,
  ODF_NS,
  type XmlAttribute,
  type XmlElement,
} from '@livedoc/office-packages';
import { PROTECTION_KEPT_ATTRIBUTES, type ProtectionKept } from '../protection';
import {
  freeRectangles,
  freeRunsOf,
  protectionFingerprint,
  protectionRecordText,
  standardProtectionOf,
  type FileProtection,
  type FreeRows,
  type FreeRun,
  type ProtectionFound,
} from './file-protections';
import { SheetLimits } from '../sheet-limits';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';

const { table: TABLE, loext: LOEXT } = ODF_NS;
// A file is read up to a spreadsheet's grid, as its cells are.
const { rows: ROWS_MAX, cols: COLS_MAX } = SheetLimits.spreadsheet;
const PREFIXES: Readonly<Record<string, string>> = { table: TABLE, loext: LOEXT };

// A kept attribute's qualified name (`table:protection-key`) by its namespace and local name.
const qualified = (uri: string, local: string) =>
  Object.entries(PREFIXES).find(([, u]) => u === uri)?.[0] + ':' + local;

/** Whether a table's attribute is its protection's, LiveDoc's to read and write (so not kept). */
export function isOdsProtectionAttribute(attribute: XmlAttribute): boolean {
  if (attribute.uri === LIVEDOC_SPREADSHEET_NS)
    return attribute.local === 'protections' || attribute.local === 'protections-fingerprint';
  if (attribute.uri === TABLE && attribute.local === 'protected') return true;
  return (
    (attribute.uri === TABLE || attribute.uri === LOEXT) &&
    PROTECTION_KEPT_ATTRIBUTES.odf.has(qualified(attribute.uri, attribute.local))
  );
}

/** A table's protection as its attributes say: whether it is protected, its kept password, LiveDoc's record. */
export function readOdsTableProtection(table: XmlElement): Omit<ProtectionFound, 'free'> {
  const isProtected = attributeOf(table, TABLE, 'protected') === 'true';
  const attributes: Record<string, string> = {};
  for (const a of table.attributes)
    if (
      (a.uri === TABLE || a.uri === LOEXT) &&
      a.local !== 'protected' &&
      isOdsProtectionAttribute(a)
    )
      attributes[qualified(a.uri, a.local)] = a.value;
  const kept: ProtectionKept | undefined =
    isProtected && Object.keys(attributes).length ? { standard: 'odf', attributes } : undefined;
  const text = attributeOf(table, LIVEDOC_SPREADSHEET_NS, 'protections');
  return {
    protected: isProtected,
    ...(kept ? { kept } : {}),
    ...(text !== undefined
      ? {
          record: {
            text,
            fingerprint: attributeOf(table, LIVEDOC_SPREADSHEET_NS, 'protections-fingerprint'),
          },
        }
      : {}),
  };
}

/** Whether a `style:cell-protect` value leaves a cell free of its sheet's protection: `none`, `formula-hidden`. */
export function cellProtectFrees(value: string | undefined): boolean {
  if (value === undefined) return false;
  const tokens = value.trim().split(/\s+/);
  return !tokens.includes('protected') && !tokens.includes('hidden-and-protected');
}

/** One cell element of a row: its first column, how many it repeats over, and its own style. */
export type OdsRowCell = { c: number; n: number; own: string | undefined };

/**
 * A protected table's free cells, row by row as the reader walks them: each cell by its own style, else its row's
 * default, else its column's; made into rectangles at the end (D352).
 */
export class OdsFreeCells {
  private readonly rows: FreeRows[] = [];
  private readonly columns: readonly FreeRun[];
  private readonly frees: (style: string | undefined) => boolean;

  // `columns`: each column's default cell style; `frees`: whether a style frees its cells.
  constructor(
    columns: readonly (string | undefined)[],
    frees: (style: string | undefined) => boolean,
  ) {
    this.frees = frees;
    const runs: [number, number][] = [];
    columns.forEach((style, c) => {
      if (!frees(style)) return;
      const last = runs.at(-1);
      if (last && last[1] === c - 1) last[1] = c;
      else runs.push([c, c]);
    });
    this.columns = runs;
  }

  // The column runs within [a, b].
  private columnsWithin(a: number, b: number): FreeRun[] {
    return this.columns.flatMap(([x, y]) =>
      y < a || x > b ? [] : [[Math.max(x, a), Math.min(y, b)] as const],
    );
  }

  /** A row element: its first row, how many it repeats over, its default cell style and its cells. */
  row(r: number, repeat: number, rowStyle: string | undefined, cells: readonly OdsRowCell[]): void {
    if (r >= ROWS_MAX) return;
    const runs: FreeRun[] = [];
    let end = 0;
    for (const { c, n, own } of cells) {
      if (c >= COLS_MAX) break;
      const b = Math.min(c + n, COLS_MAX) - 1;
      end = b + 1;
      const style = own ?? rowStyle;
      if (style !== undefined) {
        if (this.frees(style)) runs.push([c, b]);
      } else runs.push(...this.columnsWithin(c, b));
    }
    // Columns past the row's last cell are their columns' (or its row's) as if empty.
    if (end < COLS_MAX)
      runs.push(
        ...(rowStyle !== undefined
          ? this.frees(rowStyle)
            ? [[end, COLS_MAX - 1] as const]
            : []
          : this.columnsWithin(end, COLS_MAX - 1)),
      );
    const merged = freeRunsOf(runs, []).reduce<[number, number][]>((out, [a, b]) => {
      const last = out.at(-1);
      if (last && last[1] === a - 1) last[1] = b;
      else out.push([a, b]);
      return out;
    }, []);
    if (merged.length)
      this.rows.push({ r1: r, r2: Math.min(r + repeat, ROWS_MAX) - 1, runs: merged });
  }

  /** The free cells as rectangles, past 50 cut. */
  rectangles(): ReturnType<typeof freeRectangles> {
    return freeRectangles(this.rows);
  }
}

/**
 * A sheet's protections as a `table:table`'s attributes: `table:protected` (with what an ODF file's protection kept,
 * D351) for its standard protection, and LiveDoc's record; no free cells (D350). Each prefix declared on it.
 */
export function odsProtectionAttributes(list: readonly FileProtection[] | undefined): string {
  if (!list?.length) return '';
  const standard = standardProtectionOf(list);
  const kept = standard?.kept?.standard === 'odf' ? standard.kept.attributes : {};
  const loext = Object.keys(kept).some((name) => name.startsWith('loext:'));
  return [
    ...(standard ? [' table:protected="true"'] : []),
    ...Object.entries(kept).map(([name, value]) => ` ${name}="${escapeXmlAttribute(value)}"`),
    ...(loext ? [` xmlns:loext="${LOEXT}"`] : []),
    ` xmlns:livedoc="${LIVEDOC_SPREADSHEET_NS}"`,
    ` livedoc:protections="${escapeXmlAttribute(protectionRecordText(list))}"`,
    ` livedoc:protections-fingerprint="${protectionFingerprint(standard !== undefined, [])}"`,
  ].join('');
}
