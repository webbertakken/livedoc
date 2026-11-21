// The database functions (docs/specs/029-sheets/formulas.md "Functions": Database): a range read as a table whose
// first row names its fields, its records filtered by criteria in Query-by-Example form, one field's values aggregated.
import type { EvalValue, Frame } from '../../engine/frame';
import { arrayArg, arrayArgs, fn, type FnDef } from '../fn';
import { makeCriterion, type Criterion } from '../criteria';
import {
  err,
  isError,
  scalarOf,
  toText,
  type Scalar,
  type SheetError,
  type Value,
} from '../values';
import { variance } from './variances';

const NO_FIELD = (what: string) => err('#VALUE!', `There is no field ${what}`);

// A field by its label (case ignored) or its number, 1 the first column.
function fieldIndex(labels: Scalar[], field: Scalar, locale: string): number | SheetError {
  if (isError(field)) return field;
  if (typeof field === 'string') {
    const wanted = field.toLowerCase();
    const at = labels.findIndex((l) => {
      const text = toText(l, locale);
      return typeof text === 'string' && text.toLowerCase() === wanted;
    });
    return at >= 0 ? at : NO_FIELD(`"${field}"`);
  }
  // A number, TRUE (1), FALSE or an empty cell (0).
  const i = Math.trunc(Number(field));
  return i >= 1 && i <= labels.length ? i - 1 : NO_FIELD(String(i));
}

// The records that meet the criteria: the criteria's first row names fields, each further row is a filter whose
// non-empty cells must all hold, and a record passes when any filter holds. No filter, or an empty one, passes all.
function matchingRecords(
  records: Value[][],
  labels: Scalar[],
  criteria: Value[][],
  locale: string,
): Value[][] | SheetError {
  const columns: (number | null)[] = [];
  for (const label of criteria[0]!) {
    const name = scalarOf(label);
    if (name === null || name === '') {
      columns.push(null);
      continue;
    }
    const at = fieldIndex(labels, typeof name === 'string' ? name : toText(name, locale), locale);
    if (isError(at)) return at;
    columns.push(at);
  }
  const filters: [number, Criterion][][] = criteria.slice(1).map((row) =>
    row.flatMap((cell, j) => {
      const value = scalarOf(cell);
      const column = columns[j] as number | null;
      return value === null || value === '' || column === null
        ? []
        : [[column, makeCriterion(value, locale)] as [number, Criterion]];
    }),
  );
  if (filters.length === 0) return records;
  return records.filter((record) =>
    filters.some((filter) => filter.every(([j, test]) => test(scalarOf(record[j]!)))),
  );
}

// The selected field's values of the matching records, or, with no field (DCOUNT's and DCOUNTA's wider form), null.
function selected(
  args: EvalValue[],
  f: Frame,
): { values: Scalar[] | null; count: number } | SheetError {
  const table = arrayArg(args[0]!, f).rows;
  const labels = table[0]!.map((v) => scalarOf(v));
  const criteria = arrayArg(args[2]!, f).rows;
  const records = matchingRecords(table.slice(1), labels, criteria, f.locale);
  if (isError(records)) return records;
  if (args[1] === null) return { values: null, count: records.length };
  const field = fieldIndex(labels, scalarOf(arrayArg(args[1]!, f)), f.locale);
  if (isError(field)) return field;
  return { values: records.map((r) => scalarOf(r[field]!)), count: records.length };
}

// A database function over the numbers of the selected values (text, booleans and empty cells left out).
function numeric(read: (ns: number[]) => Value): FnDef {
  return fn(3, 3, (args, f) => {
    const picked = selected(args, f);
    if (isError(picked)) return picked;
    if (picked.values === null) return NO_FIELD('given');
    const ns: number[] = [];
    for (const v of picked.values) {
      if (isError(v)) return v;
      if (typeof v === 'number') ns.push(v);
    }
    return read(ns);
  });
}

const root = (v: number | SheetError) => (isError(v) ? v : Math.sqrt(v));

export const DATABASE_FUNCTIONS: Record<string, FnDef> = {
  DSUM: numeric((ns) => ns.reduce((s, n) => s + n, 0)),
  DAVERAGE: numeric((ns) =>
    ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : err('#DIV/0!', 'No record matched'),
  ),
  DMAX: numeric((ns) => ns.reduce((m, n) => (n > m ? n : m), ns.length ? -Infinity : 0)),
  DMIN: numeric((ns) => ns.reduce((m, n) => (n < m ? n : m), ns.length ? Infinity : 0)),
  DPRODUCT: numeric((ns) => (ns.length ? ns.reduce((p, n) => p * n, 1) : 0)),
  DSTDEV: numeric((ns) => root(variance(ns, true))),
  DSTDEVP: numeric((ns) => root(variance(ns, false))),
  DVAR: numeric((ns) => variance(ns, true)),
  DVARP: numeric((ns) => variance(ns, false)),
  DCOUNT: fn(3, 3, (args, f) => {
    const picked = selected(args, f);
    if (isError(picked)) return picked;
    return picked.values === null
      ? picked.count
      : picked.values.filter((v) => typeof v === 'number').length;
  }),
  DCOUNTA: fn(3, 3, (args, f) => {
    const picked = selected(args, f);
    if (isError(picked)) return picked;
    return picked.values === null
      ? picked.count
      : picked.values.filter((v) => v !== null && v !== '').length;
  }),
  // The one matching record's value: none is #VALUE!, more than one #NUM!.
  DGET: fn(3, 3, (args, f) => {
    const picked = selected(args, f);
    if (isError(picked)) return picked;
    if (picked.values === null) return NO_FIELD('given');
    if (picked.values.length === 0) return err('#VALUE!', 'No record matched');
    if (picked.values.length > 1) return err('#NUM!', 'More than one record matched');
    return picked.values[0]!;
  }),
};

for (const name of Object.keys(DATABASE_FUNCTIONS))
  DATABASE_FUNCTIONS[name] = arrayArgs(DATABASE_FUNCTIONS[name]!);
