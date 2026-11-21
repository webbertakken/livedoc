// Array functions (docs/specs/029-sheets/formulas.md "Functions": Arrays, "Arrays and spills"). Each returns an
// array that spills; results are bounded by ARRAY_CELLS_MAX.
import type { EvalValue, Frame } from '../../engine/frame';
import {
  MANY,
  arrayArg,
  arrayArgs,
  boolArg,
  deref,
  fn,
  intArg,
  numArg,
  opt,
  tooBig,
  volatileFn,
  type FnDef,
} from '../fn';
import { dims, err, isError, scalarOf, toBool, type Value, type ValueArray } from '../values';
import { ARRAY_SHAPE_FUNCTIONS } from './array-shape';
import { MATRIX_FUNCTIONS } from './matrices';
import { REGRESSION_FUNCTIONS } from './regression';
import { QUERY_FUNCTIONS } from './query';
import { everyColumn, keyIdentity, rowKeys, sortedIndexes, type RowKey } from './sorting';

const NOTHING = err('#N/A', 'No rows matched');

// A row's identity for UNIQUE. Text keeps its case, as Google Sheets' UNIQUE does ("Apple" and "apple" are two rows).
function cellKey(row: Value[]): string {
  return JSON.stringify(
    row.map((x) => {
      const s = scalarOf(x);
      return typeof s === 'string' ? `s:${s}` : s;
    }),
  );
}

// OOXML's SORT: by the column (or, by_col, the row) numbered sort_index, 1 ascending or -1 descending.
function ooxmlSort(range: ValueArray, args: EvalValue[], f: Frame): Value {
  const index = intArg(args[1]!, f);
  const order = intArg(args[2]!, f);
  const byCol = boolArg(args[3]!, f);
  if (isError(index)) return index;
  if (isError(order)) return order;
  if (isError(byCol)) return byCol;
  if (order !== 1 && order !== -1) return err('#VALUE!', 'The sort order is 1 or -1');
  const lines = byCol ? transposed(range) : range.rows;
  const width = lines[0]?.length ?? 0;
  if (index < 1 || index > width)
    return err('#VALUE!', `There is no ${byCol ? 'row' : 'column'} ${index} to sort by`);
  const key: RowKey = { values: lines.map((l) => scalarOf(l[index - 1]!)), asc: order === 1 };
  const sorted = sortedIndexes(lines.length, [key]).map((i) => lines[i]!);
  return { rows: byCol ? transposed({ rows: sorted }) : sorted };
}

function transposed(a: ValueArray): Value[][] {
  const d = dims(a);
  const out: Value[][] = [];
  for (let j = 0; j < d.cols; j++) out.push(a.rows.map((r) => r[j]!));
  return out;
}

// SORTN's rows, sorted: the first n (mode 0); and every row tied with the nth (1); the first n of distinct keys (2);
// every row of the first n distinct keys (3). Rows tie, or duplicate, when their sort keys are equal.
function firstN(order: number[], keys: readonly RowKey[], n: number, mode: number): number[] {
  const id = (i: number) => keyIdentity(keys, i);
  if (mode === 0) return order.slice(0, n);
  if (mode === 1) {
    const out = order.slice(0, n);
    const last = out.length === n ? id(out[n - 1]!) : null;
    for (let k = n; k < order.length && last !== null && id(order[k]!) === last; k++)
      out.push(order[k]!);
    return out;
  }
  const kept = new Set<string>();
  const out: number[] = [];
  for (const i of order) {
    const k = id(i);
    if (!kept.has(k)) {
      if (kept.size === n) {
        if (mode === 2) break;
        continue;
      }
      kept.add(k);
      out.push(i);
    } else if (mode === 3) out.push(i);
  }
  return out;
}

export const ARRAY_FUNCTIONS: Record<string, FnDef> = {
  FILTER: fn(2, MANY, (args, f) => {
    const range = arrayArg(args[0]!, f);
    const d = dims(range);
    let conds = args.slice(1).map((a) => arrayArg(a, f));
    // A single value after one condition longer than one cannot be a condition (Google refuses it): it is OOXML's
    // if_empty, what FILTER gives when nothing passes (D38).
    const one = (a: ValueArray) => dims(a).rows === 1 && dims(a).cols === 1;
    const ifEmpty = conds.length === 2 && one(conds[1]!) && !one(conds[0]!) ? conds[1]! : null;
    if (ifEmpty) conds = conds.slice(0, 1);
    const nothing = ifEmpty ? scalarOf(ifEmpty.rows[0]![0]!) : NOTHING;
    // Conditions run along the rows (a column of TRUE/FALSE) or along the columns (a row of them).
    const byRows = conds.every((c) => dims(c).rows === d.rows && dims(c).cols === 1);
    const byCols = !byRows && conds.every((c) => dims(c).cols === d.cols && dims(c).rows === 1);
    if (!byRows && !byCols)
      return err('#VALUE!', 'FILTER conditions must match the range in length');
    const n = byRows ? d.rows : d.cols;
    const keep: boolean[] = [];
    for (let i = 0; i < n; i++) {
      let ok = true;
      for (const c of conds) {
        const v = scalarOf(byRows ? c.rows[i]![0]! : c.rows[0]![i]!);
        if (isError(v)) return v;
        const b = toBool(v);
        if (isError(b)) return b;
        if (!b) ok = false;
      }
      keep.push(ok);
    }
    if (byRows) {
      const rows = range.rows.filter((_, i) => keep[i]);
      return rows.length ? { rows } : nothing;
    }
    const rows = range.rows.map((r) => r.filter((_, j) => keep[j]));
    return rows[0]?.length ? { rows } : nothing;
  }),
  SORT: fn(1, MANY, (args, f) => {
    const range = arrayArg(args[0]!, f);
    // Four arguments are OOXML's SORT(array, sort_index, sort_order, by_col), which Google refuses (D38).
    if (args.length === 4) return ooxmlSort(range, args, f);
    // In a file's meaning, -1 sorts descending, as both standards' sort_order (formulas.md, the file's meaning).
    const reading = f.meaning === 'google' ? 'truth' : 'minus-one-descends';
    const keys =
      args.length > 1
        ? rowKeys(args, 1, range.rows, f, reading)
        : everyColumn(range.rows).slice(0, 1);
    if (isError(keys)) return keys;
    return { rows: sortedIndexes(range.rows.length, keys).map((i) => range.rows[i]!) };
  }),
  SORTN: fn(1, MANY, (args, f) => {
    const range = arrayArg(args[0]!, f);
    const n = opt(args, 1, f, intArg, 1);
    if (isError(n)) return n;
    if (n < 1) return err('#NUM!', 'SORTN needs at least one row to give');
    const mode = opt(args, 2, f, intArg, 0);
    if (isError(mode)) return mode;
    if (mode < 0 || mode > 3) return err('#NUM!', 'SORTN shows ties by 0, 1, 2 or 3');
    const keys = args.length > 3 ? rowKeys(args, 3, range.rows, f) : everyColumn(range.rows);
    if (isError(keys)) return keys;
    const picked = firstN(sortedIndexes(range.rows.length, keys), keys, n, mode);
    return picked.length ? { rows: picked.map((i) => range.rows[i]!) } : NOTHING;
  }),
  SORTBY: fn(2, MANY, (args, f) => {
    const range = arrayArg(args[0]!, f);
    const d = dims(range);
    const keys: RowKey[] = [];
    for (let i = 1; i < args.length; i += 2) {
      const by = arrayArg(args[i]!, f);
      if (dims(by).rows !== d.rows) return err('#VALUE!', 'SORTBY ranges must match the rows');
      const order = opt(args, i + 1, f, intArg, 1);
      if (isError(order)) return order;
      keys.push({ values: by.rows.map((r) => scalarOf(r[0]!)), asc: order !== -1 });
    }
    return { rows: sortedIndexes(range.rows.length, keys).map((i) => range.rows[i]!) };
  }),
  UNIQUE: fn(1, 3, (args, f) => {
    const range = arrayArg(args[0]!, f);
    const byCol = opt(args, 1, f, boolArg, false);
    const once = opt(args, 2, f, boolArg, false);
    if (isError(byCol)) return byCol;
    if (isError(once)) return once;
    const lines = byCol ? range.rows[0]!.map((_, j) => range.rows.map((r) => r[j]!)) : range.rows;
    const counts = new Map<string, number>();
    for (const l of lines) counts.set(cellKey(l), (counts.get(cellKey(l)) ?? 0) + 1);
    const seen = new Set<string>();
    const out: Value[][] = [];
    for (const l of lines) {
      const k = cellKey(l);
      if (seen.has(k)) continue;
      seen.add(k);
      if (once && counts.get(k)! > 1) continue;
      out.push(l);
    }
    if (out.length === 0) return NOTHING;
    return byCol ? { rows: out[0]!.map((_, i) => out.map((l) => l[i]!)) } : { rows: out };
  }),
  SEQUENCE: fn(1, 4, (args, f) => {
    const rows = intArg(args[0]!, f);
    const cols = opt(args, 1, f, intArg, 1);
    const start = opt(args, 2, f, numArg, 1);
    const step = opt(args, 3, f, numArg, 1);
    for (const x of [rows, cols, start, step]) if (isError(x)) return x;
    const [r, c, s, st] = [rows, cols, start, step] as number[];
    if (r! < 1 || c! < 1) return err('#VALUE!', 'SEQUENCE needs at least one row and column');
    if (tooBig(r!, c!)) return err('#NUM!', 'The result is too large');
    const out: Value[][] = [];
    for (let i = 0; i < r!; i++) {
      const row: Value[] = [];
      for (let j = 0; j < c!; j++) row.push(s! + (i * c! + j) * st!);
      out.push(row);
    }
    return { rows: out };
  }),
  TRANSPOSE: fn(1, 1, (args, f) => ({ rows: transposed(arrayArg(args[0]!, f)) })),
  // The identity matrix of a size.
  MUNIT: fn(1, 1, (args, f) => {
    const n = intArg(args[0]!, f);
    if (isError(n)) return n;
    if (n < 1) return err('#VALUE!', 'MUNIT needs a size of at least 1');
    if (tooBig(n, n)) return err('#NUM!', 'The result is too large');
    return {
      rows: Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
      ),
    };
  }),
  RANDARRAY: volatileFn(0, 2, (args, f) => {
    const rows = opt(args, 0, f, intArg, 1);
    const cols = opt(args, 1, f, intArg, 1);
    if (isError(rows)) return rows;
    if (isError(cols)) return cols;
    if (rows < 1 || cols < 1) return err('#VALUE!', 'RANDARRAY needs at least one row and column');
    if (tooBig(rows, cols)) return err('#NUM!', 'The result is too large');
    return {
      rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => f.rand())),
    };
  }),
  ARRAYFORMULA: fn(1, 1, (args, f) => deref(args[0]!, f)),
  ...ARRAY_SHAPE_FUNCTIONS,
  ...MATRIX_FUNCTIONS,
  ...REGRESSION_FUNCTIONS,
  ...QUERY_FUNCTIONS,
};

// Their arguments are an array context (formulas.md "Arrays and spills"): ranges and arrays taken whole.
for (const name of [
  'ARRAYFORMULA',
  'QUERY',
  'FILTER',
  'SORT',
  'SORTN',
  'SORTBY',
  'UNIQUE',
  'TRANSPOSE',
])
  ARRAY_FUNCTIONS[name] = arrayArgs(ARRAY_FUNCTIONS[name]!);
