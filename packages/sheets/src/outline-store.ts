// Groups through the store (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline"): applying and
// undoing a depth, a collapse and the controls' side, and what deleting, moving and sorting lines do to groups.
// Groups belong to places (D164): lines moved or sorted leave their depths and marks where they stood.
import { depthsOf, linesOf, marksOf, type OutlineAxis } from './outline';
import type { GroupMark, SheetLayout } from './sheet';
import type { LayoutChange } from './store-layout';

type OutlineChange = Extract<LayoutChange, { k: 'depth' | 'collapse' | 'controls' }>;

const depthKey = (axis: OutlineAxis) => (axis === 'r' ? 'rowDepth' : 'colDepth');
const marksKey = (axis: OutlineAxis) => (axis === 'r' ? 'rowCollapsed' : 'colCollapsed');

const sameMark = (a: GroupMark, b: GroupMark) => a.at === b.at && a.depth === b.depth;

// An empty record or list is no field at all.
const orNone = <T extends object>(value: T): T | undefined =>
  Object.keys(value).length ? value : undefined;

function withField(layout: SheetLayout, key: keyof SheetLayout, value: unknown): SheetLayout {
  const out = { ...layout } as Record<string, unknown>;
  if (value === undefined) delete out[key];
  else out[key] = value;
  return out as SheetLayout;
}

/** The layout after a depth, collapse or controls change; lines no longer on the sheet are passed over. */
export function applyOutlineChange(layout: SheetLayout, ch: OutlineChange): SheetLayout {
  if (ch.k === 'controls') {
    const sides = { ...layout.controlsAfter };
    if (ch.after) sides[ch.axis] = true;
    else delete sides[ch.axis];
    return withField(layout, 'controlsAfter', orNone(sides));
  }
  const live = new Set(linesOf(layout, ch.axis));
  if (ch.k === 'depth') {
    const depths = { ...depthsOf(layout, ch.axis) };
    for (const [id, d] of Object.entries(ch.depths)) {
      if (!live.has(id)) continue;
      if (d > 0) depths[id] = d;
      else delete depths[id];
    }
    return withField(layout, depthKey(ch.axis), orNone(depths));
  }
  const marks = marksOf(layout, ch.axis);
  const m = { at: ch.at, depth: ch.depth };
  const has = marks.some((x) => sameMark(x, m));
  if (ch.collapsed === has || (ch.collapsed && !live.has(ch.at))) return layout;
  const next = ch.collapsed ? [...marks, m] : marks.filter((x) => !sameMark(x, m));
  return withField(layout, marksKey(ch.axis), next.length ? next : undefined);
}

/** The change that undoes `ch`, applied to `before`. */
export function inverseOutline(before: SheetLayout, ch: OutlineChange): LayoutChange[] {
  if (ch.k === 'controls')
    return [{ k: 'controls', axis: ch.axis, after: before.controlsAfter?.[ch.axis] === true }];
  if (ch.k === 'depth') {
    const was = depthsOf(before, ch.axis);
    const depths: Record<string, number> = {};
    for (const id of Object.keys(ch.depths)) depths[id] = was?.[id] ?? 0;
    return [{ k: 'depth', axis: ch.axis, depths }];
  }
  const had = marksOf(before, ch.axis).some((x) => sameMark(x, { at: ch.at, depth: ch.depth }));
  return had === ch.collapsed ? [] : [{ ...ch, collapsed: had }];
}

// A mark on a deleted line moves to the next line of its group that stays (else the one before), or goes with it.
function reanchor(
  m: GroupMark,
  list: readonly string[],
  depths: Readonly<Record<string, number>>,
  gone: ReadonlySet<string>,
): GroupMark | null {
  const i = list.indexOf(m.at);
  const inGroup = (j: number) => (depths[list[j]!] ?? 0) >= m.depth;
  for (let j = i + 1; j < list.length && inGroup(j); j++)
    if (!gone.has(list[j]!)) return { at: list[j]!, depth: m.depth };
  for (let j = i - 1; j >= 0 && inGroup(j); j--)
    if (!gone.has(list[j]!)) return { at: list[j]!, depth: m.depth };
  return null;
}

/** The outline fields after deleting `gone` lines of `axis`: their depths go, their marks move to a kept line. */
export function outlineAfterDelete(
  layout: SheetLayout,
  axis: OutlineAxis,
  gone: ReadonlySet<string>,
): Partial<SheetLayout> {
  const depths = depthsOf(layout, axis) ?? {};
  const marks = marksOf(layout, axis);
  const kept: Record<string, number> = {};
  for (const [id, d] of Object.entries(depths)) if (!gone.has(id)) kept[id] = d;
  const list = linesOf(layout, axis);
  const next = marks.flatMap((m) => {
    if (!gone.has(m.at)) return [m];
    const moved = reanchor(m, list, depths, gone);
    return moved ? [moved] : [];
  });
  return {
    [depthKey(axis)]: orNone(kept),
    [marksKey(axis)]: next.length ? next : undefined,
  };
}

/** What undoing a deletion of `ids` puts back: their depths, and the marks they held. */
export function restoreOutline(
  before: SheetLayout,
  axis: OutlineAxis,
  ids: ReadonlySet<string>,
): LayoutChange[] {
  const was = depthsOf(before, axis) ?? {};
  const depths: Record<string, number> = {};
  for (const id of ids) if (was[id]) depths[id] = was[id];
  const out: LayoutChange[] = Object.keys(depths).length ? [{ k: 'depth', axis, depths }] : [];
  for (const m of marksOf(before, axis))
    if (ids.has(m.at)) out.push({ k: 'collapse', axis, at: m.at, depth: m.depth, collapsed: true });
  return out;
}

/**
 * After lines were moved or sorted on `axis` (`after` holds the new order), the depths and marks stay with the
 * places: the line now at a place takes the depth the place had, and a mark the line now there (D164).
 */
export function outlineInPlace(
  before: SheetLayout,
  after: SheetLayout,
  axis: OutlineAxis,
): SheetLayout {
  const depths = depthsOf(before, axis);
  const marks = marksOf(before, axis);
  if (!depths && !marks.length) return after;
  const oldList = linesOf(before, axis);
  const newList = linesOf(after, axis);
  const placed: Record<string, number> = {};
  oldList.forEach((id, i) => {
    const d = depths?.[id];
    if (d) placed[newList[i]!] = d;
  });
  const pos = new Map(oldList.map((id, i) => [id, i]));
  const moved = marks.flatMap((m) => {
    const i = pos.get(m.at);
    return i === undefined ? [] : [{ at: newList[i]!, depth: m.depth }];
  });
  return {
    ...withField(after, depthKey(axis), orNone(placed)),
    ...(marks.length ? { [marksKey(axis)]: moved } : {}),
  };
}
