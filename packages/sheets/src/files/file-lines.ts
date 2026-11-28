// Rows and columns as a file holds them (docs/specs/029-sheets/standard-mapping.md "Rows and columns in the file"):
// by position, each line's own size in pixels, whether it is hidden by hand and its group depth, the collapsed groups,
// the controls' side and the sheet's own line size. The bridge between the model's layout (lines by id) and each
// format's reader and writer, so neither format sees an id and both read a collapsed group the same way (D124, D168).
import {
  AXIS_SIZE_MAX,
  COLUMN_WIDTH_MIN,
  COLUMN_WIDTH_NEW,
  OUTLINE_DEPTH_MAX,
  ROW_HEIGHT_MIN,
  ROW_HEIGHT_NEW,
} from '../limits';
import { depthsOf, groupsOf, marksOf, type OutlineAxis } from '../outline';
import type { GroupMark, SheetLayout } from '../sheet';

/**
 * One line's own: its size in pixels, hidden by hand, hidden by the sheet's filter (a row, standard-mapping.md
 * "Filters in the file"), its group depth (1 to 7); absent is none.
 */
export type FileLine = { size?: number; hidden?: true; filtered?: true; depth?: number };

/** Lines with the rows the sheet's filter hides marked so; none when it hides none. */
export function withFilteredRows(
  lines: FileLines | undefined,
  rows: readonly number[],
): FileLines | undefined {
  if (rows.length === 0) return lines;
  const axis = lines?.r;
  const out = new Map<number, FileLine>(axis?.lines ?? []);
  for (const p of rows) out.set(p, { ...out.get(p), filtered: true });
  return { ...lines, r: { ...(axis ?? { collapsed: [] }), lines: out } };
}

/** Lines with the rows a file's filter hides (`rows`, hidden there) read as the filter's, not hidden by hand. */
export function filteredFromHidden(
  lines: FileLines | undefined,
  rows: (p: number) => boolean,
): FileLines | undefined {
  const axis = lines?.r;
  if (!axis) return lines;
  const out = new Map<number, FileLine>();
  for (const [p, line] of axis.lines) {
    if (!line.hidden || !rows(p)) {
      out.set(p, line);
      continue;
    }
    const { hidden: _, ...rest } = line;
    out.set(p, { ...rest, filtered: true });
  }
  return { ...lines, r: { ...axis, lines: out } };
}

/** A collapsed group, by a line in it and its depth. */
export type FileGroupMark = { at: number; depth: number };

/** One axis's lines: those with anything of their own by position, the collapsed groups, the controls' side. */
export type FileAxisLines = {
  lines: ReadonlyMap<number, FileLine>;
  collapsed: readonly FileGroupMark[];
  // The controls sit after their groups (else before them, Google's default).
  after?: true;
  // The sheet's own size for a line of this axis, in pixels; none is the format's own.
  size?: number;
};

export type FileLines = { r?: FileAxisLines; c?: FileAxisLines };

/** Where a line starts, in px: the sizes of the lines before it, a hidden one none; `size` the format's own. */
export function lineStartPx(axis: FileAxisLines | undefined, at: number, size: number): number {
  let px = 0;
  for (let p = 0; p < at; p++) {
    const line = axis?.lines.get(p);
    if (!line?.hidden) px += line?.size ?? axis?.size ?? size;
  }
  return px;
}

/** A line's size in px: its own, else the sheet's, else `size`, the format's own. */
export function lineSizePx(axis: FileAxisLines | undefined, at: number, size: number): number {
  return axis?.lines.get(at)?.size ?? axis?.size ?? size;
}

/**
 * The line a position in px falls on and how far into it, `lineStartPx`'s inverse: a hidden line is never the one;
 * the axis's end (`count` lines) holds what lies past it.
 */
export function lineAtPx(
  axis: FileAxisLines | undefined,
  px: number,
  size: number,
  count: number,
): { at: number; offset: number } {
  let start = 0;
  let last = { at: 0, offset: Math.max(0, px) };
  for (let p = 0; p < count; p++) {
    const line = axis?.lines.get(p);
    if (line?.hidden) continue;
    const own = line?.size ?? axis?.size ?? size;
    last = { at: p, offset: Math.max(0, px - start) };
    if (px < start + own) return last;
    start += own;
  }
  return last;
}

/** A group as positions, and whether it is collapsed. */
export type FileGroup = { depth: number; from: number; to: number; collapsed: boolean };

/** An axis's groups, outer first, each collapsed when a mark falls inside it at its depth. */
export function fileGroups(axis: FileAxisLines): FileGroup[] {
  const depths = new Map<number, number>();
  for (const [p, line] of axis.lines) if (line.depth) depths.set(p, line.depth);
  return groupsOf(depths).map((g) => ({
    ...g,
    collapsed: axis.collapsed.some((m) => m.depth === g.depth && m.at >= g.from && m.at <= g.to),
  }));
}

/** The lines inside collapsed groups: hidden by their groups. */
export function collapsedLines(groups: readonly FileGroup[]): Set<number> {
  const out = new Set<number>();
  for (const g of groups) if (g.collapsed) for (let p = g.from; p <= g.to; p++) out.add(p);
  return out;
}

function axisOf(layout: SheetLayout, axis: OutlineAxis): FileAxisLines {
  const ids = axis === 'r' ? layout.rows : layout.cols;
  const sizes = axis === 'r' ? layout.rowSize : layout.colSize;
  const hidden = new Set(axis === 'r' ? layout.hiddenRows : layout.hiddenCols);
  const depths = depthsOf(layout, axis);
  const lines = new Map<number, FileLine>();
  ids.forEach((id, p) => {
    const line: FileLine = {};
    const size = sizes?.[id];
    if (size !== undefined) line.size = size;
    if (hidden.has(id)) line.hidden = true;
    const depth = depths?.[id];
    if (depth) line.depth = depth;
    if (line.size !== undefined || line.hidden || line.depth) lines.set(p, line);
  });
  const pos = new Map(ids.map((id, p) => [id, p]));
  const collapsed = marksOf(layout, axis).flatMap((m) => {
    const at = pos.get(m.at);
    return at === undefined ? [] : [{ at, depth: m.depth }];
  });
  const size =
    axis === 'r' ? (layout.rowHeight ?? ROW_HEIGHT_NEW) : (layout.colWidth ?? COLUMN_WIDTH_NEW);
  return {
    lines,
    collapsed,
    ...(layout.controlsAfter?.[axis] ? { after: true as const } : {}),
    size,
  };
}

/** A sheet's rows and columns as its file holds them. */
export function fileLinesOf(layout: SheetLayout): Required<FileLines> {
  return { r: axisOf(layout, 'r'), c: axisOf(layout, 'c') };
}

/** The layout's fields a file's lines make, and whether sized lines past the most a sheet holds were cut. */
export type LinesRead = { layout: Partial<SheetLayout>; cut: boolean };

const AXIS_FIELDS = {
  r: {
    size: 'rowSize',
    hidden: 'hiddenRows',
    depth: 'rowDepth',
    marks: 'rowCollapsed',
    own: 'rowHeight',
  },
  c: {
    size: 'colSize',
    hidden: 'hiddenCols',
    depth: 'colDepth',
    marks: 'colCollapsed',
    own: 'colWidth',
  },
} as const;

// A size in a file, whole and within what the Resize dialog allows (D158).
const fitted = (axis: OutlineAxis, px: number) =>
  Math.min(
    AXIS_SIZE_MAX,
    Math.max(axis === 'r' ? ROW_HEIGHT_MIN : COLUMN_WIDTH_MIN, Math.round(px)),
  );

/**
 * What a file's lines make of a sheet whose lines are `layout`'s: lines past its grid left out; a line at the sheet's
 * own size takes it (D124); a line inside a collapsed group hidden by its group alone (D168); at most `sizedMax`
 * sized lines, rows first.
 */
export function layoutFromLines(
  lines: FileLines | undefined,
  layout: Pick<SheetLayout, 'rows' | 'cols' | 'rowHeight' | 'colWidth'>,
  sizedMax: number,
): LinesRead {
  const out: Record<string, unknown> = {};
  let sized = 0;
  let cut = false;
  for (const axis of ['r', 'c'] as const) {
    const read = lines?.[axis];
    if (!read) continue;
    const ids = axis === 'r' ? layout.rows : layout.cols;
    const fields = AXIS_FIELDS[axis];
    const own = read.size === undefined ? undefined : fitted(axis, read.size);
    // The made sheet's own sizes, else a Plan Sheet's.
    const fallback =
      axis === 'r' ? (layout.rowHeight ?? ROW_HEIGHT_NEW) : (layout.colWidth ?? COLUMN_WIDTH_NEW);
    if (own !== undefined && own !== fallback) out[fields.own] = own;
    const groups = fileGroups(read);
    const folded = collapsedLines(groups);
    const sizes: Record<string, number> = {};
    const hidden: string[] = [];
    const depths: Record<string, number> = {};
    for (const [p, line] of read.lines) {
      const id = ids[p];
      if (id === undefined) continue;
      const size = line.size === undefined ? undefined : fitted(axis, line.size);
      if (size !== undefined && size !== (own ?? fallback)) {
        if (sized < sizedMax) {
          sizes[id] = size;
          sized++;
        } else cut = true;
      }
      if (line.hidden && !folded.has(p)) hidden.push(id);
      if (line.depth) depths[id] = Math.min(OUTLINE_DEPTH_MAX, line.depth);
    }
    const marks: GroupMark[] = groups.flatMap((g) =>
      g.collapsed && ids[g.from] !== undefined ? [{ at: ids[g.from]!, depth: g.depth }] : [],
    );
    if (Object.keys(sizes).length) out[fields.size] = sizes;
    if (hidden.length) out[fields.hidden] = hidden;
    if (Object.keys(depths).length) out[fields.depth] = depths;
    if (marks.length) out[fields.marks] = marks;
    if (read.after && groups.length) {
      const sides = (out.controlsAfter ?? {}) as Record<string, true>;
      out.controlsAfter = { ...sides, [axis]: true };
    }
  }
  return { layout: out, cut };
}
