// A sheet's cells by rows (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Loading by viewport): the cells of
// the rows at positions [from, to) in the sheet's order, read by row id so the primary key (document, sheet, row,
// col) seeks each row. The rev and the cells are read in one batch, so a page is exactly the sheet at its rev.

import { RowSpan, type SheetJson } from '@livedoc/sheets';
import type { DocumentEnv } from '../types';
import { CELL_COLUMNS, headToJson, readSheetHead, type CellRow, type SheetHead } from './sheets';

// A write landing between the head's read and the cells' is read again: this many times, then the sheet is busy.
// 2 to 5.
export const ROW_PAGE_READS = 3;

export type RowPage = { head: SheetHead; span: RowSpan; cells: CellRow[] };

/** The cells of `rows` of a sheet as it stands, `rows` clamped to its row count; null when there is no such sheet,
 * 'busy' when writes kept landing between the reads. */
export async function readRowPage(
  env: DocumentEnv,
  documentId: string,
  sheetId: string,
  rows: RowSpan,
  head?: SheetHead,
): Promise<RowPage | 'busy' | null> {
  let at = head ?? null;
  for (let read = 0; read < ROW_PAGE_READS; read++) {
    at ??= await readSheetHead(env, documentId, sheetId);
    if (!at) return null;
    const span = RowSpan.clamp(rows, at.layout.rows.length);
    const ids = at.layout.rows.slice(span.from, span.to);
    const [rev, cells] = await env.DOCUMENT_DB.batch([
      env.DOCUMENT_DB.prepare('SELECT rev FROM sheets WHERE document_id = ? AND id = ?').bind(
        documentId,
        sheetId,
      ),
      env.DOCUMENT_DB.prepare(
        `SELECT ${CELL_COLUMNS} FROM sheet_cells c
          WHERE c.document_id = ? AND c.sheet_id = ? AND c.row_id IN (SELECT value FROM json_each(?))`,
      ).bind(documentId, sheetId, JSON.stringify(ids)),
    ]);
    const now = (rev?.results?.[0] as { rev?: number } | undefined)?.rev;
    if (now === undefined) return null;
    if (now === at.rev) return { head: at, span, cells: (cells?.results ?? []) as CellRow[] };
    console.info('[sheets] cells.page.reread', { read });
    at = null;
  }
  return 'busy';
}

/** A page's sheet as JSON: its head with the page's cells. */
export function rowPageJson(page: RowPage): SheetJson {
  return headToJson(page.head, page.cells);
}
