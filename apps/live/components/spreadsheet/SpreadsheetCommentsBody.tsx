'use client';

// The Comments panel's body of a spreadsheet (docs/specs/029-sheets/review.md "In the grid", D653): every thread of the
// workbook, each row labelled by its sheet and range and grouped by its sheet, in the sheet bar's order then reading
// order; All / For you and All / Open / Resolved; a press opens the thread on its sheet, Reopen brings a resolved one
// back. The shell's OfficeCommentsPanel draws it.
import { OfficeCommentsPanel } from '@/components/office/review/OfficeCommentsPanel';
import { readWorkbook } from '@/components/sheets/read-workbook';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { commentNoteOf } from '@/lib/office/review/office-comments';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import { CELL_DELETED, sheetCommentRows, sheetGroups } from '@/lib/spreadsheet/sheet-comment-rows';
import { useSpreadsheetReview } from './spreadsheet-review-context';
import type { SpreadsheetComments } from './useSpreadsheetComments';

const SHEET_GROUPS = { which: 'Which sheet', all: 'All sheets' } as const;

const addHint = (): string =>
  `Select a cell and press ${currentOfficePlatform().platform === 'mac' ? '⌘⌥M' : 'Ctrl+Alt+M'} to comment.`;

export function SpreadsheetCommentsBody({ comments }: { comments: SpreadsheetComments }) {
  const c = useSheetController();
  const { commenter, selfUserId, tabOrder } = useSpreadsheetReview();
  // Read under the store's version (read-workbook.ts): the sheets' titles and rows place each thread.
  const { rows, groups } = readWorkbook(c.version, () => {
    const rank = new Map((tabOrder ?? []).map((id, i) => [id, i]));
    const sheets = c.workbook
      .sheetList()
      .map((s) => ({ id: s.id, title: s.title, layout: s.layout, tab: s.tabId }))
      .sort(
        (a, b) =>
          (rank.get(a.tab) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.tab) ?? Number.MAX_SAFE_INTEGER),
      );
    return {
      rows: sheetCommentRows(comments.threads.values(), sheets),
      groups: sheetGroups(sheets),
    };
  });
  return (
    <OfficeCommentsPanel
      rows={rows}
      groups={groups}
      self={{ key: commenter?.key ?? '', userId: selfUserId }}
      canComment={commenter !== null}
      filters={comments.filters}
      onFilters={comments.setFilters}
      onGo={comments.go}
      onReopen={comments.reopen}
      addHint={addHint()}
      noteOf={commentNoteOf}
      deletedLine={CELL_DELETED}
      groupWords={SHEET_GROUPS}
    />
  );
}
