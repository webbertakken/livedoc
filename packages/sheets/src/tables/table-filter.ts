// A table's filter (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers", D481): each table's own,
// over its header and data rows (its total row apart), kept on the table by column ids. The sheet's filter never
// overlaps a table: refused where a filter or a table is made, in the editor and by the room's judge; one stored
// before the rule stays (D480).
import type { GridRange } from '../address';
import type { DrawnFilter } from '../filter';
import { posRangeOf } from '../layout';
import type { IdRange, SheetLayout } from '../sheet';
import type { SheetTable } from './table';

/** Create a Filter refused over part of a table, and its dimmed item's note. */
export const filterOverlapsTable = (name: string): string =>
  `This range overlaps ${name}: use the table's filter`;
export const filterOverlapsTableNote = (name: string): string => `Overlaps ${name}`;

/** Convert to Table refused over part of the sheet's filter. */
export const TABLE_OVERLAPS_FILTER =
  "This range overlaps the sheet's filter: remove it or filter the table's cells only";

/** A table's filter's cells by position: its header and data rows, its total row apart; null when its cells are gone. */
export function tableFilterBox(layout: SheetLayout, table: SheetTable): GridRange | null {
  const p = posRangeOf(layout, table);
  if (!p) return null;
  return table.total && p.r2 > p.r1 ? { ...p, r2: p.r2 - 1 } : p;
}

const meets = (a: GridRange, b: GridRange) =>
  a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;

/** A table's filter as drawn (its box by ids, its conditions); null while off or when its cells are gone. */
export function tableDrawnFilter(layout: SheetLayout, table: SheetTable): DrawnFilter | null {
  const p = table.filter ? tableFilterBox(layout, table) : null;
  if (!p) return null;
  return {
    r1: layout.rows[p.r1]!,
    c1: layout.cols[p.c1]!,
    r2: layout.rows[p.r2]!,
    c2: layout.cols[p.c2]!,
    conds: table.filter!,
  };
}

/** The tables a sheet's filter over `box` overlaps, in order. */
export function filterClashes(layout: SheetLayout, box: GridRange): SheetTable[] {
  return (layout.tables ?? []).filter((t) => {
    const p = posRangeOf(layout, t);
    return !!p && meets(p, box);
  });
}

/** The same for the sheet's filter as stored (by ids); none when it has none or its cells are gone. */
export function storedFilterClashes(
  layout: SheetLayout,
  filter: IdRange | null | undefined,
): SheetTable[] {
  const box = filter ? posRangeOf(layout, filter) : null;
  return box ? filterClashes(layout, box) : [];
}

/** The table a selection lies inside, whose filter Create a Filter makes there; null when none. */
export function tableHolding(layout: SheetLayout, sel: GridRange): SheetTable | null {
  for (const t of layout.tables ?? []) {
    const p = posRangeOf(layout, t);
    if (p && sel.r1 >= p.r1 && sel.r2 <= p.r2 && sel.c1 >= p.c1 && sel.c2 <= p.c2) return t;
  }
  return null;
}
