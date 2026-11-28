// Where a comment thread's anchor stands on its sheet (docs/specs/029-sheets/review.md "Where a thread lives", D653):
// its range while all four of its ids are on the sheet, its top-left cell alone when a corner is gone, deleted once
// its top-left cell's row or column is; and the label the Comments panel and the Inbox give it.
import { formatRange, type GridRange } from './address';
import type { IdRange, SheetLayout } from './sheet';

/** The anchor's place now, or `deleted`. */
export function threadAnchorAt(
  layout: Pick<SheetLayout, 'rows' | 'cols'>,
  anchor: IdRange,
): GridRange | { deleted: true } {
  const r1 = layout.rows.indexOf(anchor.r1);
  const c1 = layout.cols.indexOf(anchor.c1);
  if (r1 < 0 || c1 < 0) return { deleted: true };
  const r2 = layout.rows.indexOf(anchor.r2);
  const c2 = layout.cols.indexOf(anchor.c2);
  if (r2 < r1 || c2 < c1) return { r1, c1, r2: r1, c2: c1 };
  return { r1, c1, r2, c2 };
}

/** A thread's place by its sheet's title: `Budget!B4:C9`, or `Budget (deleted cell)` once its cell has gone. */
export function threadPlaceLabel(
  title: string,
  layout: Pick<SheetLayout, 'rows' | 'cols'>,
  anchor: IdRange,
): string {
  const at = threadAnchorAt(layout, anchor);
  return 'deleted' in at ? `${title} (deleted cell)` : `${title}!${formatRange(at)}`;
}
