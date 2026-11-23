// Group, Ungroup, Collapse and Expand (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline"), as pure
// builders to a layout write, as Google's addDimensionGroup and deleteDimensionGroup do: grouping adds one to each
// line's depth and ungrouping takes one away. A collapsed group keeps its fold: a group the change deepens or
// shallows wholly carries its mark to its new depth, and one losing the line its mark names is marked on another.
import { OUTLINE_DEPTH_MAX } from './limits';
import {
  groupHolding,
  linesOf,
  marksOf,
  outlineOf,
  type LineGroup,
  type OutlineAxis,
} from './outline';
import type { GroupMark, Sheet } from './sheet';
import type { LayoutChange, SheetWrite } from './store';

export const OUTLINE_DEPTH_REFUSAL = `Groups nest at most ${OUTLINE_DEPTH_MAX} deep`;

const mark = (axis: OutlineAxis, m: GroupMark, collapsed: boolean): LayoutChange => ({
  k: 'collapse',
  axis,
  at: m.at,
  depth: m.depth,
  collapsed,
});

const write = (changes: LayoutChange[]): SheetWrite | null =>
  changes.length ? { kind: 'layout', changes } : null;

// The positions from..to, kept to the sheet; null when none is on it.
function span(sheet: Sheet, axis: OutlineAxis, from: number, to: number): [number, number] | null {
  const last = linesOf(sheet.layout, axis).length - 1;
  const a = Math.max(0, from);
  const b = Math.min(last, to);
  return a <= b ? [a, b] : null;
}

/** Group lines from..to: one deeper each; refused when a line would pass OUTLINE_DEPTH_MAX (D159). */
export function groupLines(
  sheet: Sheet,
  axis: OutlineAxis,
  from: number,
  to: number,
): SheetWrite | { refused: string } | null {
  const s = span(sheet, axis, from, to);
  if (!s) return null;
  const [a, b] = s;
  const list = linesOf(sheet.layout, axis);
  const { depths, groups } = outlineOf(sheet.layout, axis);
  const next: Record<string, number> = {};
  for (let p = a; p <= b; p++) {
    const d = (depths.get(p) ?? 0) + 1;
    if (d > OUTLINE_DEPTH_MAX) return { refused: OUTLINE_DEPTH_REFUSAL };
    next[list[p]!] = d;
  }
  const changes: LayoutChange[] = [{ k: 'depth', axis, depths: next }];
  const pos = new Map(list.map((id, i) => [id, i]));
  for (const m of marksOf(sheet.layout, axis)) {
    const g = groupHolding(groups, pos.get(m.at) ?? -1, m.depth);
    if (g && g.from >= a && g.to <= b)
      changes.push(mark(axis, m, false), mark(axis, { at: m.at, depth: m.depth + 1 }, true));
  }
  return write(changes);
}

/** Ungroup lines from..to: one shallower each, those in no group left as they are; null when none is grouped. */
export function ungroupLines(
  sheet: Sheet,
  axis: OutlineAxis,
  from: number,
  to: number,
): SheetWrite | null {
  const s = span(sheet, axis, from, to);
  if (!s) return null;
  const [a, b] = s;
  const list = linesOf(sheet.layout, axis);
  const { depths, groups } = outlineOf(sheet.layout, axis);
  const next: Record<string, number> = {};
  for (let p = a; p <= b; p++) {
    const d = depths.get(p);
    if (d) next[list[p]!] = d - 1;
  }
  if (Object.keys(next).length === 0) return null;
  const changes: LayoutChange[] = [{ k: 'depth', axis, depths: next }];
  const pos = new Map(list.map((id, i) => [id, i]));
  for (const m of marksOf(sheet.layout, axis)) {
    const p = pos.get(m.at) ?? -1;
    const g = groupHolding(groups, p, m.depth);
    if (!g) continue;
    if (g.from >= a && g.to <= b) {
      changes.push(mark(axis, m, false));
      if (m.depth > 1) changes.push(mark(axis, { at: m.at, depth: m.depth - 1 }, true));
    } else if (p >= a && p <= b) {
      // The marked line leaves the group: the group's first line outside the span holds the mark.
      const q = g.from < a ? g.from : b + 1;
      changes.push(mark(axis, m, false), mark(axis, { at: list[q]!, depth: m.depth }, true));
    }
  }
  return write(changes);
}

/** Collapse or expand one group; null when it already is so. */
export function collapseGroup(
  sheet: Sheet,
  axis: OutlineAxis,
  group: LineGroup,
  collapsed: boolean,
): SheetWrite | null {
  const list = linesOf(sheet.layout, axis);
  if (collapsed)
    return group.collapsed
      ? null
      : write([mark(axis, { at: list[group.from]!, depth: group.depth }, true)]);
  const inside = new Set(list.slice(group.from, group.to + 1));
  return write(
    marksOf(sheet.layout, axis)
      .filter((m) => m.depth === group.depth && inside.has(m.at))
      .map((m) => mark(axis, m, false)),
  );
}

/** Expand all or Collapse all on one axis; null when there is nothing to change. */
export function collapseAll(
  sheet: Sheet,
  axis: OutlineAxis,
  collapsed: boolean,
): SheetWrite | null {
  const list = linesOf(sheet.layout, axis);
  if (!collapsed) return write(marksOf(sheet.layout, axis).map((m) => mark(axis, m, false)));
  return write(
    outlineOf(sheet.layout, axis)
      .groups.filter((g) => !g.collapsed)
      .map((g) => mark(axis, { at: list[g.from]!, depth: g.depth }, true)),
  );
}

/** Move the +/- controls after their groups (or back before them); null when they already sit there. */
export function setControls(sheet: Sheet, axis: OutlineAxis, after: boolean): SheetWrite | null {
  const now = sheet.layout.controlsAfter?.[axis] === true;
  return now === after ? null : write([{ k: 'controls', axis, after }]);
}
