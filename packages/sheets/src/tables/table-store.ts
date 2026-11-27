// How writes move tables (docs/specs/029-sheets/data-tools.md "Tables"): rows and columns deleted shrink them, and a
// value typed into the row directly below one, inside its columns, grows it by that row in the same write.
import { layoutIndex } from '../layout';
import { protectionsAt } from '../protection';
import type { IdRange, SheetLayout } from '../sheet';
import type { CellChange, SheetWrite } from '../store';
import type { LayoutChange } from '../store-layout';
import { tableAt, tableBox, type SheetTable } from './table';

type Shrink = (range: IdRange) => IdRange | null;

function pick<T>(record: Record<string, T> | undefined, keep: (id: string) => boolean) {
  if (!record) return undefined;
  const out = Object.fromEntries(Object.entries(record).filter(([id]) => keep(id)));
  return Object.keys(out).length ? out : undefined;
}

/**
 * The tables left after rows and columns of `before` are deleted: each shrunk (`shrink`, as a named range is); one
 * whose header row went, or that keeps no data row, goes; a deleted total row leaves the rest without one.
 */
export function tablesAfterDelete(
  before: SheetLayout,
  goneRows: ReadonlySet<string>,
  goneCols: ReadonlySet<string>,
  shrink: Shrink,
): SheetTable[] | undefined {
  const ix = layoutIndex(before);
  const out = (before.tables ?? []).flatMap((t): SheetTable[] => {
    if (goneRows.has(t.r1)) return [];
    const range = shrink(t);
    const p = tableBox(before, t);
    if (!range || !p) return [];
    const total = t.total && !goneRows.has(t.r2);
    let rows = 0;
    for (let r = p.r1; r <= p.r2; r++) if (!goneRows.has(before.rows[r]!)) rows++;
    if (rows < (total ? 3 : 2)) return [];
    const { types: _t, opts: _o, total: _total, ...rest } = t;
    const keep = (id: string) => !goneCols.has(id) && ix.colPos.has(id);
    const types = pick(t.types, keep);
    const opts = pick(t.opts, keep);
    return [
      {
        ...rest,
        ...range,
        ...(types ? { types } : {}),
        ...(opts ? { opts } : {}),
        ...(total ? { total: true as const } : {}),
      },
    ];
  });
  return out.length ? out : undefined;
}

// Whether a cell change puts a value in its cell (a format alone, or a clear, grows nothing).
const putsValue = (ch: CellChange) => ch.i !== undefined && ch.i !== null;

/**
 * The changes that grow tables for cells written (data-tools.md "Tables"): a table without a total row grows by the
 * row directly below it when a value lands there inside its columns, its banding with it; never over a protected
 * range nor another table's cells.
 */
export function tableGrowth(layout: SheetLayout, cells: readonly CellChange[]): LayoutChange[] {
  if (!layout.tables?.length) return [];
  const ix = layoutIndex(layout);
  const out: LayoutChange[] = [];
  for (const t of layout.tables) {
    const p = tableBox(layout, t);
    if (!p || t.total) continue;
    const below = layout.rows[p.r2 + 1];
    if (below === undefined) continue;
    const typed = cells.some((ch) => {
      const c = ix.colPos.get(ch.c);
      return ch.r === below && c !== undefined && c >= p.c1 && c <= p.c2 && putsValue(ch);
    });
    if (!typed) continue;
    let free = true;
    for (let c = p.c1; c <= p.c2 && free; c++)
      free =
        !tableAt(layout, p.r2 + 1, c) && !protectionsAt(layout, p.r2 + 1, c).some((x) => x.range);
    if (!free) continue;
    out.push({ k: 'table', id: t.id, table: { ...t, r2: below } });
    const band = t.band ? layout.bands?.find((b) => b.id === t.band) : undefined;
    if (band) out.push({ k: 'band', id: band.id, band: { ...band, r2: below } });
  }
  return out;
}

/** A write with the growth its cells make, as one write (one undo step); the write itself when it makes none. */
export function withTableGrowth(layout: SheetLayout, write: SheetWrite): SheetWrite {
  if (write.kind === 'title') return write;
  const cells = write.cells ?? [];
  const growth = tableGrowth(layout, cells);
  if (!growth.length) return write;
  if (write.kind === 'cells') return { kind: 'layout', changes: growth, cells };
  return { ...write, changes: [...write.changes, ...growth] };
}

// A change as JSON with its keys in order, so a change sent is compared with the one the room derives.
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
}

// The changes that take a growth back (its undo): a table without a total row, keeping a data row, one row shorter,
// its banding with it, when the write clears a value in the row it gives up inside its columns.
function tableShrinkBacks(layout: SheetLayout, cells: readonly CellChange[]): LayoutChange[] {
  const ix = layoutIndex(layout);
  const out: LayoutChange[] = [];
  for (const t of layout.tables ?? []) {
    const p = tableBox(layout, t);
    if (!p || t.total || p.r2 - p.r1 < 2) continue;
    const cleared = cells.some((ch) => {
      const c = ix.colPos.get(ch.c);
      return ch.r === t.r2 && ch.i === null && c !== undefined && c >= p.c1 && c <= p.c2;
    });
    if (!cleared) continue;
    const above = layout.rows[p.r2 - 1]!;
    out.push({ k: 'table', id: t.id, table: { ...t, r2: above } });
    const band = t.band ? layout.bands?.find((b) => b.id === t.band) : undefined;
    if (band) out.push({ k: 'band', id: band.id, band: { ...band, r2: above } });
  }
  return out;
}

/**
 * Whether a layout write is a Participant's (D388): its changes exactly the growth its own cells make, or, on an
 * undo, exactly that growth taken back; never a rename, a column, a type or a total row, never more than one row.
 */
export function isParticipantTableWrite(
  layout: SheetLayout,
  write: SheetWrite,
  undo: boolean,
): boolean {
  if (write.kind !== 'layout' || !Array.isArray(write.changes) || !write.changes.length)
    return false;
  const cells = Array.isArray(write.cells) ? write.cells : [];
  const sent = new Set(write.changes.map(canonical));
  const same = (derived: LayoutChange[]) =>
    derived.length === sent.size && derived.every((ch) => sent.has(canonical(ch)));
  return same(tableGrowth(layout, cells)) || (undo && same(tableShrinkBacks(layout, cells)));
}
