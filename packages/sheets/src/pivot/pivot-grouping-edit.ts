// Grouping a pivot table's items from the grid (docs/specs/029-sheets/pivot-tables.md "Grouping in the grid", D621):
// a group's grouping set or taken off, picked items gathered into a custom group, an item a grouping made ungrouped.
// Each a whole new pivot table, as the editor's changes are.
import type { SheetPivot, SheetPivotGroup } from '../objects/sheet-pivot';
import type { PivotGrouping, PivotItemRef } from './pivot-spec';

type Axis = 'rows' | 'columns';
type CustomGroups = Extract<PivotGrouping, { k: 'custom' }>['groups'];

/** A new custom group's name: `Group 1`, or the first number free among the group's custom groups. */
const CUSTOM_GROUP_BASE = 'Group';

// The pivot table with the group at `depth` of `axis` rewritten, or as it is when it has no such group.
function withGroup(
  pivot: SheetPivot,
  axis: Axis,
  depth: number,
  next: (g: SheetPivotGroup) => SheetPivotGroup,
): SheetPivot {
  const list = pivot[axis] ?? [];
  const group = list[depth];
  if (!group) return pivot;
  return { ...pivot, [axis]: list.map((g, i) => (i === depth ? next(g) : g)) };
}

// A group with its grouping, none dropping the key.
function grouped(g: SheetPivotGroup, grouping: PivotGrouping | null): SheetPivotGroup {
  const { grouping: _old, ...rest } = g;
  return grouping ? { ...rest, grouping } : rest;
}

/** The group's grouping set, in the place of any it had, or taken off (null). */
export function pivotSetGrouping(
  pivot: SheetPivot,
  axis: Axis,
  depth: number,
  grouping: PivotGrouping | null,
): SheetPivot {
  return withGroup(pivot, axis, depth, (g) => grouped(g, grouping));
}

/**
 * The picked items gathered into a new custom group: a cell's own item by how its source cell shows, a custom group
 * by its items (that group gone). A group grouped by a date rule or intervals is left as it is.
 */
export function pivotCustomGroup(
  pivot: SheetPivot,
  axis: Axis,
  depth: number,
  picked: readonly PivotItemRef[],
): SheetPivot {
  return withGroup(pivot, axis, depth, (g) => {
    if (g.grouping && g.grouping.k !== 'custom') return g;
    const groups: CustomGroups = g.grouping?.groups ?? [];
    const absorbed = new Set(
      picked.flatMap((x) => (x.made === 'custom' && typeof x.label === 'string' ? [x.label] : [])),
    );
    const items = picked.flatMap((x) =>
      x.made === 'custom'
        ? (groups.find((y) => y.name === x.label)?.items ?? [])
        : x.shown === undefined
          ? []
          : [x.shown],
    );
    const names = new Set(groups.map((x) => x.name.toLowerCase()));
    let n = 1;
    while (names.has(`${CUSTOM_GROUP_BASE} ${n}`.toLowerCase())) n++;
    return grouped(g, {
      k: 'custom',
      groups: [
        ...groups.filter((x) => !absorbed.has(x.name)),
        { name: `${CUSTOM_GROUP_BASE} ${n}`, items },
      ],
    });
  });
}

/** An item a grouping made ungrouped: a custom group alone (the last taking the grouping), a rule's whole. */
export function pivotUngroupItem(
  pivot: SheetPivot,
  axis: Axis,
  depth: number,
  item: PivotItemRef,
): SheetPivot {
  if (!item.made) return pivot;
  return withGroup(pivot, axis, depth, (g) => {
    if (item.made === 'rule' || g.grouping?.k !== 'custom') return grouped(g, null);
    const rest = g.grouping.groups.filter((x) => x.name !== item.label);
    return grouped(g, rest.length ? { k: 'custom', groups: rest } : null);
  });
}
