// A pivot table's formulas (docs/specs/029-sheets/pivot-tables.md "The output", D600): a calculated field's formula
// and a filter's, written over the source's column names, a name quoted ('Units') or bare (Units) when it reads as
// one. Each name is bound to what it reads: a calculated field's summary of its column over the cell's rows, or (Custom)
// the column's values there as an array; a filter's, the row's own value. The engine works the bound formula out.
import type { ColumnValues, Scalar, Value } from '../formula/values';
import { CELL_LIKE } from '../range-names';
import { summarise } from './pivot-summary';
import type { PivotCalc, PivotCalcSummary, PivotSource } from './pivot-spec';

// What a bare name may be to read as one (the parser's names), and a column's name as the formula is worked out.
const NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const columnName = (i: number) => `PIVOTCOLUMN_${i}`;

/** A formula over column names, as the engine works it out: its text with quoted names renamed, and each name's column. */
export type PivotFormula = { text: string; names: ReadonlyMap<string, number> };

/**
 * `formula` with each quoted column name ('Units', a quote inside doubled) turned into a name of its own, outside
 * strings; and every name it may read, upper case, to its column: the renamed ones and each column whose own name
 * reads as one. A quoted name no column has is left as typed.
 */
export function pivotFormula(formula: string, header: readonly string[]): PivotFormula {
  const byName = new Map<string, number>();
  header.forEach((name, i) => {
    const key = name.trim().toUpperCase();
    if (!byName.has(key)) byName.set(key, i);
  });
  const names = new Map<string, number>();
  for (const [key, i] of byName)
    if (NAME.test(key) && !CELL_LIKE.test(key) && key !== 'TRUE' && key !== 'FALSE')
      names.set(key, i);
  let text = '';
  for (let at = 0; at < formula.length;) {
    const ch = formula[at]!;
    const close = ch === '"' || ch === "'" ? endOf(formula, at) : -1;
    if (close < 0) {
      text += ch;
      at++;
      continue;
    }
    const part = formula.slice(at, close + 1);
    const col =
      ch === "'"
        ? byName.get(part.slice(1, -1).replaceAll("''", "'").trim().toUpperCase())
        : undefined;
    if (col === undefined) text += part;
    else {
      text += columnName(col);
      names.set(columnName(col), col);
    }
    at = close + 1;
  }
  return { text, names };
}

// Where a quoted run starting at `at` ends (its closing quote; a doubled quote inside it is one), or -1 when it is open.
function endOf(text: string, at: number): number {
  const q = text[at]!;
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] !== q) continue;
    if (text[i + 1] === q) i++;
    else return i;
  }
  return -1;
}

/** A column's values over `rows`, as a one-column array that reads as a range. */
const columnOf = (source: PivotSource, col: number, rows: readonly number[]): ColumnValues => ({
  rows: rows.map((r) => [source.rows[r]?.[col]?.v ?? null]),
  readsAsRange: true,
});

/**
 * The engine's `PivotCalc` over `source`: each formula read once, its names bound and worked out by `work` (the
 * formula's text and its names' values, by upper-case name); a filter keeps a row whose formula is TRUE or a number
 * other than zero.
 */
export function pivotCalc(
  source: PivotSource,
  work: (text: string, scope: ReadonlyMap<string, Value>) => Scalar,
): PivotCalc {
  const read = new Map<string, PivotFormula>();
  const formulaOf = (formula: string) => {
    let f = read.get(formula);
    if (!f) read.set(formula, (f = pivotFormula(formula, source.header)));
    return f;
  };
  const bound = (f: PivotFormula, value: (col: number) => Value) =>
    work(f.text, new Map([...f.names].map(([name, col]) => [name, value(col)])));
  return {
    field(formula: string, summary: PivotCalcSummary, rows: readonly number[]): Scalar {
      return bound(formulaOf(formula), (col) =>
        summary === 'CUSTOM'
          ? columnOf(source, col, rows)
          : summarise(
              summary,
              rows.map((r) => source.rows[r]?.[col]?.v ?? null),
            ),
      );
    },
    holds(formula: string, row: number): boolean {
      const v = bound(formulaOf(formula), (col) => source.rows[row]?.[col]?.v ?? null);
      return v === true || (typeof v === 'number' && v !== 0);
    },
  };
}
