// SORT, SORTN and FILTER's helpers (docs/specs/029-sheets/formulas.md "Functions": Arrays): sort keys read as Google
// reads them, a column of the range by its number or a column beside it of the range's height, and a stable order.
import type { EvalValue, Frame } from '../../engine/frame';
import { sortKeyCompare } from '../../sort';
import { arrayArg, boolArg, intArg, numArg } from '../fn';
import { dims, err, isError, scalarOf, type Scalar, type SheetError, type Value } from '../values';

/** One sort key: each row's value to sort by, and the way. */
export type RowKey = { values: Scalar[]; asc: boolean };

/** The column a sort key names: a number into the range's columns, or a one-column range of the range's height. */
export function keyColumn(
  arg: EvalValue,
  rows: readonly Value[][],
  f: Frame,
): Scalar[] | SheetError {
  const given = arrayArg(arg, f);
  const d = dims(given);
  if (d.rows === 1 && d.cols === 1) {
    const col = intArg(arg, f);
    if (isError(col)) return col;
    const width = rows[0]?.length ?? 0;
    if (col < 1 || col > width) return err('#VALUE!', `There is no column ${col} to sort by`);
    return rows.map((r) => scalarOf(r[col - 1]!));
  }
  if (d.cols !== 1 || d.rows !== rows.length)
    return err('#VALUE!', 'A range to sort by must be one column as tall as the range');
  return given.rows.map((r) => scalarOf(r[0]!));
}

// How an is_ascending reads: Google's as a truth (-1 is TRUE), or as OOXML's sort_order where -1 is descending and
// any other number a truth (SORT in a file's meaning, formulas.md).
type AscendingReading = 'truth' | 'minus-one-descends';

function ascendingOf(v: EvalValue, f: Frame, reading: AscendingReading): boolean | SheetError {
  if (reading === 'truth') return boolArg(v, f);
  const n = numArg(v, f);
  if (isError(n)) return n;
  return n !== -1 && n !== 0;
}

/** Google's pairs of sort column and is_ascending from `args[from]` on; an is_ascending left off is TRUE. */
export function rowKeys(
  args: EvalValue[],
  from: number,
  rows: readonly Value[][],
  f: Frame,
  reading: AscendingReading = 'truth',
): RowKey[] | SheetError {
  const keys: RowKey[] = [];
  for (let i = from; i < args.length; i += 2) {
    const values = keyColumn(args[i]!, rows, f);
    if (isError(values)) return values;
    const asc = args[i + 1] === undefined ? true : ascendingOf(args[i + 1]!, f, reading);
    if (isError(asc)) return asc;
    keys.push({ values, asc });
  }
  return keys;
}

/** The rows' indexes in sorted order, stable: rows equal under every key keep their order. */
export function sortedIndexes(count: number, keys: readonly RowKey[]): number[] {
  const index = Array.from({ length: count }, (_, i) => i);
  index.sort((a, b) => {
    for (const k of keys) {
      const c = sortKeyCompare(k.values[a]!, k.values[b]!, k.asc);
      if (c !== 0) return c;
    }
    return a - b;
  });
  return index;
}

/** Every column of the rows, ascending, first to last: SORTN's keys when it is given none. */
export function everyColumn(rows: readonly Value[][]): RowKey[] {
  const width = rows[0]?.length ?? 0;
  return Array.from({ length: width }, (_, j) => ({
    values: rows.map((r) => scalarOf(r[j]!)),
    asc: true,
  }));
}

/** A row's identity under the keys: equal keys, one identity (SORTN's ties and duplicates). */
export function keyIdentity(keys: readonly RowKey[], row: number): string {
  return JSON.stringify(
    keys.map((k) => {
      const v = k.values[row]!;
      return typeof v === 'string' ? `s:${v.toLowerCase()}` : v;
    }),
  );
}
