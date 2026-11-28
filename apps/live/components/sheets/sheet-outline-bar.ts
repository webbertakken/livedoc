// Where the outline bar draws each group (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline", D162,
// D165): a lane a depth across the band, a bracket along an expanded group's lines from its control to its far end,
// and its control on the line before it (or after it). Positions run along the axis from the cells' edge, scrolled as
// the headers are; pure, so the placement is tested without a DOM.
import {
  controlLine,
  controlsAfter,
  linesOf,
  outlineOf,
  type LineGroup,
  type OutlineAxis,
  type SheetLayout,
} from '@livedoc/sheets';
import { OUTLINE_DEPTH_PX, type Geometry } from './sheet-geometry';

export type OutlineMark = {
  group: LineGroup;
  // The lane's start across the band.
  lane: number;
  // An expanded group's bracket along the axis, null when collapsed or drawn at no length.
  bracket: { from: number; to: number; tickAt: 'from' | 'to' } | null;
  // The middle of its control's line along the axis; null when the group has none or that line is hidden.
  control: number | null;
};

/** The groups on one axis in a window `length` px long from the cells' edge, as the bar draws them. */
export function outlineMarks(
  g: Geometry,
  layout: SheetLayout,
  axis: OutlineAxis,
  scroll: { top: number; left: number },
  length: number,
): OutlineMark[] {
  const offs = axis === 'r' ? g.rows : g.cols;
  const frozen = axis === 'r' ? g.frozenRows : g.frozenCols;
  const shift = axis === 'r' ? scroll.top : scroll.left;
  const hidden = axis === 'r' ? g.hiddenRow : g.hiddenCol;
  // A row's place where it is drawn (data-tools.md "The drawn order"); the end line past the last its own number.
  const at = (i: number) => offs[axis === 'r' ? g.drawnOf(i) : i]! - (i < frozen ? 0 : shift);
  const after = controlsAfter(layout, axis);
  const count = linesOf(layout, axis).length;
  const out: OutlineMark[] = [];
  for (const group of outlineOf(layout, axis).groups) {
    const line = controlLine(group, after, count);
    const control = line === null || hidden(line) ? null : (at(line) + at(line + 1)) / 2;
    const start = at(group.from);
    const end = at(group.to + 1);
    // The bracket runs from the control to the group's far end, its tick there.
    const before = line !== null && line < group.from;
    const from = control !== null && before ? control : start;
    const to = control !== null && !before ? control : end;
    const bracket =
      group.collapsed || to - from <= 0 || end - start <= 0
        ? null
        : { from, to, tickAt: before ? ('to' as const) : ('from' as const) };
    const lo = Math.min(from, control ?? from);
    const hi = Math.max(to, control ?? to);
    if ((!bracket && control === null) || hi < 0 || lo > length) continue;
    out.push({ group, lane: (group.depth - 1) * OUTLINE_DEPTH_PX + 2, bracket, control });
  }
  return out;
}
