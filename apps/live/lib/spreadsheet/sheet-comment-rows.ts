// A spreadsheet's threads as the comments panel lists them (docs/specs/029-sheets/review.md "In the grid", D653): every
// thread of the workbook, by sheet in the sheet bar's order and within a sheet in reading order (rows, then columns),
// a thread whose cell was deleted last; each labelled by its sheet and range (`Budget!B4:C9`), grouped by its sheet.
import type { SheetThread } from '@livedoc/document';
import { threadAnchorAt, threadPlaceLabel, type SheetLayout } from '@livedoc/sheets';
import type { ReviewThreadRow } from '@/lib/office/review/comment-filters';
import { sharedComment, threadAssignee } from '@/lib/office/review/office-comments';

/** What a sheet gives the panel: its id, title and rows and columns, in the sheet bar's order. */
export type CommentSheet = {
  readonly id: string;
  readonly title: string;
  readonly layout: Pick<SheetLayout, 'rows' | 'cols'>;
};

/** What a row whose cell was deleted says in place of its place (D653). */
export const CELL_DELETED = 'The cell this comment was on was deleted';

export function sheetCommentRows(
  threads: Iterable<SheetThread>,
  sheets: readonly CommentSheet[],
): ReviewThreadRow[] {
  const order = new Map(sheets.map((s, i) => [s.id, i]));
  const placed: { rank: number; r: number; c: number; row: ReviewThreadRow }[] = [];
  for (const thread of threads) {
    const rank = order.get(thread.sheetId);
    if (rank === undefined) continue;
    const sheet = sheets[rank]!;
    const at = threadAnchorAt(sheet.layout, thread.anchor);
    const deleted = 'deleted' in at;
    placed.push({
      rank,
      r: deleted ? Number.MAX_SAFE_INTEGER : at.r1,
      c: deleted ? Number.MAX_SAFE_INTEGER : at.c1,
      row: {
        id: thread.id,
        label: threadPlaceLabel(sheet.title, sheet.layout, thread.anchor),
        deleted,
        resolved: thread.resolved,
        group: thread.sheetId,
        assignee: threadAssignee(thread),
        comments: thread.comments.map(sharedComment),
      },
    });
  }
  return placed.sort((a, b) => a.rank - b.rank || a.r - b.r || a.c - b.c).map(({ row }) => row);
}

/** The panel's sheet list: each sheet by its title. */
export const sheetGroups = (sheets: readonly CommentSheet[]): { id: string; label: string }[] =>
  sheets.map((s) => ({ id: s.id, label: s.title }));
