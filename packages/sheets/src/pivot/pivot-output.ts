// A pivot table's output worked out from its source (docs/specs/029-sheets/pivot-tables.md "The output"): the rows
// every filter keeps, grouped into a tree of row items and one of column items, each cell a summary of the rows both
// its items reach, laid out with its header rows, labels and totals as Google Sheets lays them out. Pure.
import { conditionMatcher } from '../filter';
import { err, isError, type Scalar } from '../formula/values';
import { compareItems, groupHeader, itemMaker, type PivotItem } from './pivot-items';
import { summarise } from './pivot-summary';
import type {
  PivotCell,
  PivotGroupSpec,
  PivotOutCell,
  PivotOutput,
  PivotSource,
  PivotSpec,
  PivotSummary,
} from './pivot-spec';

type PivotNode = {
  item: PivotItem | null;
  depth: number;
  // The source rows it reaches, ascending.
  rows: number[];
  children: Map<string, PivotNode>;
  kids: PivotNode[];
  parent: PivotNode | null;
};

const BLANK: PivotCell = { v: null, shown: '' };
// The summaries whose answers read in their column's number format.
const IN_COLUMN_FORMAT: ReadonlySet<PivotSummary> = new Set([
  'SUM',
  'AVERAGE',
  'MAX',
  'MIN',
  'MEDIAN',
]);

const node = (item: PivotItem | null, parent: PivotNode | null): PivotNode => ({
  item,
  depth: parent ? parent.depth + 1 : 0,
  rows: [],
  children: new Map(),
  kids: [],
  parent,
});

// The rows two ascending lists share.
function shared(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      out.push(a[i]!);
      i++;
      j++;
    } else if (a[i]! < b[j]!) i++;
    else j++;
  }
  return out;
}

// A node's ancestors from the root's child down to it.
function path(n: PivotNode): PivotNode[] {
  const out: PivotNode[] = [];
  for (let at: PivotNode | null = n; at?.parent; at = at.parent) out.unshift(at);
  return out;
}

const labelText = (item: PivotItem): string =>
  isError(item.label) ? item.label.e : String(item.label);

/** The output of `spec` over `source`, its filters' conditions read in `locale`. */
export function pivotOutput(source: PivotSource, spec: PivotSpec, locale = 'en-US'): PivotOutput {
  const at = (r: number, c: number): PivotCell => source.rows[r]?.[c] ?? BLANK;
  // The rows every filter keeps.
  const filters = (spec.filters ?? []).map((f) => ({
    col: f.col,
    test: conditionMatcher(f.cond, locale),
  }));
  const kept: number[] = [];
  for (let r = 0; r < source.rows.length; r++)
    if (filters.every((f) => f.test(at(r, f.col).v, at(r, f.col).shown))) kept.push(r);

  const makers = (groups: readonly PivotGroupSpec[]) =>
    groups.map((g) => {
      const numbers = kept.map((r) => at(r, g.col).v).filter((v) => typeof v === 'number');
      return itemMaker(g, numbers);
    });
  const tree = (groups: readonly PivotGroupSpec[]): PivotNode => {
    const root = node(null, null);
    const make = makers(groups);
    for (const r of kept) {
      root.rows.push(r);
      let n = root;
      for (const [i, g] of groups.entries()) {
        const item = make[i]!(at(r, g.col));
        let child = n.children.get(item.key);
        if (!child) n.children.set(item.key, (child = node(item, n)));
        child.rows.push(r);
        n = child;
      }
    }
    return root;
  };
  const rowRoot = tree(spec.rows);
  const colRoot = tree(spec.columns);

  const summaryOf = (rows: readonly number[], vi: number): Scalar => {
    const value = spec.values[vi]!;
    return summarise(
      value.summary,
      rows.map((r) => at(r, value.col).v),
    );
  };
  const rowsOf = (rn: PivotNode, cn: PivotNode) =>
    cn === colRoot ? rn.rows : rn === rowRoot ? cn.rows : shared(rn.rows, cn.rows);
  const cellOf = (rn: PivotNode, cn: PivotNode, vi: number): PivotOutCell => {
    const rows = rowsOf(rn, cn);
    if (!rows.length) return { v: null };
    const value = spec.values[vi]!;
    const v = summaryOf(rows, vi);
    if (!value.showAs)
      return IN_COLUMN_FORMAT.has(value.summary) && typeof v === 'number'
        ? { v, fmt: { col: value.col } }
        : { v };
    const [r, c] =
      value.showAs === 'row'
        ? [rn, colRoot]
        : value.showAs === 'column'
          ? [rowRoot, cn]
          : [rowRoot, colRoot];
    const whole = summaryOf(rowsOf(r, c), vi);
    if (typeof v !== 'number') return { v };
    if (typeof whole !== 'number') return { v: whole };
    return whole === 0 ? { v: err('#DIV/0!') } : { v: v / whole, fmt: 'percent' };
  };

  // Each level's items in order: by item, or by a value in the other side's item (its labels) or Grand Total.
  const sort = (
    root: PivotNode,
    groups: readonly PivotGroupSpec[],
    other: PivotNode,
    rowSide: boolean,
  ) => {
    const walk = (n: PivotNode) => {
      const g = groups[n.depth];
      n.kids = [...n.children.values()];
      if (g) {
        let target: PivotNode | null = other;
        for (const label of g.sortBy?.item ?? [])
          target =
            [...(target?.children.values() ?? [])].find((k) => labelText(k.item!) === label) ??
            null;
        const by = g.sortBy;
        const key = new Map<PivotNode, Scalar>();
        if (by)
          for (const k of n.kids)
            key.set(
              k,
              target ? summaryOf(rowSide ? rowsOf(k, target) : rowsOf(target, k), by.value) : null,
            );
        // A summary that is no number sorts after every number.
        const num = (n: PivotNode) => {
          const x = key.get(n);
          return typeof x === 'number' ? x : Infinity;
        };
        const byValue = (a: PivotNode, b: PivotNode) => num(a) - num(b) || 0;
        n.kids.sort((a, b) => {
          const order = (by ? byValue(a, b) : 0) || compareItems(a.item!, b.item!);
          return g.desc ? -order : order;
        });
      }
      n.kids.forEach(walk);
    };
    walk(root);
  };
  sort(rowRoot, spec.rows, colRoot, true);
  sort(colRoot, spec.columns, rowRoot, false);

  return layout(source, spec, rowRoot, colRoot, cellOf);
}

type Slot = { node: PivotNode; v: number | null; total: boolean };

// The output's cells: header rows, then a line per row item (and total), a column per column item (and total).
function layout(
  source: PivotSource,
  spec: PivotSpec,
  rowRoot: PivotNode,
  colRoot: PivotNode,
  cellOf: (rn: PivotNode, cn: PivotNode, vi: number) => PivotOutCell,
): PivotOutput {
  const R = spec.rows.length;
  const C = spec.columns.length;
  const V = spec.values.length;
  const vertical = !!spec.valuesAsRows;
  const L = Math.max(1, R + (vertical ? 1 : 0));
  const nameOf = (col: number) => source.header[col] ?? '';
  const valueName = (vi: number) => {
    const v = spec.values[vi]!;
    return v.name ?? `${v.summary} of ${nameOf(v.col)}`;
  };
  const shows = (groups: readonly PivotGroupSpec[], depth: number) =>
    depth < groups.length && groups[depth]!.totals !== false;
  // Slots and lines: a total of a node after its children when the group inside it shows totals.
  const spread = (
    root: PivotNode,
    depthMax: number,
    groups: readonly PivotGroupSpec[],
    across: boolean,
  ) => {
    const out: Slot[] = [];
    const emit = (n: PivotNode, total: boolean) => {
      if (across === !vertical) spec.values.forEach((_, vi) => out.push({ node: n, v: vi, total }));
      else out.push({ node: n, v: null, total });
    };
    const walk = (n: PivotNode) => {
      if (n.depth === depthMax) return emit(n, false);
      n.kids.forEach(walk);
      if (shows(groups, n.depth) && (n.depth > 0 || depthMax > 0)) emit(n, true);
    };
    walk(root);
    return out;
  };
  const slots = spread(colRoot, C, spec.columns, true);
  const lines = spread(rowRoot, R, spec.rows, false);
  const width = L + slots.length;
  const rows: PivotOutCell[][] = [];
  const row = () => {
    const cells: PivotOutCell[] = Array.from({ length: width }, () => ({ v: null }));
    rows.push(cells);
    return cells;
  };
  const twoValuesAcross = !vertical && V >= 2;

  // The header rows.
  let lastHeader: PivotOutCell[];
  if (C === 0) lastHeader = row();
  else {
    const first = row();
    // The one value's name over the row header, when there is one.
    if (!vertical && V === 1 && R > 0) first[0] = { v: valueName(0) };
    spec.columns.forEach((g, j) => (first[L + j] = { v: groupHeader(g, nameOf(g.col)) }));
    if (twoValuesAcross) first[L + C] = { v: 'Values' };
    for (let d = 1; d <= C; d++) {
      const cells = row();
      let previous: string | null = null;
      slots.forEach((s, i) => {
        const p = path(s.node);
        let key: string | null = null;
        let cell: PivotOutCell = { v: null };
        if (s.node === colRoot) {
          if (d === 1) [key, cell] = ['grand', { v: 'Grand Total' }];
        } else if (!s.total || d < s.node.depth) {
          const n = p[d - 1]!;
          key = `${d}:${p
            .slice(0, d)
            .map((x) => x.item!.key)
            .join('\u0000')}`;
          cell = { v: n.item!.label, ...(n.item!.fmt ? { fmt: n.item!.fmt } : {}) };
        } else if (d === s.node.depth) {
          key = `${d}:total:${p.map((x) => x.item!.key).join('\u0000')}`;
          cell = { v: `${labelText(s.node.item!)} Total` };
        }
        if (key !== null && key !== previous) cells[L + i] = cell;
        previous = key;
      });
    }
    if (twoValuesAcross) row();
    lastHeader = rows[rows.length - 1]!;
  }
  spec.rows.forEach((g, i) => (lastHeader[i] = { v: groupHeader(g, nameOf(g.col)) }));
  if (vertical) lastHeader[R] = { v: 'Values' };
  if (C === 0 || twoValuesAcross)
    slots.forEach((s, i) => {
      if (s.v !== null) lastHeader[L + i] = { v: valueName(s.v) };
    });

  // The lines.
  let previous: PivotNode[] = [];
  for (const line of lines) {
    const cells = row();
    const firstOfValues = line.v === null || line.v === 0;
    if (line.node === rowRoot && R > 0) {
      if (firstOfValues) cells[0] = { v: 'Grand Total' };
      previous = [];
    } else if (line.total) {
      if (firstOfValues) cells[line.node.depth - 1] = { v: `${labelText(line.node.item!)} Total` };
      previous = [];
    } else if (R > 0) {
      const p = path(line.node);
      p.forEach((n, i) => {
        // An item's label on its first line (a new item is always a first value's), or on each when repeated.
        if (n !== previous[i] || spec.rows[i]!.repeat)
          cells[i] = { v: n.item!.label, ...(n.item!.fmt ? { fmt: n.item!.fmt } : {}) };
      });
      previous = p;
    } else if (!vertical && V === 1 && C > 0) cells[0] = { v: valueName(0) };
    if (vertical && line.v !== null) cells[R] = { v: valueName(line.v) };
    slots.forEach((s, i) => {
      // A line carries its value when values are rows, a slot when they are columns.
      cells[L + i] = cellOf(line.node, s.node, (line.v ?? s.v)!);
    });
  }
  return { rows, width };
}
