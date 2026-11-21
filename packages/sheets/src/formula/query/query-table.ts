// QUERY's data as a typed table (docs/specs/029-sheets/formulas.md "QUERY"): its header rows as labels, each column
// one type by the majority of its values, a value of another type null, and the names its columns answer to.
import { columnLetters } from '../../address';
import { isError, scalarOf, type Value } from '../values';
import type { QueryValue } from './query-parse';

export type ColumnType = 'number' | 'string' | 'boolean';

export type QueryTable = {
  // Whether the data had header rows.
  headed: boolean;
  // Each column's names: its sheet letter (a range) and `Col<n>`.
  ids: Map<string, number>;
  labels: string[];
  types: ColumnType[];
  rows: QueryValue[][];
};

function typeOf(x: QueryValue): ColumnType | null {
  if (typeof x === 'number') return 'number';
  if (typeof x === 'boolean') return 'boolean';
  if (typeof x === 'string' && x !== '') return 'string';
  return null;
}

// The type most of a column's values have; numbers first on a tie, then text (an empty column is text).
function majority(column: QueryValue[]): ColumnType {
  const counts = { number: 0, string: 0, boolean: 0 };
  for (const x of column) {
    const t = typeOf(x);
    if (t) counts[t]++;
  }
  const order: ColumnType[] = ['number', 'string', 'boolean'];
  return order.reduce((best, t) => (counts[t] > counts[best] ? t : best), 'string' as ColumnType);
}

// Left out or -1: the first row is a header when each of its filled cells is text and a column below holds a value
// of another type (D69).
function guessHeaders(cells: QueryValue[][]): number {
  if (cells.length < 2) return 0;
  const first = cells[0]!;
  if (!first.every((x) => x === null || x === '' || typeof x === 'string')) return 0;
  return first.some((_, j) => majority(cells.slice(1).map((r) => r[j]!)) !== 'string') ? 1 : 0;
}

/**
 * The table QUERY reads: `firstCol` is the sheet column (from 0) a range starts at, or null for an array. An error
 * in the data is the answer.
 */
export function queryTable(
  data: Value[][],
  headers: number,
  firstCol: number | null,
): QueryTable | { e: Value } {
  const cells: QueryValue[][] = [];
  for (const row of data) {
    const line = row.map((x) => scalarOf(x));
    const failed = line.find((x) => isError(x));
    if (failed !== undefined) return { e: failed };
    cells.push(line as QueryValue[]);
  }
  const width = cells[0]?.length ?? 0;
  const head = headers < 0 ? guessHeaders(cells) : Math.min(headers, cells.length);
  const body = cells.slice(head);
  const labels = Array.from({ length: width }, (_, j) =>
    cells
      .slice(0, head)
      .map((r) => (r[j] === null ? '' : String(r[j])))
      .filter((s) => s !== '')
      .join(' '),
  );
  const types = labels.map((_, j) => majority(body.map((r) => r[j]!)));
  const rows = body.map((r) => r.map((x, j) => (typeOf(x) === types[j] ? x : null)));
  const ids = new Map<string, number>();
  for (let j = 0; j < width; j++) {
    if (firstCol !== null) ids.set(columnLetters(firstCol + j), j);
    ids.set(`Col${j + 1}`, j);
  }
  return { headed: head > 0, ids, labels, types, rows };
}
