// Groups of rows and columns (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline"), read from a
// layout: every grouped line has a depth, and a group of depth d is a longest run of lines whose depth is at least
// d, as Google's and Excel's are. A collapsed group is named by a line in it and its depth (a GroupMark). Reads are
// built from the grouped lines alone (a sheet has a million rows, a handful grouped) and kept per layout object.
import type { GroupMark, SheetLayout } from './sheet';

export type OutlineAxis = 'r' | 'c';

/** A group as positions: its depth, its first and last line, and whether it is collapsed. */
export type LineGroup = { depth: number; from: number; to: number; collapsed: boolean };

type AxisOutline = {
  // Each grouped line's depth, by position.
  depths: ReadonlyMap<number, number>;
  // Outer groups first, then by place.
  groups: readonly LineGroup[];
  // The lines inside collapsed groups.
  collapsed: ReadonlySet<string>;
};

const CACHE = new WeakMap<SheetLayout, { r?: AxisOutline; c?: AxisOutline }>();

export const depthsOf = (layout: SheetLayout, axis: OutlineAxis) =>
  axis === 'r' ? layout.rowDepth : layout.colDepth;

export const marksOf = (layout: SheetLayout, axis: OutlineAxis): readonly GroupMark[] =>
  (axis === 'r' ? layout.rowCollapsed : layout.colCollapsed) ?? [];

export const linesOf = (layout: SheetLayout, axis: OutlineAxis) =>
  axis === 'r' ? layout.rows : layout.cols;

/** Each grouped line's depth by position, from the ids' depths (lines not on the sheet left out). */
export function depthsByPosition(
  list: readonly string[],
  depths: Readonly<Record<string, number>> | undefined,
): Map<number, number> {
  const out = new Map<number, number>();
  if (!depths || Object.keys(depths).length === 0) return out;
  list.forEach((id, i) => {
    const d = depths[id];
    if (d) out.set(i, d);
  });
  return out;
}

/** The groups the depths make: for each depth, the longest runs of lines at least that deep. */
export function groupsOf(
  depths: ReadonlyMap<number, number>,
): { depth: number; from: number; to: number }[] {
  const at = [...depths.keys()].sort((a, b) => a - b);
  let deepest = 0;
  for (const d of depths.values()) deepest = Math.max(deepest, d);
  const out: { depth: number; from: number; to: number }[] = [];
  for (let d = 1; d <= deepest; d++) {
    let from = -1;
    let last = -2;
    for (const p of at) {
      if (depths.get(p)! < d) continue;
      if (p !== last + 1) {
        if (from >= 0) out.push({ depth: d, from, to: last });
        from = p;
      }
      last = p;
    }
    // Some line is this deep (d is at most the deepest): its run closes here.
    out.push({ depth: d, from, to: last });
  }
  return out;
}

/** The group of depth `depth` holding position `pos`, if any. */
export function groupHolding(
  groups: readonly LineGroup[],
  pos: number,
  depth: number,
): LineGroup | undefined {
  return groups.find((g) => g.depth === depth && pos >= g.from && pos <= g.to);
}

function build(layout: SheetLayout, axis: OutlineAxis): AxisOutline {
  const list = linesOf(layout, axis);
  const depths = depthsByPosition(list, depthsOf(layout, axis));
  const marks = marksOf(layout, axis);
  const pos = marks.length ? new Map(list.map((id, i) => [id, i])) : new Map<string, number>();
  const marked = marks.flatMap((m) => {
    const p = pos.get(m.at);
    return p === undefined ? [] : [{ p, depth: m.depth }];
  });
  const groups = groupsOf(depths).map((g) => ({
    ...g,
    collapsed: marked.some((m) => m.depth === g.depth && m.p >= g.from && m.p <= g.to),
  }));
  const collapsed = new Set<string>();
  for (const g of groups)
    if (g.collapsed) for (let i = g.from; i <= g.to; i++) collapsed.add(list[i]!);
  return { depths, groups, collapsed };
}

/** A layout's outline on one axis, built once per layout object. */
export function outlineOf(layout: SheetLayout, axis: OutlineAxis): AxisOutline {
  let entry = CACHE.get(layout);
  if (!entry) {
    entry = {};
    CACHE.set(layout, entry);
  }
  return (entry[axis] ??= build(layout, axis));
}

/** Whether the sheet puts a group's control after it (else before it, Google's default). */
export const controlsAfter = (layout: SheetLayout, axis: OutlineAxis): boolean =>
  layout.controlsAfter?.[axis] === true;

/** The line a group's control sits on: just before it, or just after when it starts the sheet or the sheet asks. */
export function controlLine(group: LineGroup, after: boolean): number {
  return after || group.from === 0 ? group.to + 1 : group.from - 1;
}

/**
 * What Alt+Shift+↑ and ↓ act on at a line (D161): the innermost expanded group holding it to collapse; the
 * collapsed groups holding it to expand, or, holding none, the collapsed groups whose control sits on it.
 */
export function foldTargets(
  layout: SheetLayout,
  axis: OutlineAxis,
  pos: number,
): { collapse: LineGroup | null; expand: LineGroup[] } {
  const { groups } = outlineOf(layout, axis);
  const holding = groups.filter((g) => pos >= g.from && pos <= g.to);
  const open = holding.filter((g) => !g.collapsed);
  const closed = holding.filter((g) => g.collapsed);
  const after = controlsAfter(layout, axis);
  return {
    collapse: open.length ? open[open.length - 1]! : null,
    expand: closed.length
      ? closed
      : groups.filter((g) => g.collapsed && controlLine(g, after) === pos),
  };
}
