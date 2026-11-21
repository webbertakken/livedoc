// A parsed query run over its table (formulas.md "QUERY"): checked, filtered, grouped and pivoted, sorted, cut by
// offset and limit, and labelled. What fails a check is a QueryFailure in Google's words.
import { compareQueryValues, evaluateQuery, type QueryContext } from './query-eval';
import { QueryFailure, type Query, type QueryExpr, type QueryValue } from './query-parse';
import type { QueryTable } from './query-table';
import { tooBig } from '../fn';
import { err, type SheetError } from '../values';

export type QueryResult = { labels: string[] | null; rows: QueryValue[][] };

const keyOf = (e: QueryExpr): string => JSON.stringify(e);

function walk(e: QueryExpr, visit: (e: QueryExpr) => void): void {
  visit(e);
  if (e.k === 'fn') e.args.forEach((a) => walk(a, visit));
  else if (e.k === 'neg' || e.k === 'not' || e.k === 'isNull') walk(e.a, visit);
  else if (e.k === 'arith' || e.k === 'cmp' || e.k === 'text' || e.k === 'logic') {
    walk(e.a, visit);
    walk(e.b, visit);
  }
}

function hasAggregate(e: QueryExpr): boolean {
  let found = false;
  walk(e, (x) => (found ||= x.k === 'agg'));
  return found;
}

function columnsOf(e: QueryExpr): string[] {
  const out: string[] = [];
  walk(e, (x) => (x.k === 'col' ? out.push(x.id) : x.k === 'agg' ? out.push(x.col) : undefined));
  return out;
}

// Google's checks, before any row is read.
function check(q: Query, table: QueryTable, select: QueryExpr[], grouped: boolean): void {
  const all = [
    ...select,
    ...(q.where ? [q.where] : []),
    ...q.groupBy,
    ...q.pivot,
    ...q.orderBy.map((o) => o.e),
    ...q.labels.map((l) => l.e),
    ...q.formats.map((l) => l.e),
  ];
  for (const id of all.flatMap(columnsOf))
    if (!table.ids.has(id)) throw new QueryFailure(`NO_COLUMN: ${id}`);
  for (const e of [...(q.where ? [q.where] : []), ...q.groupBy, ...q.pivot])
    if (hasAggregate(e))
      throw new QueryFailure('Aggregations are only allowed in select, order by, label and format');
  for (const e of all)
    walk(e, (x) => {
      if (
        x.k === 'agg' &&
        (x.fn === 'sum' || x.fn === 'avg') &&
        table.types[table.ids.get(x.col)!] !== 'number'
      )
        throw new QueryFailure(`Can't perform the function ${x.fn} on values that are not numbers`);
    });
  if (!grouped) return;
  if (q.select === null) throw new QueryFailure('Cannot select * when aggregating');
  const keys = new Set(q.groupBy.map(keyOf));
  for (const e of select)
    if (!hasAggregate(e) && !keys.has(keyOf(e)))
      throw new QueryFailure(`ADD_COL_TO_GROUP_BY_OR_AGG: ${columnsOf(e).join(', ') || keyOf(e)}`);
  const pivoted = new Set(q.pivot.flatMap(columnsOf));
  const elsewhere = [...select, ...q.groupBy, ...q.orderBy.map((o) => o.e)].flatMap((e) =>
    e.k === 'agg' ? [] : columnsOf(e),
  );
  if (elsewhere.some((id) => pivoted.has(id)))
    throw new QueryFailure('A pivot column cannot appear in select, group by or order by');
  if (q.pivot.length > 0 && q.orderBy.some((o) => hasAggregate(o.e)))
    throw new QueryFailure('Cannot order by an aggregation when pivoting');
}

function compareRows(a: QueryValue[], b: QueryValue[]): number {
  return a.reduce<number>((c, x, i) => c || compareQueryValues(x, b[i]!), 0);
}

// A column's default label: its header, an aggregate's "sum Price", a function's "year(Date)".
function labelOf(e: QueryExpr, table: QueryTable): string {
  const col = (id: string) => table.labels[table.ids.get(id)!] || id;
  switch (e.k) {
    case 'col':
      return col(e.id);
    case 'agg':
      return `${e.fn} ${col(e.col)}`;
    case 'fn':
      return `${e.fn}(${e.args.map((a) => labelOf(a, table)).join(', ')})`;
    case 'arith':
      return `${labelOf(e.a, table)}${e.op}${labelOf(e.b, table)}`;
    case 'neg':
      return `-${labelOf(e.a, table)}`;
    default:
      return e.k === 'lit' ? String(e.v) : '';
  }
}

type Group = { key: QueryValue[]; rows: QueryValue[][]; cells: Map<string, QueryValue[][]> };

type OutColumn = { e: QueryExpr; combo: QueryValue[] | null };

/** The query's labels (null when it has none to show) and rows. */
export function runQuery(
  q: Query,
  table: QueryTable,
  now: number,
): QueryResult | { e: SheetError } {
  const select =
    q.select ?? [...table.labels.keys()].map((j): QueryExpr => ({ k: 'col', id: `Col${j + 1}` }));
  const grouped = q.groupBy.length > 0 || q.pivot.length > 0 || select.some(hasAggregate);
  check(q, table, select, grouped);
  const ctx = (rows: QueryValue[][]): QueryContext => ({ table, row: rows[0] ?? null, rows, now });
  const filtered = q.where
    ? table.rows.filter((r) => evaluateQuery(q.where!, ctx([r])) === true)
    : table.rows;

  let columns: OutColumn[] = select.map((e) => ({ e, combo: null }));
  // Each output row with the rows it was made from, so order by reads what select reads.
  let out: { values: QueryValue[]; from: QueryValue[][] }[];
  if (!grouped) {
    out = filtered.map((r) => ({
      values: select.map((e) => evaluateQuery(e, ctx([r]))),
      from: [r],
    }));
  } else {
    // Each row into its group, and within it into its pivot cell, by their keys' text.
    const keyed = (r: QueryValue[], by: QueryExpr[]) => by.map((e) => evaluateQuery(e, ctx([r])));
    const groups = new Map<string, Group>();
    const combos = new Map<string, QueryValue[]>();
    if (q.groupBy.length === 0) groups.set('[]', { key: [], rows: [], cells: new Map() });
    for (const r of filtered) {
      const key = keyed(r, q.groupBy);
      const combo = keyed(r, q.pivot);
      const pivotKey = JSON.stringify(combo);
      combos.set(pivotKey, combo);
      const group: Group = groups.get(JSON.stringify(key)) ?? { key, rows: [], cells: new Map() };
      groups.set(JSON.stringify(key), group);
      group.rows.push(r);
      const cell = group.cells.get(pivotKey) ?? [];
      group.cells.set(pivotKey, cell);
      cell.push(r);
    }
    const pivots = [...combos.values()].sort(compareRows);
    if (q.pivot.length > 0)
      columns = select.flatMap((e): OutColumn[] =>
        hasAggregate(e) ? pivots.map((combo) => ({ e, combo })) : [{ e, combo: null }],
      );
    if (tooBig(groups.size + 1, columns.length))
      return { e: err('#NUM!', 'The result is too large') };
    out = [...groups.values()]
      .sort((a, b) => compareRows(a.key, b.key))
      .map((group) => {
        const values = columns.map(({ e, combo }) => {
          if (!combo) return evaluateQuery(e, ctx(group.rows));
          const cell = group.cells.get(JSON.stringify(combo));
          return cell ? evaluateQuery(e, ctx(cell)) : null;
        });
        return { values, from: group.rows };
      });
  }
  if (q.orderBy.length > 0) {
    const sortKeys = new Map(
      out.map((o) => [o, q.orderBy.map(({ e }) => evaluateQuery(e, ctx(o.from)))]),
    );
    out = [...out].sort((a, b) => {
      for (let i = 0; i < q.orderBy.length; i++) {
        const c = compareQueryValues(sortKeys.get(a)![i]!, sortKeys.get(b)![i]!);
        if (c !== 0) return q.orderBy[i]!.desc ? -c : c;
      }
      return 0;
    });
  }
  const rows = out
    .slice(q.offset, q.limit === null ? undefined : q.offset + q.limit)
    .map((o) => o.values);
  return { labels: labelsOf(q, table, columns, select), rows };
}

function labelsOf(
  q: Query,
  table: QueryTable,
  columns: OutColumn[],
  select: QueryExpr[],
): string[] | null {
  const shown = table.headed || q.labels.length > 0 || select.some((e) => e.k !== 'col');
  if (!shown) return null;
  const set = new Map(q.labels.map((l) => [keyOf(l.e), l.text]));
  const aggregates = select.filter(hasAggregate).length;
  const labels = columns.map(({ e, combo }) => {
    const given = set.get(keyOf(e));
    if (!combo) return given ?? labelOf(e, table);
    const values = combo
      .map((v) => (v === null ? '' : typeof v === 'boolean' ? String(v).toUpperCase() : String(v)))
      .join(',');
    const suffix = given ?? (aggregates > 1 ? labelOf(e, table) : '');
    return `${values} ${suffix}`.trim();
  });
  return labels.every((l) => l === '') ? null : labels;
}
