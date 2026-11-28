// A spreadsheet's comment threads in the grid (docs/specs/029-sheets/review.md "In the grid", D644, D656): the item that
// opens a thread's card, the marker an anchored cell draws, the threads by the cell they are anchored to, the anchor a
// selection gives a new thread, and the words a refusal is told in.
import type { SheetThread, SheetThreadAnchor } from '@livedoc/document';
import { cellKey, threadAnchorAt, type GridRange, type SheetLayout } from '@livedoc/sheets';

/** Insert › Comment, the toolbar's Insert Comment, the cell menu's Comment and Ctrl+Alt+M. */
export const INSERT_COMMENT = 'insert-comment';

/** A comment marker's colour: the comment colour, as Plan's cell threads draw theirs. */
export const COMMENT_MARKER_COLOUR = '#f59e0b';

/** Why Insert › Comment is dimmed on a spreadsheet in This Browser (D656). */
export const SYNC_TO_COMMENT = 'Sync this spreadsheet to comment on it';
export const SYNC_TO_COMMENT_NOTE = 'Sync to comment';

/** A comment thread's top-left cell's key, by its anchor's ids: where its marker draws. */
export const anchorCellKey = (anchor: SheetThreadAnchor): string => cellKey(anchor.r1, anchor.c1);

/**
 * The open threads of a sheet by their anchor's top-left cell (`cellKey`); where two are anchored to one cell, the one
 * begun first. A resolved thread draws no marker.
 */
export function openThreadsByCell(
  threads: Iterable<SheetThread>,
  sheetId: string,
): ReadonlyMap<string, SheetThread> {
  const byCell = new Map<string, SheetThread>();
  for (const thread of threads) {
    if (thread.sheetId !== sheetId || thread.resolved) continue;
    const key = anchorCellKey(thread.anchor);
    const held = byCell.get(key);
    if (!held || begunAt(thread) < begunAt(held)) byCell.set(key, thread);
  }
  return byCell;
}

const begunAt = (thread: SheetThread): number => thread.comments[0]?.at ?? 0;

/**
 * The anchor a new thread on `range` takes, by row and column ids: a merged area at its top-left is taken whole (a
 * merged area's thread is its top-left cell's). Null when the range is off the sheet.
 */
export function anchorOfRange(
  layout: Pick<SheetLayout, 'rows' | 'cols'>,
  range: GridRange,
  mergeAt: (r: number, c: number) => GridRange | null,
): SheetThreadAnchor | null {
  const merge = mergeAt(range.r1, range.c1);
  const r1 = merge ? merge.r1 : range.r1;
  const c1 = merge ? merge.c1 : range.c1;
  const r2 = Math.max(range.r2, merge ? merge.r2 : range.r2);
  const c2 = Math.max(range.c2, merge ? merge.c2 : range.c2);
  const ids = [layout.rows[r1], layout.cols[c1], layout.rows[r2], layout.cols[c2]];
  const [ar1, ac1, ar2, ac2] = ids;
  if (ar1 === undefined || ac1 === undefined || ar2 === undefined || ac2 === undefined) return null;
  return { r1: ar1, c1: ac1, r2: ar2, c2: ac2 };
}

/** A sheet's open threads whose cells are on it, in reading order (rows, then columns), each with its range now. */
export function threadsInReadingOrder(
  layout: Pick<SheetLayout, 'rows' | 'cols'>,
  byCell: ReadonlyMap<string, SheetThread>,
): { thread: SheetThread; range: GridRange }[] {
  const placed: { thread: SheetThread; range: GridRange }[] = [];
  for (const thread of byCell.values()) {
    const range = threadAnchorAt(layout, thread.anchor);
    if (!('deleted' in range)) placed.push({ thread, range });
  }
  return placed.sort((a, b) => a.range.r1 - b.range.r1 || a.range.c1 - b.range.c1);
}

/**
 * The thread after (or before) a cell in reading order, wrapping past either end (Ctrl+Alt+N, C; J and K); a thread
 * anchored to the cell itself is passed over. Null when the sheet has none.
 */
export function steppedThread<T extends { range: GridRange }>(
  ordered: readonly T[],
  from: { r: number; c: number },
  forward: boolean,
): T | null {
  const after = (t: T) => t.range.r1 > from.r || (t.range.r1 === from.r && t.range.c1 > from.c);
  const before = (t: T) => t.range.r1 < from.r || (t.range.r1 === from.r && t.range.c1 < from.c);
  if (forward) return ordered.find(after) ?? ordered[0] ?? null;
  return ordered.findLast(before) ?? ordered.at(-1) ?? null;
}

/** What a refused thread write tells the person, by the api's code. */
export function threadRefusalWords(code: string): string {
  switch (code) {
    case 'thread_gone':
      return 'That comment is no longer there';
    case 'threads_full':
      return 'This sheet holds the most comments it can';
    case 'thread_full':
      return 'This comment thread holds the most replies it can';
    case 'forbidden':
      return 'You can no longer comment on this spreadsheet';
    case 'thread_invalid':
      return 'That comment could not be saved';
    default:
      return 'Your comment could not be sent. Try again.';
  }
}

/** The hover card's line under a thread's first comment: how many more it holds. */
export const moreCommentsLabel = (thread: SheetThread): string | null => {
  const more = thread.comments.length - 1;
  return more > 0 ? `${more} more` : null;
};
