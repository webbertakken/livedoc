// Which rows of a long list are drawn (docs/specs/013-workspace/explorer-structure.md "Long lists"). Pure: the hook
// measures the rows and the view, this decides. Rows are uniform: `stride` is the distance from one row's top to the
// next's, `gap` the space between two rows inside it, `origin` the top of row 0 in the scroller's content.

/** How far past each edge of the view rows are drawn (D223): about a screen. */
export const LIST_OVERSCAN_PX = 800;
/** Rows are drawn and dropped in blocks of this many (D223), so scrolling redraws a block at a time. */
export const LIST_BLOCK_ROWS = 10;
/** A list of this many entries or fewer is drawn whole (D223): small lists never pay for windowing. */
export const LIST_WINDOW_FROM = 60;

export type RowRange = { first: number; last: number };
export type RowGeometry = { rows: number; stride: number; origin: number };
export type WindowSegment =
  { kind: 'items'; from: number; to: number } | { kind: 'gap'; key: string; height: number };

/** The row under `offset` (in the scroller's content), clamped to the list. */
export function rowAtOffset({ rows, stride, origin }: RowGeometry, offset: number): number {
  return Math.min(rows - 1, Math.max(0, Math.floor((offset - origin) / stride)));
}

/** The rows to draw for a view, `[first, last)`, whole blocks of `blockRows`, never empty for a non-empty list. */
export function drawnRowRange({
  rows,
  stride,
  origin,
  view,
  overscanPx = LIST_OVERSCAN_PX,
  blockRows = LIST_BLOCK_ROWS,
}: RowGeometry & {
  view: { top: number; bottom: number };
  overscanPx?: number;
  blockRows?: number;
}): RowRange {
  if (rows <= 0) return { first: 0, last: 0 };
  const from = Math.floor((view.top - overscanPx - origin) / stride);
  const to = Math.ceil((view.bottom + overscanPx - origin) / stride);
  if (to <= 0) return { first: 0, last: Math.min(rows, blockRows) };
  if (from >= rows) {
    const first = Math.floor((rows - 1) / blockRows) * blockRows;
    return { first, last: rows };
  }
  return {
    first: Math.max(0, Math.floor(from / blockRows) * blockRows),
    last: Math.min(rows, Math.ceil(to / blockRows) * blockRows),
  };
}

/**
 * What a list renders: runs of drawn entries, and between them room of the rows not drawn. The leading entries (a
 * view's folders) and the pinned entry's row (focus, a drag) are always drawn; a list of `windowFrom` entries or fewer
 * is drawn whole. A run of k rows not drawn is `k * stride - gap` tall: it stands in a row's place, gaps either side.
 */
export function windowSegments({
  count,
  lanes,
  leading,
  pinned,
  range,
  stride,
  gap,
  windowFrom = LIST_WINDOW_FROM,
}: {
  count: number;
  lanes: number;
  leading: number;
  pinned: number | null;
  range: RowRange;
  stride: number;
  gap: number;
  windowFrom?: number;
}): WindowSegment[] {
  if (count <= 0) return [];
  if (count <= windowFrom) return [{ kind: 'items', from: 0, to: count }];
  const rows = Math.ceil(count / lanes);
  const runs: RowRange[] = [];
  if (leading > 0) runs.push({ first: 0, last: Math.ceil(leading / lanes) });
  if (pinned !== null && pinned >= 0 && pinned < count) {
    const row = Math.floor(pinned / lanes);
    runs.push({ first: row, last: row + 1 });
  }
  runs.push({ first: Math.max(0, range.first), last: Math.min(rows, range.last) });
  runs.sort((a, b) => a.first - b.first);
  const merged: RowRange[] = [];
  for (const run of runs) {
    if (run.last <= run.first) continue;
    const prev = merged.at(-1);
    if (prev && run.first <= prev.last) prev.last = Math.max(prev.last, run.last);
    else merged.push({ ...run });
  }
  const segments: WindowSegment[] = [];
  let row = 0;
  const room = (first: number, last: number) =>
    segments.push({ kind: 'gap', key: `gap-${first}`, height: (last - first) * stride - gap });
  for (const run of merged) {
    if (run.first > row) room(row, run.first);
    segments.push({
      kind: 'items',
      from: run.first * lanes,
      to: Math.min(count, run.last * lanes),
    });
    row = run.last;
  }
  if (row < rows) room(row, rows);
  return segments;
}

/** How many rows a frame may add: the rest come on the frames after, so no frame's work grows long (D226). */
export const LIST_ROWS_PER_FRAME = 8;

/**
 * One frame's step from the rows drawn towards the rows wanted: rows the target no longer holds go at once; new rows
 * come at most `maxNew` a frame, those in view first (the side below before the side above), then the rest of the
 * target, below then above. A target out of reach of what is drawn (a jump) starts again at the view.
 */
export function stepTowards(
  current: RowRange,
  target: RowRange,
  visible: RowRange,
  maxNew: number,
): RowRange {
  const view = {
    first: Math.max(target.first, visible.first),
    last: Math.min(target.last, visible.last),
  };
  let first = Math.max(current.first, target.first);
  let last = Math.min(current.last, target.last);
  if (last <= first || last < view.first || first > view.last) {
    first = view.first;
    last = view.first;
  }
  let budget = maxNew;
  const grow = (side: 'down' | 'up', limit: number) => {
    if (side === 'down') {
      const add = Math.min(budget, Math.max(0, limit - last));
      last += add;
      budget -= add;
    } else {
      const add = Math.min(budget, Math.max(0, first - limit));
      first -= add;
      budget -= add;
    }
  };
  grow('down', view.last);
  grow('up', view.first);
  grow('down', target.last);
  grow('up', target.first);
  return { first, last };
}
